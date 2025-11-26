"""
API Blueprint - 핵심 울음 분석 엔드포인트 및 FastAPI 라우트 호환 모듈
app.py의 메인 기능을 보완하는 레거시 호환 라우트와 최신 FastAPI 라우트를 포함합니다.
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from backend.models.classifier import CryClassifier
from pathlib import Path
import os
from datetime import datetime
import json
import librosa
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

try:
    from backend.services.music_service import get_music_service
    MUSIC_SERVICE_AVAILABLE = True
except ImportError:
    MUSIC_SERVICE_AVAILABLE = False
    print("⚠️ LocalMusicService not available. Music playback will be skipped.")

# StorageManager import
try:
    # 가정: backend.utils.storage_manager가 존재하며 get_storage_manager 함수를 제공
    from backend.utils.storage_manager import get_storage_manager
    STORAGE_MANAGER_AVAILABLE = True
except ImportError:
    STORAGE_MANAGER_AVAILABLE = False
    print("⚠️ StorageManager not available in Blueprint. Falling back to JSON history.")

def notify_node_backend(event_data):
    """
    Node 알림 서버로 분석 결과 전달
    """
    try:
        if not event_data.get("event_id"):
            print("⚠️ event_id 없음, Node 알림 생략")
            return

        payload = {
            "cryEventId": event_data["event_id"],
            "infantId": event_data.get("infant_id", 1),
            "isCrying": event_data.get("isCrying", False),
            "cause": event_data.get("reason", "unknown"),
            "severity": event_data.get("severity", "Unknown"),
        }

        print(f"📨 Node 알림 서버 호출: {NOTIFICATION_URL} / payload={payload}")
        
        response = requests.post(
            NOTIFICATION_URL,
            json=payload,
            timeout=(3, 10),
        )
        print(f"📨 Node 응답 코드: {response.status_code}")

    except ReadTimeout:
        # Node 쪽에서 처리 중이지만 응답이 늦는 경우
        print("⚠️ Node 알림 서버 응답 타임아웃(하지만 요청은 전송됨)")

    except Exception as e:
        print(f"⚠️ Node 알림 서버 호출 실패: {e}")


# --- 전역 상수 및 초기화 ---

# 프로젝트 루트 경로 (파일 위치에서 3단계 위)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
# FastAPI 파일 저장을 위한 경로 정의 (누락되었던 부분)
UPLOADS_PATH = PROJECT_ROOT / 'uploads'
os.makedirs(UPLOADS_PATH, exist_ok=True) # 폴더 생성

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
        # ... (나머지 action_map 항목은 생략 없이 유지)
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
    infant_id: int = Form(0), 
    guardian_id: int = Form(0), # 추가된 필드
    sensitivity: str = Form("balanced")
):
    """
    FastAPI 기반 오디오 업로드 및 분석 엔드포인트
    """
    dest = None
    try:
        if not audio or not audio.filename:
            raise HTTPException(status_code=400, detail="no_file")

        # 파일 저장 (UPLOADS_PATH 사용)
        timestamp = int(time.time()*1000)
        dest = UPLOADS_PATH / f"{timestamp}_{Path(audio.filename).name}"
        
        with dest.open("wb") as f:
            f.write(await audio.read())
        
        # 모델 예측 (Flask 로직을 그대로 사용한다고 가정하고 함수로 분리 필요)
        classifier = get_classifier()
        classifier.set_sensitivity(sensitivity)

        result = classifier.predict_with_confidence(str(dest))
        
        now = datetime.now()
        korean_days = ["월", "화", "수", "목", "금", "토", "일"]

        prediction = result['prediction']
        confidence = result['confidence']
        severity = result['severity']
        
        # 메타정보 추출 (임시)
        try:
            audio_data, sample_rate = librosa.load(str(dest), sr=None)
            duration_ms = int(len(audio_data) / sample_rate * 1000)
        except Exception:
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

        # StorageManager로 저장 (로직 단순화)
        if STORAGE_MANAGER_AVAILABLE:
            storage = get_storage_manager()
            response_data = storage.save_complete_event(response_data)
        
        try:
            if MUSIC_SERVICE_AVAILABLE:
                cry_cause = prediction  # reason 값 (hungry / tired / emotional ...)
                if cry_cause in ("emotional", "tired"):
                    music_service = get_music_service()
                    music_info = music_service.play_for_cause(cry_cause)
                    print(f"🎵 Music playback result: {music_info}")
        except Exception as e:
            print(f"⚠️ Music playback failed: {e}")

        try:
            notify_node_backend(response_data)
        except Exception as e:
            print(f"⚠️ notify_node_backend 실패: {e}")
        
        return JSONResponse(content=response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        print("Upload handler error:", e)
        print(tb)
        return JSONResponse(status_code=503, content={
            "success": False,
            "error": str(e),
            "trace": tb.splitlines()[-10:]
        })
    finally:
        # NOTE: Flask와 동일하게 파일 삭제는 정책에 따라 주석 처리
        # if dest and dest.exists():
        #     os.remove(dest)
        pass

@router.get("/dashboard")
async def get_dashboard(infant_id: int = Query(..., description="ID of the infant")):
    """
    아기 ID별 대시보드 데이터 반환
    """
    try:
        # TODO: replace with actual data retrieval (db/service)
        if not STORAGE_MANAGER_AVAILABLE:
            raise HTTPException(status_code=503, detail="StorageManager not available for dashboard.")

        storage = get_storage_manager()
        summary = storage.get_insights_summary(infant_id, days=7) # 예시로 7일치 요약

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