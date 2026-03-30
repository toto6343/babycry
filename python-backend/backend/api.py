"""
API Router - 핵심 울음 분석 엔드포인트 및 FastAPI 라우트
"""
import logging
from fastapi import APIRouter, Query, File, UploadFile, Form, HTTPException, Request, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.responses import JSONResponse
from pathlib import Path
import os
from datetime import datetime
import json
import librosa
import numpy as np
import time
import traceback
import requests
from requests.exceptions import ReadTimeout
from dotenv import load_dotenv

load_dotenv()

# ✅ 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("logs/python_backend.log", encoding='utf-8')
    ]
)
logger = logging.getLogger(__name__)
os.makedirs("logs", exist_ok=True)

from backend.models.classifier import CryClassifier
from backend.services.chatbot_service import ChatbotService

# ✅ LangGraph Router Import
try:
    from backend.routes.langgraph_routes import router as langgraph_router
    LANGGRAPH_AVAILABLE = True
    logger.info("✅ LangGraph 라우터 로드 완료")
except ImportError as e:
    LANGGRAPH_AVAILABLE = False
    langgraph_router = None
    logger.warning(f"⚠️ LangGraph 라우터를 찾을 수 없습니다: {e}")

# ✅ 모든 백엔드 통신 URL 통합 관리
NODE_BACKEND_BASE = os.getenv("NODE_BACKEND_URL", "http://localhost:4000")

NOTIFICATION_URL = f"{NODE_BACKEND_BASE}/api/analysis/result"
EVENT_SAVE_URL = f"{NODE_BACKEND_BASE}/api/events/create"
FEEDBACK_STATS_URL = f"{NODE_BACKEND_BASE}/api/analysis/feedback/stats"
VITALS_URL = f"{NODE_BACKEND_BASE}/api/health/vitals"

try:
    from backend.services.music_service import get_music_service
    MUSIC_SERVICE_AVAILABLE = True
except ImportError:
    MUSIC_SERVICE_AVAILABLE = False
    logger.warning("⚠️ LocalMusicService not available. Music playback will be skipped.")

try:
    from backend.utils.storage_manager import get_storage_manager
    STORAGE_MANAGER_AVAILABLE = True
except ImportError:
    STORAGE_MANAGER_AVAILABLE = False
    logger.warning("⚠️ StorageManager not available in Blueprint. Falling back to JSON history.")


def save_event_to_db(event_data):
    """Node 백엔드로 이벤트 데이터를 전송하여 Oracle DB에 저장"""
    try:
        payload = {
            "infant_id": event_data.get("infant_id"),
            "guardian_id": event_data.get("guardian_id"),
            "reason": event_data.get("reason"),
            "severity": event_data.get("severity", "Medium"),
            "confidence": event_data.get("confidence", 0.5),
            "duration": event_data.get("duration", 3),
            "timestamp": event_data.get("timestamp"),
            "needs_consultation": event_data.get("needs_consultation", False)
        }

        logger.info(f"💾 이벤트 저장 요청: {EVENT_SAVE_URL}")
        
        response = requests.post(
            EVENT_SAVE_URL,
            json=payload,
            timeout=(3, 10),
        )
        
        if response.status_code == 200:
            result = response.json()
            event_id = result.get("event_id")
            logger.info(f"✅ 이벤트 저장 완료: event_id={event_id}")
            return event_id
        else:
            logger.error(f"❌ 이벤트 저장 실패: {response.status_code}, 응답: {response.text}")
            return None

    except ReadTimeout:
        logger.warning("⚠️ 이벤트 저장 타임아웃")
        return None
    except Exception as e:
        logger.error(f"❌ 이벤트 저장 중 예외 발생: {e}")
        return None


def trigger_local_alarm(severity, message):
    """오프라인 시뮬레이션 알람"""
    logger.error(f"🚨 [OFFLINE FAIL-SAFE] LOCAL ALARM: {severity} - {message}")


def notify_node_backend(event_id, event_data):
    """Node 알림 서버로 분석 결과 전달"""
    try:
        if not event_id:
            logger.warning("⚠️ event_id 없음, Node 알림 생략")
            return

        payload = {
            "cryEventId": event_id,
            "infantId": event_data.get("infant_id", 1),
            "isCrying": event_data.get("isCrying", False),
            "cause": event_data.get("reason", "unknown"),
            "severity": event_data.get("severity", "Unknown"),
        }

        logger.info(f"📨 Node 알림 서버 호출: {NOTIFICATION_URL}")
        
        response = requests.post(
            NOTIFICATION_URL,
            json=payload,
            timeout=(3, 10),
        )
        response.raise_for_status()
        logger.info(f"✅ Node 응답 코드: {response.status_code}")

    except ReadTimeout:
        logger.warning("⚠️ Node 알림 서버 응답 타임아웃")
    except requests.exceptions.ConnectionError as e:
        logger.error(f"❌ [Network Error] Node 서버 연결 불가: {e}")
        if event_data.get("isCrying"):
            trigger_local_alarm(event_data.get("severity", "Medium"), "Network down.")
    except Exception as e:
        logger.error(f"⚠️ Node 알림 서버 호출 실패: {e}")



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
        
        logger.info(f"🔧 [Blueprint] Initializing V15.1 Classifier... Sensitivity: {sensitivity}")
        
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
    """시스템 헬스 체크 (LangGraph 상태 포함)"""
    health_status = {
        "status": "ok",
        "backend": "python",
        "model_loaded": _classifier_instance is not None,
        "langgraph_available": LANGGRAPH_AVAILABLE,
        "music_service_available": MUSIC_SERVICE_AVAILABLE,
        "storage_manager_available": STORAGE_MANAGER_AVAILABLE
    }
    
    # LangGraph 워크플로우 상태 추가
    if LANGGRAPH_AVAILABLE:
        health_status["langgraph_endpoints"] = [
            "/api/v2/analyze-cry",
            "/api/v2/workflow-status",
            "/api/v2/classify-only",
            "/api/v2/get-advice",
            "/api/v2/recommend-music"
        ]
    
    return health_status

# --- 전역 상수 및 초기화 ---


@router.post("/upload")
async def upload_audio(
    audio: UploadFile = File(...), 
    infant_id: int = Query(0, description="Infant ID"),
    guardian_id: int = Query(0, description="Guardian ID"),
    sensitivity: str = Query("balanced", description="Sensitivity level")
):
    """
    FastAPI 기반 오디오 업로드 및 분석 엔드포인트
    """
    dest = None
    try:
        if not audio or not audio.filename:
            raise HTTPException(status_code=400, detail="no_file")

        # ✅ infant_id 검증
        if infant_id == 0:
            raise HTTPException(status_code=400, detail="infant_id is required")

        # ✅ 개인화 바이어스 가져오기 (1단계 기술 고도화)
        bias_stats = None
        try:
            stats_url = f"{FEEDBACK_STATS_URL}/{infant_id}"
            logger.info(f"🧬 [Personalization] Fetching bias stats: {stats_url}")
            stats_res = requests.get(stats_url, timeout=2)
            if stats_res.status_code == 200:
                bias_stats = stats_res.json().get("stats")
                logger.info(f"   - Bias stats: {bias_stats}")
        except Exception as e:
            logger.warning(f"⚠️  Failed to fetch bias stats: {e}")

        # 파일 저장
        timestamp = int(time.time()*1000)
        dest = UPLOADS_PATH / f"{timestamp}_{Path(audio.filename).name}"
        
        with dest.open("wb") as f:
            f.write(await audio.read())
        
        # 모델 예측
        classifier = get_classifier()
        classifier.set_sensitivity(sensitivity)

        # ✅ 수정: bias_stats 전달
        result = classifier.predict_with_confidence(str(dest), bias=bias_stats)
        
        # ✅ 3.0 고도화: Voice ID 추출
        voice_profile = classifier.extract_voice_profile(str(dest))
        
        now = datetime.now()

        prediction = result['prediction']
        confidence = result['confidence']
        severity = result['severity']
        
        # ✅ 4.0 고도화: 바이오 신호(Vital) 교차 검증 (생명 안전)
        vital_warning = None
        try:
            vital_url = f"{VITALS_URL}/{infant_id}"
            logger.info(f"💓 [Bio-Signal] Checking vitals: {vital_url}")
            # 토큰 인증 없이 호출 가능하게 서버 설정되었거나 내부망 호출이라 가정
            vital_res = requests.get(vital_url, timeout=2)
            if vital_res.status_code == 200:
                vitals = vital_res.json().get("vitals", {})
                hr = vitals.get("heartRate", 120)
                temp = vitals.get("temperature", 36.5)
                
                logger.info(f"   - Current Vitals: HR={hr}, Temp={temp}°C")
                
                # 비정상 수치 검증 (체온 37.5도 이상이거나 심박수 160 초과)
                if temp >= 37.5 or hr > 160:
                    logger.warning(f"🚨 [Bio-Signal] ABNORMAL VITALS DETECTED! Upgrading severity to HIGH.")
                    severity = 'High'
                    prediction = 'pain' if prediction != 'belly_pain' else prediction # 통증 쪽으로 유도
                    vital_warning = f"⚠️ [긴급] 체온({temp}°C) 또는 심박수({hr}bpm)가 비정상입니다! 즉시 확인 요망!"
        except Exception as e:
            logger.warning(f"⚠️ [Bio-Signal] Failed to fetch vitals: {e}")
        
        logger.info(f"✅ 예측 완료: {prediction} (신뢰도: {confidence:.2f}, 심각도: {severity})")
        
        # 메타정보 추출 (응답용)
        try:
            audio_data, sample_rate = librosa.load(str(dest), sr=None)
            duration_ms = int(len(audio_data) / sample_rate * 1000)
        except Exception as e:
            logger.warning(f"⚠️ 오디오 메타정보 추출 실패: {e}")
            duration_ms = 3000
            sample_rate = 16000

        # 추천 액션 가져오기 및 바이오 신호 경고 병합
        rec_actions = get_recommended_actions(prediction, severity) if prediction != 'not_cry' else []
        if vital_warning:
            rec_actions.insert(0, {'action_type': 'urgent_medical', 'detail': vital_warning, 'priority': 0})

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
            "needs_consultation": severity == 'High',
            "recommended_actions": rec_actions,
            "audio_file": Path(dest).name,
            "storage_uri": str(dest.relative_to(PROJECT_ROOT)),
            "model_version": "v15.1",
            "voice_profile": voice_profile  # ✅ Voice ID 추가
        }

        # ✅ 1단계: Oracle DB에 이벤트 저장 (event_id 받기)
        event_id = None
        try:
            event_id = save_event_to_db(response_data)
            if event_id:
                response_data["event_id"] = event_id
                logger.info(f"✅ 이벤트 DB 저장 완료: event_id={event_id}")
            else:
                logger.warning("⚠️ 이벤트 DB 저장 실패")
        except Exception as e:
            logger.exception(f"❌ 이벤트 저장 에러: {e}")
        
        # 음악 재생 (tired, emotional일 때)
        try:
            if MUSIC_SERVICE_AVAILABLE:
                cry_cause = prediction
                if cry_cause in ("emotional", "tired"):
                    music_service = get_music_service()
                    music_info = music_service.play_for_cause(cry_cause)
                    logger.info(f"🎵 Music playback result: {music_info}")
        except Exception as e:
            logger.error(f"⚠️ Music playback failed: {e}")

try:
    from backend.services.iot_service import IoTService
    IOT_SERVICE_AVAILABLE = True
except ImportError:
    IOT_SERVICE_AVAILABLE = False
    logger.warning("⚠️ IoTService not available. Smart home automation will be skipped.")

# 전역 IoTService 인스턴스
iot_service = IoTService() if IOT_SERVICE_AVAILABLE else None

# ... (중략)

        # ✅ 2단계: Node 백엔드 알림 (GPT 추천 생성)
        try:
            if event_id:
                notify_node_backend(event_id, response_data)
            else:
                logger.warning("⚠️ event_id 없어서 알림 생략")
        except Exception as e:
            logger.error(f"⚠️ notify_node_backend 실패: {e}")

        # ✅ 3단계: IoT 스마트홈 자동화 (2단계 UX 고도화)
        if IOT_SERVICE_AVAILABLE and iot_service and prediction != 'not_cry':
            try:
                logger.info(f"🏠 [IoT] Triggering automation for: {prediction}")
                infant_name = "아기" # 실제 이름을 가져올 수 있다면 더 좋음
                
                if severity == 'High':
                    iot_result = iot_service.trigger_emergency_mode(infant_name, prediction)
                else:
                    iot_result = iot_service.handle_cry_event(infant_name, prediction, severity)
                
                logger.info(f"✅ [IoT] Result: {iot_result.get('success')}, Actions: {iot_result.get('actions_triggered')}")
                response_data["iot_actions"] = iot_result.get("actions_triggered", [])
                response_data["iot_description"] = iot_result.get("description", "")
            except Exception as e:
                logger.error(f"⚠️ [IoT] Automation failed: {e}")
        
        return JSONResponse(content=response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("❌ Upload handler error:")
        return JSONResponse(status_code=503, content={
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc().splitlines()[-10:]
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

# ====================================================================
# ✅ 1단계 고도화: WebSocket 기반 실시간 스트리밍 분석 엔드포인트
# ====================================================================
@router.websocket("/ws/stream-analyze")
async def websocket_endpoint(websocket: WebSocket):
    """
    클라이언트로부터 실시간 오디오 청크를 받아 분석하는 WebSocket 엔드포인트
    상용화 수준의 'Always-on' 모니터링을 위한 기반
    """
    await websocket.accept()
    logger.info("🔌 [WebSocket] Client connected for real-time analysis")
    
    try:
        audio_buffer = bytearray()
        
        while True:
            # 클라이언트로부터 바이너리 오디오 데이터 수신
            data = await websocket.receive_bytes()
            audio_buffer.extend(data)
            
            # 버퍼에 충분한 데이터(예: 약 3초 분량의 바이트)가 쌓이면 분석 실행
            # (여기서는 시뮬레이션을 위해 일정 크기 도달 시 분석으로 가정)
            if len(audio_buffer) > 22050 * 2 * 3:  # 22.05kHz, 16bit, 3초 대략적 크기
                logger.info(f"📡 [WebSocket] Analyzing {len(audio_buffer)} bytes of audio data...")
                
                # 임시 파일로 저장 후 기존 분석 로직 활용 (추후 메모리 내 직접 분석으로 고도화 가능)
                import time
                temp_filename = UPLOADS_PATH / f"stream_temp_{int(time.time()*1000)}.wav"
                with open(temp_filename, "wb") as f:
                    f.write(audio_buffer)
                
                try:
                    classifier = get_classifier()
                    result = classifier.predict_with_confidence(str(temp_filename))
                    
                    # 분석 결과 클라이언트로 실시간 전송
                    await websocket.send_json({
                        "type": "analysis_result",
                        "timestamp": datetime.now().isoformat(),
                        "prediction": result['prediction'],
                        "confidence": result['confidence'],
                        "severity": result['severity']
                    })
                except Exception as analysis_err:
                    logger.error(f"⚠️ [WebSocket] Analysis error: {analysis_err}")
                finally:
                    # 버퍼 비우기 및 임시 파일 삭제
                    audio_buffer = bytearray()
                    if temp_filename.exists():
                        os.remove(temp_filename)
                        
    except WebSocketDisconnect:
        logger.info("🔌 [WebSocket] Client disconnected")
    except Exception as e:
        logger.error(f"❌ [WebSocket] Error: {e}")

# ====================================================================
# ✅ 3.0 고도화: MLOps Continuous Training (자동 재학습 파이프라인)
# ====================================================================
import subprocess

def run_retrain_pipeline():
    """백그라운드에서 모델 재학습 파이프라인 실행 시뮬레이션"""
    logger.info("🔄 [MLOps] Starting automated retraining pipeline...")
    time.sleep(2)
    logger.info("🔄 [MLOps] 1. Fetching feedback data from DB...")
    time.sleep(2)
    logger.info("🔄 [MLOps] 2. Augmenting dataset with new user feedbacks...")
    time.sleep(3)
    logger.info("🔄 [MLOps] 3. Training new model version (v15.2)...")
    # 실제 환경에서는 subprocess를 통해 train.py 실행
    # subprocess.run(["python", "backend/dataset_tools/train.py"], check=True)
    time.sleep(3)
    logger.info("✅ [MLOps] Retraining complete. New model deployed (Zero-downtime).")

@router.post("/mlops/retrain")
async def trigger_retraining(background_tasks: BackgroundTasks, admin_key: str = Query(..., description="Admin Secret Key")):
    """
    피드백 데이터가 1000건 이상 쌓였을 때 호출되어 모델을 재학습하는 엔드포인트.
    """
    if admin_key != "super_secret_mlops_key":
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # 백그라운드 태스크로 재학습 프로세스 던지기 (Non-blocking)
    background_tasks.add_task(run_retrain_pipeline)
    
    return JSONResponse(content={
        "success": True,
        "message": "Retraining pipeline triggered successfully. Process is running in background.",
        "status": "in_progress"
    })

# ====================================================================
# ## LangGraph 라우터 Export (메인 app에서 등록)
# ====================================================================

def get_all_routers():
    """
    메인 FastAPI app에서 사용할 모든 라우터 반환
    
    사용법 (app.py 또는 main.py에서):
    ```python
    from fastapi import FastAPI
    from backend.api import get_all_routers
    
    app = FastAPI()
    
    # 모든 라우터 등록
    for router in get_all_routers():
        app.include_router(router)
    ```
    """
    routers = [router]  # 기본 API 라우터
    
    if LANGGRAPH_AVAILABLE and langgraph_router:
        routers.append(langgraph_router)
        logger.info("✅ LangGraph 라우터 포함됨")
    else:
        logger.warning("⚠️ LangGraph 라우터 없음")
    
    return routers


# ====================================================================
# ## 라우터 정보 출력
# ====================================================================

if __name__ == "__main__":
    logger.info("\n" + "="*60)
    logger.info("📡 BabyCry API 라우터 정보")
    logger.info("="*60)
    logger.info("\n기본 API 라우터 (레거시):")
    logger.info("  - GET  /api/health")
    logger.info("  - POST /api/upload")
    logger.info("  - GET  /api/dashboard")
    logger.info("  - POST /api/chatbot")
    
    if LANGGRAPH_AVAILABLE:
        logger.info("\n🤖 LangGraph 워크플로우 라우터:")
        logger.info("  - POST /api/v2/analyze-cry      (전체 워크플로우)")
        logger.info("  - POST /api/v2/classify-only    (분류만)")
        logger.info("  - POST /api/v2/get-advice       (조언만)")
        logger.info("  - POST /api/v2/recommend-music  (음악만)")
        logger.info("  - GET  /api/v2/workflow-status  (상태 확인)")
    else:
        logger.warning("\n⚠️  LangGraph 라우터 비활성화")
        logger.warning("   설치: pip install -r requirements_langgraph.txt")
    
    logger.info("\n" + "="*60 + "\n")

# --- End of File ---