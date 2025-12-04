"""
API Blueprint - 핵심 울음 분석 엔드포인트 및 FastAPI 라우트 호환 모듈
app.py의 메인 기능을 보완하는 레거시 호환 라우트와 최신 FastAPI 라우트를 포함합니다.

✅ 수정 사항 (2024):
- upload_audio에 상세한 오디오 메타정보 로깅 추가
- 업로드 파일과 녹음 파일의 차이 분석을 위한 디버깅 정보 강화
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from backend.models.classifier import CryClassifier
from pathlib import Path
import os
from datetime import datetime
import json
import librosa
import numpy as np  # ✅ 추가: RMS 계산을 위해 필요
import time
import traceback
import requests
from requests.exceptions import ReadTimeout
from backend.services.chatbot_service import ChatbotService

# FastAPI Imports
from fastapi import APIRouter
from fastapi import Query, File, UploadFile, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
load_dotenv()

NOTIFICATION_URL = os.getenv(
    "NOTIFICATION_URL",
    "http://localhost:4000/api/analysis/result"
)

# ✅ 새로 추가: 이벤트 저장 URL
EVENT_SAVE_URL = os.getenv(
    "EVENT_SAVE_URL",
    "http://localhost:4000/api/events/create"
)

try:
    from backend.services.music_service import get_music_service
    MUSIC_SERVICE_AVAILABLE = True
except ImportError:
    MUSIC_SERVICE_AVAILABLE = False
    print("⚠️ LocalMusicService not available. Music playback will be skipped.")

# StorageManager import
try:
    from backend.utils.storage_manager import get_storage_manager
    STORAGE_MANAGER_AVAILABLE = True
except ImportError:
    STORAGE_MANAGER_AVAILABLE = False
    print("⚠️ StorageManager not available in Blueprint. Falling back to JSON history.")


# ✅ 수정: 이벤트를 Oracle DB에 저장하는 함수
def save_event_to_db(event_data):
    """
    Node 백엔드로 이벤트 데이터를 전송하여 Oracle DB에 저장
    """
    try:
        payload = {
            "infant_id": event_data.get("infant_id"),
            "guardian_id": event_data.get("guardian_id"),
            "reason": event_data.get("reason"),
            "severity": event_data.get("severity", "Medium"),
            "confidence": event_data.get("confidence", 0.5),
            "duration": event_data.get("duration", 3),
            "timestamp": event_data.get("timestamp"),
        }

        print(f"💾 이벤트 저장 요청: {EVENT_SAVE_URL}")
        print(f"   payload: {payload}")
        
        response = requests.post(
            EVENT_SAVE_URL,
            json=payload,
            timeout=(3, 10),
        )
        
        if response.status_code == 200:
            result = response.json()
            event_id = result.get("event_id")
            print(f"✅ 이벤트 저장 완료: event_id={event_id}")
            return event_id
        else:
            print(f"❌ 이벤트 저장 실패: {response.status_code}")
            print(f"   응답: {response.text}")
            return None

    except ReadTimeout:
        print("⚠️ 이벤트 저장 타임아웃")
        return None
    except Exception as e:
        print(f"❌ 이벤트 저장 실패: {e}")
        traceback.print_exc()
        return None


# ✅ 수정: event_id를 받아서 알림을 보내도록 변경
def notify_node_backend(event_id, event_data):
    """
    Node 알림 서버로 분석 결과 전달 (GPT 추천 생성용)
    """
    try:
        if not event_id:
            print("⚠️ event_id 없음, Node 알림 생략")
            return

        payload = {
            "cryEventId": event_id,
            "infantId": event_data.get("infant_id", 1),
            "isCrying": event_data.get("isCrying", False),
            "cause": event_data.get("reason", "unknown"),
            "severity": event_data.get("severity", "Unknown"),
        }

        print(f"📨 Node 알림 서버 호출: {NOTIFICATION_URL}")
        print(f"   payload: {payload}")
        
        response = requests.post(
            NOTIFICATION_URL,
            json=payload,
            timeout=(3, 10),
        )
        print(f"✅ Node 응답 코드: {response.status_code}")

    except ReadTimeout:
        print("⚠️ Node 알림 서버 응답 타임아웃(하지만 요청은 전송됨)")

    except Exception as e:
        print(f"⚠️ Node 알림 서버 호출 실패: {e}")


# --- 전역 상수 및 초기화 ---

# 프로젝트 루트 경로 (파일 위치에서 3단계 위)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
# FastAPI 파일 저장을 위한 경로 정의
UPLOADS_PATH = PROJECT_ROOT / 'uploads'
os.makedirs(UPLOADS_PATH, exist_ok=True)

# FastAPI APIRouter 정의
router = APIRouter(prefix="/api", tags=["api"])

# 전역 classifier 인스턴스 (싱글톤)
_classifier_instance = None

chatbot = ChatbotService()

# --- Helper Functions ---

def get_classifier():
    """Classifier 싱글톤 - 한 번만 로드"""
    global _classifier_instance
    
    if _classifier_instance is None:
        model_path = PROJECT_ROOT / 'models' / 'baby_cry_v15_1_detector.pkl'
        sensitivity = os.getenv('CRY_SENSITIVITY', 'balanced')
        
        print(f"🔧 [Blueprint] Initializing V15.1 Classifier...")
        print(f"   Sensitivity: {sensitivity}")
        
        _classifier_instance = CryClassifier(
            str(PROJECT_ROOT / 'Dataset'),
            sensitivity=sensitivity
        )
        _classifier_instance.load_model(str(model_path))
    
    return _classifier_instance

def get_recommended_actions(reason, severity):
    """원인에 따른 조치 추천"""
    action_map = {
        'hungry': [
            {'action_type': 'feeding', 'detail': '수유하기 (마지막 수유 후 2-3시간 경과 확인)', 'priority': 1},
            {'action_type': 'check_diaper', 'detail': '기저귀 확인', 'priority': 2}
        ],
        'burping': [
            {'action_type': 'burping', 'detail': '등을 두드려 트림 시키기', 'priority': 1},
            {'action_type': 'position', 'detail': '세워서 안아주기', 'priority': 2}
        ],
        'belly_pain': [
            {'action_type': 'massage', 'detail': '배를 시계방향으로 부드럽게 마사지', 'priority': 1},
            {'action_type': 'medical', 'detail': '🚨 증상이 심하면 즉시 소아과 상담', 'priority': 2},
            {'action_type': 'warmth', 'detail': '따뜻한 수건 배에 대주기', 'priority': 3}
        ],
        'tired': [
            {'action_type': 'sleep_environment', 'detail': '조용하고 어두운 환경 만들기', 'priority': 1},
            {'action_type': 'soothing', 'detail': '부드럽게 흔들며 달래기', 'priority': 2},
            {'action_type': 'white_noise', 'detail': '백색소음 들려주기', 'priority': 3}
        ],
        'cold_hot': [
            {'action_type': 'temperature', 'detail': '체온 및 실내온도 확인 (적정: 20-22°C)', 'priority': 1},
            {'action_type': 'clothing', 'detail': '옷 두께 조절하기', 'priority': 2}
        ],
        'discomfort': [
            {'action_type': 'check_all', 'detail': '전반적인 불편 요소 점검', 'priority': 1},
            {'action_type': 'position', 'detail': '자세 바꿔주기', 'priority': 2},
            {'action_type': 'comfort', 'detail': '안아서 달래주기', 'priority': 3}
        ],
        'emotional': [
            {'action_type': 'comfort', 'detail': '안정감과 애정 표현하기', 'priority': 1},
            {'action_type': 'attention', 'detail': '눈 맞추고 말 걸어주기', 'priority': 2},
            {'action_type': 'play', 'detail': '가벼운 놀이나 노래', 'priority': 3}
        ]
    }
    
    actions = action_map.get(reason, [
        {'action_type': 'check_all', 'detail': '전반적인 상태 확인', 'priority': 1}
    ])
    
    if severity == 'high':
        actions.insert(0, {
            'action_type': 'urgent',
            'detail': '⚠️ 즉시 아기 상태 확인 필요',
            'priority': 0
        })
    
    return actions

# ====================================================================
# ## FastAPI APIRouter 라우트
# ====================================================================

@router.get("/health")
async def health():
    return {"status": "ok", "backend": "python", "model_loaded": _classifier_instance is not None}

@router.post("/upload")
async def upload_audio(
    audio: UploadFile = File(...), 
    infant_id: int = Query(0, description="Infant ID"),
    guardian_id: int = Query(0, description="Guardian ID"),
    sensitivity: str = Query("balanced", description="Sensitivity level")
):
    """
    FastAPI 기반 오디오 업로드 및 분석 엔드포인트
    
    ✅ 수정 사항:
    - 상세한 오디오 메타정보 로깅 추가
    - 업로드/녹음 파일 차이 분석을 위한 디버깅 정보 강화
    """
    dest = None
    try:
        if not audio or not audio.filename:
            raise HTTPException(status_code=400, detail="no_file")

        # ✅ 디버깅 로그
        print(f"📥 받은 파라미터:")
        print(f"  - infant_id: {infant_id}")
        print(f"  - guardian_id: {guardian_id}")
        print(f"  - sensitivity: {sensitivity}")
        print(f"  - filename: {audio.filename}")
        
        # ✅ infant_id 검증
        if infant_id == 0:
            raise HTTPException(status_code=400, detail="infant_id is required")

        # 파일 저장
        timestamp = int(time.time()*1000)
        dest = UPLOADS_PATH / f"{timestamp}_{Path(audio.filename).name}"
        
        with dest.open("wb") as f:
            f.write(await audio.read())
        
        print(f"✅ 파일 저장 완료: {dest}")
        
        # ✅ 추가: 오디오 메타정보 로깅 (업로드/녹음 차이 분석용)
        try:
            audio_data, sample_rate = librosa.load(str(dest), sr=None)
            duration_sec = len(audio_data) / sample_rate
            rms_energy = np.sqrt(np.mean(audio_data**2))
            
            print(f"📊 오디오 정보:")
            print(f"   - 원본 샘플레이트: {sample_rate} Hz")
            print(f"   - 길이: {duration_sec:.2f}초")
            print(f"   - RMS 에너지: {rms_energy:.6f}")
            print(f"   - 파일 타입: {audio.content_type}")
            
        except Exception as meta_err:
            print(f"⚠️ 메타정보 추출 실패: {meta_err}")
        
        # 모델 예측
        classifier = get_classifier()
        classifier.set_sensitivity(sensitivity)

        result = classifier.predict_with_confidence(str(dest))
        
        now = datetime.now()

        prediction = result['prediction']
        confidence = result['confidence']
        severity = result['severity']
        
        print(f"✅ 예측 완료: {prediction} (신뢰도: {confidence:.2f}, 심각도: {severity})")
        
        # 메타정보 추출 (응답용)
        try:
            audio_data, sample_rate = librosa.load(str(dest), sr=None)
            duration_ms = int(len(audio_data) / sample_rate * 1000)
        except Exception as e:
            print(f"⚠️ 오디오 메타정보 추출 실패: {e}")
            duration_ms = 3000
            sample_rate = 16000

        response_data = {
            "timestamp": now.isoformat(),
            "reason": prediction,
            "duration": duration_ms // 1000,
            "severity": severity,
            "infant_id": infant_id,
            "guardian_id": guardian_id,
            "confidence": confidence,
            "success": True,
            "isCrying": prediction != 'not_cry',
            "recommended_actions": get_recommended_actions(prediction, severity) if prediction != 'not_cry' else [],
            "audio_file": Path(dest).name,
            "storage_uri": str(dest.relative_to(PROJECT_ROOT)),
            "model_version": "v15.1"
        }

        # ✅ 1단계: Oracle DB에 이벤트 저장 (event_id 받기)
        event_id = None
        try:
            event_id = save_event_to_db(response_data)
            if event_id:
                response_data["event_id"] = event_id
                print(f"✅ 이벤트 DB 저장 완료: event_id={event_id}")
            else:
                print("⚠️ 이벤트 DB 저장 실패")
        except Exception as e:
            print(f"❌ 이벤트 저장 에러: {e}")
            traceback.print_exc()
        
        # 음악 재생 (tired, emotional일 때)
        try:
            if MUSIC_SERVICE_AVAILABLE:
                cry_cause = prediction
                if cry_cause in ("emotional", "tired"):
                    music_service = get_music_service()
                    music_info = music_service.play_for_cause(cry_cause)
                    print(f"🎵 Music playback result: {music_info}")
        except Exception as e:
            print(f"⚠️ Music playback failed: {e}")

        # ✅ 2단계: Node 백엔드 알림 (GPT 추천 생성)
        try:
            if event_id:
                notify_node_backend(event_id, response_data)
            else:
                print("⚠️ event_id 없어서 알림 생략")
        except Exception as e:
            print(f"⚠️ notify_node_backend 실패: {e}")
        
        return JSONResponse(content=response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print("❌ Upload handler error:", e)
        print(tb)
        return JSONResponse(status_code=503, content={
            "success": False,
            "error": str(e),
            "trace": tb.splitlines()[-10:]
        })
    finally:
        # NOTE: 파일 삭제는 정책에 따라 주석 처리
        # if dest and dest.exists():
        #     os.remove(dest)
        pass

@router.get("/dashboard")
async def get_dashboard(infant_id: int = Query(..., description="ID of the infant")):
    """
    아기 ID별 대시보드 데이터 반환
    """
    try:
        if not STORAGE_MANAGER_AVAILABLE:
            raise HTTPException(status_code=503, detail="StorageManager not available for dashboard.")

        storage = get_storage_manager()
        summary = storage.get_insights_summary(infant_id, days=7)

        data = {
            "success": True,
            "infant_id": infant_id,
            "recent_events": storage.get_cry_events(infant_id, limit=5),
            "summary": summary,
            "next_cry_prediction": None,
            "patterns": None,
        }
        return JSONResponse(content=data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dashboard error: {str(e)}")

@router.post("/chatbot")
async def chatbot_endpoint(request: Request):
    """
    챗봇 엔드포인트
    """
    data = await request.json()
    
    infant_id = data.get("infant_id")
    guardian_id = data.get("guardian_id", 1)
    user_message = data.get("message")
    history = data.get("history", [])
    
    if not user_message:
        return {"error": "message is required"}

    try:
        response = chatbot.generate_response(
            infant_id=infant_id,
            guardian_id=guardian_id,
            user_message=user_message,
            conversation_history=history
        )
        return response
    except Exception as e:
        return {"error": str(e)}

# --- End of File ---