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

# FastAPI Imports
from fastapi import APIRouter
from fastapi import Query, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
load_dotenv()

NOTIFICATION_URL = os.getenv(
    "NOTIFICATION_URL",
    "http://localhost:4000/api/analysis/result"
)

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

# Flask Blueprint 및 FastAPI APIRouter 정의
api_bp = Blueprint('api', __name__)
router = APIRouter(prefix="/api", tags=["api"])

# 전역 classifier 인스턴스 (싱글톤)
_classifier_instance = None

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
# ## Flask Blueprint 라우트
# ====================================================================
@api_bp.route('/test', methods=['GET'])
def test():
    """Blueprint 테스트 엔드포인트"""
    status_info = {
        "message": "Blueprint API routes are working with V15.1",
        "blueprint": "api_bp",
        "storage_manager": STORAGE_MANAGER_AVAILABLE,
        "model_loaded": _classifier_instance is not None
    }
    return jsonify(status_info)

@api_bp.route('/upload-legacy', methods=['POST'])
def upload_audio_legacy():
    """
    레거시 업로드 엔드포인트 (JWT 없이 작동)
    """
    # 1. 입력 검증 및 초기 설정
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file uploaded'}), 400
        
    file = request.files['audio']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    infant_id = request.form.get('infant_id', 1)
    guardian_id = request.form.get('guardian_id', 1)
    sensitivity = request.form.get('sensitivity', 'balanced')
    
    try:
        infant_id = int(infant_id)
        guardian_id = int(guardian_id)
    except ValueError:
        return jsonify({'error': 'Invalid infant_id or guardian_id'}), 400
    
    if sensitivity not in ['high', 'balanced', 'precise']:
        sensitivity = 'balanced'

    file_path = None # finally 구문을 위해 미리 정의
    
    try:
        classifier = get_classifier()
        classifier.set_sensitivity(sensitivity)
        
        print(f"🎯 [Legacy] Sensitivity mode: {sensitivity.upper()}")

        # 2. 파일 저장
        upload_dir = PROJECT_ROOT / 'uploads'
        os.makedirs(upload_dir, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        new_filename = f"{timestamp}_{file.filename}"
        file_path = upload_dir / new_filename
        file.save(str(file_path))
        
        print(f"💾 [Legacy] 파일 저장: {file_path}")

        # 3. 메타정보 추출 및 예측
        try:
            audio_data, sample_rate = librosa.load(str(file_path), sr=None)
            duration_ms = int(len(audio_data) / sample_rate * 1000)
        except Exception:
            duration_ms = 3000
            sample_rate = 16000

        result = classifier.predict_with_confidence(str(file_path))
        
        print(f"🤖 [Legacy] AI 예측: {result['prediction']} (신뢰도: {result['confidence']:.2f})")
        
        now = datetime.now()
        korean_days = ["월", "화", "수", "목", "금", "토", "일"]
        
        prediction = result['prediction']
        confidence = result['confidence']
        severity = result['severity']
        
        # 4. 응답 데이터 구성
        response_data = {
            "timestamp": now.isoformat(),
            "reason": prediction,
            "duration": duration_ms // 1000,
            "severity": severity,
            "hour": now.hour,
            "day_of_week": korean_days[now.weekday()],
            "infant_id": infant_id,
            "guardian_id": guardian_id,
            "confidence": confidence,
            "cry_type": result['cry_type'],
            "success": True,
            "isCrying": prediction != 'not_cry',
            "recommended_actions": get_recommended_actions(prediction, severity) if prediction != 'not_cry' else [],
            "audio_file": new_filename,
            "storage_uri": str(file_path.relative_to(PROJECT_ROOT)),
            "sample_rate": sample_rate,
            "sensitivity_mode": result.get('sensitivity_mode', sensitivity),
            "detection_stage": result.get('stage', 'unknown'),
            "probabilities": result.get('probabilities', {}),
            "model_version": "v15.1"
        }
        
        # 5. StorageManager 또는 JSON 폴백으로 저장
        if STORAGE_MANAGER_AVAILABLE:
            storage = get_storage_manager()
            response_data = storage.save_complete_event(response_data)
        else:
            history_file = PROJECT_ROOT / 'backend' / 'data' / 'cry_history.json'
            history_file.parent.mkdir(exist_ok=True)
            try:
                if history_file.exists():
                    with open(history_file, 'r', encoding='utf-8') as f:
                        history = json.load(f)
                else:
                    history = []
                history.append(response_data)
                if len(history) > 1000: history = history[-1000:]
                with open(history_file, 'w', encoding='utf-8') as f:
                    json.dump(history, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"⚠️ JSON 저장 실패: {e}")

        try:
            notify_node_backend(response_data)
        except Exception as e:
            print(f"⚠️ notify_node_backend 실패: {e}")

        return jsonify(response_data)

    except Exception as e:
        print(f"❌ [Legacy] Error: {str(e)}")
        print(traceback.format_exc())
        return jsonify({
            'error': str(e), 
            'success': False,
            'timestamp': datetime.now().isoformat()
        }), 500
    
    finally:
        # NOTE: 원본 파일을 즉시 삭제하지 않고, storage manager가 처리하도록 두거나,
        # 학습 데이터로 남기기 위해 주석 처리합니다. 필요시 주석을 해제하세요.
        # if file_path and file_path.exists():
        #      os.remove(file_path)
        pass


@api_bp.route('/actions/record', methods=['POST'])
@jwt_required()
def record_action():
    """보호자가 취한 조치 기록"""
    # ... (기존 로직 유지)
    data = request.get_json()
    
    required_fields = ['event_id', 'action_type', 'action_detail', 'result']
    if not all(field in data for field in required_fields):
        return jsonify({'error': 'Missing required fields'}), 400
    
    if not STORAGE_MANAGER_AVAILABLE:
        return jsonify({'error': 'StorageManager를 사용할 수 없습니다'}), 503
    
    try:
        storage = get_storage_manager()
        action_id = storage.save_action_log(
            event_id=data['event_id'],
            action_type=data['action_type'],
            action_detail=data['action_detail'],
            result=data['result'],
            executed_at=datetime.now().isoformat()
        )
        
        return jsonify({
            'success': True,
            'action_id': action_id,
            'message': '조치가 기록되었습니다.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/history-legacy/<int:infant_id>', methods=['GET'])
def get_history_legacy(infant_id):
    """히스토리 조회 (레거시 - JWT 없음)"""
    # ... (기존 로직 유지)
    limit = request.args.get('limit', 50, type=int)
    
    if STORAGE_MANAGER_AVAILABLE:
        try:
            storage = get_storage_manager()
            events = storage.get_cry_events(infant_id, limit=limit)
            return jsonify({
                'success': True, 
                'history': events, 
                'count': len(events)
            })
        except Exception as e:
            print(f"StorageManager error: {e}")
    
    # JSON 폴백
    history_file = PROJECT_ROOT / 'backend' / 'data' / 'cry_history.json'
    
    if history_file.exists():
        try:
            with open(history_file, 'r', encoding='utf-8') as f:
                all_history = json.load(f)
            
            filtered = [h for h in all_history if h.get('infant_id') == infant_id]
            return jsonify({
                'success': True, 
                'history': filtered[-limit:], 
                'count': len(filtered)
            })
        except Exception as e:
            print(f"JSON read error: {e}")
    
    return jsonify({'success': True, 'history': [], 'count': 0})

# (나머지 Flask 라우트: change_sensitivity, get_model_info, get_stats, health_check는 변경 없이 유지)

@api_bp.route('/sensitivity', methods=['POST'])
def change_sensitivity():
    """전역 민감도 설정 변경"""
    data = request.get_json()
    sensitivity = data.get('sensitivity', 'balanced')
    
    if sensitivity not in ['high', 'balanced', 'precise']:
        return jsonify({
            'error': 'Invalid sensitivity. Must be: high, balanced, or precise'
        }), 400
    
    try:
        classifier = get_classifier()
        classifier.set_sensitivity(sensitivity)
        
        return jsonify({
            'success': True,
            'sensitivity': sensitivity,
            'message': f'민감도가 {sensitivity.upper()}로 변경되었습니다.',
            'cascade_threshold': classifier.cascade_thresholds.get(sensitivity, 0.0)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/model/info', methods=['GET'])
def get_model_info():
    """현재 로드된 모델 정보 반환"""
    try:
        classifier = get_classifier()
        
        return jsonify({
            'success': True,
            'model_version': 'v15.1',
            'sensitivity_mode': classifier.sensitivity,
            'cascade_enabled': classifier.cascade_filter is not None,
            'cascade_thresholds': classifier.cascade_thresholds,
            'current_threshold': classifier.cascade_thresholds.get(classifier.sensitivity, 0.0),
            'available_sensitivities': ['high', 'balanced', 'precise'],
            'sensitivity_descriptions': {
                'high': 'Recall 85%+, Precision 60%+ (안전 우선)',
                'balanced': 'Recall 72%, Precision 91% (균형)',
                'precise': 'Recall 60%, Precision 95%+ (오경보 최소화)'
            },
            'storage_mode': 'StorageManager' if STORAGE_MANAGER_AVAILABLE else 'Fallback'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/stats/<int:infant_id>', methods=['GET'])
@jwt_required()
def get_stats(infant_id):
    """아기별 통계 조회"""
    
    period = request.args.get('period', 'week')
    
    if not STORAGE_MANAGER_AVAILABLE:
        return jsonify({'error': 'Statistics requires StorageManager'}), 503
    
    try:
        storage = get_storage_manager()
        
        days_map = {'day': 1, 'week': 7, 'month': 30}
        days = days_map.get(period, 7)
        
        summary = storage.get_insights_summary(infant_id, days=days)
        
        return jsonify({
            'success': True,
            'infant_id': infant_id,
            'period': period,
            'stats': summary
        })
        
    except Exception as e:
        print(f"Stats error: {e}")
        return jsonify({'error': str(e)}), 500

@api_bp.route('/health', methods=['GET'])
def health_check():
    """Blueprint 헬스체크"""
    return jsonify({
        'status': 'healthy',
        'blueprint': 'api_bp',
        'timestamp': datetime.now().isoformat()
    })

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

# --- End of File ---