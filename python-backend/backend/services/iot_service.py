import os
import requests
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

class IoTService:
    def __init__(self):
        self.ifttt_key = os.getenv('IFTTT_WEBHOOK_KEY')
        self.ifttt_base_url = f"https://maker.ifttt.com/trigger"
        
        # 울음 타입별 자동화 액션 매핑
        self.action_map = {
            'hungry': {
                'event': 'baby_hungry',
                'actions': ['bottle_warmer_on', 'kitchen_light_on'],
                'description': '젖병 데우기 시작, 주방 조명 켜기'
            },
            'belly_pain': {
                'event': 'baby_pain',
                'actions': ['white_noise_on', 'room_temp_warm'],
                'description': '백색소음 재생, 실내 온도 올리기'
            },
            'tired': {
                'event': 'baby_tired',
                'actions': ['lights_dim', 'white_noise_on', 'curtains_close'],
                'description': '조명 어둡게, 백색소음 재생, 커튼 닫기'
            },
            'discomfort': {
                'event': 'baby_uncomfortable',
                'actions': ['room_temp_adjust', 'humidifier_on'],
                'description': '실내 온도 조절, 가습기 켜기'
            },
            'cold_hot': {
                'event': 'baby_temp_issue',
                'actions': ['room_temp_auto_adjust', 'fan_control'],
                'description': '자동 온도 조절, 선풍기/히터 제어'
            },
            'burping': {
                'event': 'baby_burping',
                'actions': ['notification_only'],
                'description': '트림 필요 알림만 발송'
            },
            'emotional': {
                'event': 'baby_emotional',
                'actions': ['lullaby_play', 'lights_soft'],
                'description': '자장가 재생, 부드러운 조명'
            }
        }
    
    def trigger_ifttt(self, event_name: str, value1: str = "", value2: str = "", value3: str = ""):
        """
        IFTTT Webhook 트리거 발송
        
        Args:
            event_name: IFTTT 이벤트 이름 (예: baby_hungry)
            value1: 첫 번째 값 (아기 이름)
            value2: 두 번째 값 (울음 타입)
            value3: 세 번째 값 (긴급도)
        """
        if not self.ifttt_key:
            logger.warning("IFTTT_WEBHOOK_KEY가 설정되지 않았습니다.")
            return {"success": False, "error": "IFTTT key not configured"}
        
        url = f"{self.ifttt_base_url}/{event_name}/with/key/{self.ifttt_key}"
        
        payload = {
            "value1": value1,
            "value2": value2,
            "value3": value3
        }
        
        try:
            response = requests.post(url, json=payload, timeout=5)
            
            if response.status_code == 200:
                logger.info(f"IFTTT 트리거 성공: {event_name}")
                return {
                    "success": True,
                    "event": event_name,
                    "response": response.text
                }
            else:
                logger.error(f"IFTTT 트리거 실패: {response.status_code}")
                return {
                    "success": False,
                    "error": f"HTTP {response.status_code}",
                    "response": response.text
                }
        except Exception as e:
            logger.error(f"IFTTT 요청 에러: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def handle_cry_event(self, infant_name: str, cry_type: str, severity: str):
        """
        울음 감지 시 자동화 액션 실행
        
        Args:
            infant_name: 아기 이름
            cry_type: 울음 타입 (belly_pain, hungry, tired 등)
            severity: 긴급도 (high/medium/low)
        
        Returns:
            dict: 실행 결과 및 action_log 저장용 데이터
        """
        action_config = self.action_map.get(cry_type)
        
        if not action_config:
            logger.warning(f"알 수 없는 울음 타입: {cry_type}")
            return {
                "success": False,
                "error": "Unknown cry type",
                "action_type": "none",
                "action_detail": None
            }
        
        # IFTTT 트리거 발송
        result = self.trigger_ifttt(
            event_name=action_config['event'],
            value1=infant_name,
            value2=cry_type,
            value3=severity
        )
        
        # action_log 테이블에 저장할 데이터 준비
        action_log_data = {
            "action_type": "iot_automation",
            "action_detail": json.dumps({
                "cry_type": cry_type,
                "severity": severity,
                "actions": action_config['actions'],
                "description": action_config['description'],
                "ifttt_event": action_config['event'],
                "timestamp": datetime.now().isoformat()
            }),
            "result": "success" if result['success'] else "failed",
            "executed_at": datetime.now()
        }
        
        return {
            **result,
            "action_log_data": action_log_data,
            "actions_triggered": action_config['actions'],
            "description": action_config['description']
        }
    
    def trigger_emergency_mode(self, infant_name: str, cry_type: str):
        """
        긴급 모드 활성화 (severity='high'인 경우)
        
        Actions:
            - 모든 조명 켜기
            - 알림 최대 볼륨
            - 보호자에게 긴급 알림
        """
        event_name = "baby_emergency"
        
        result = self.trigger_ifttt(
            event_name=event_name,
            value1=infant_name,
            value2=cry_type,
            value3="EMERGENCY"
        )
        
        return {
            **result,
            "action_log_data": {
                "action_type": "emergency_mode",
                "action_detail": json.dumps({
                    "cry_type": cry_type,
                    "actions": ["all_lights_on", "max_alert", "emergency_notification"],
                    "description": "긴급 모드 활성화",
                    "timestamp": datetime.now().isoformat()
                }),
                "result": "success" if result['success'] else "failed",
                "executed_at": datetime.now()
            }
        }
    
    def trigger_sleep_mode(self, infant_name: str):
        """
        수면 모드 활성화 (tired 타입)
        
        Actions:
            - 조명 완전히 끄기 (또는 5% 야간 조명)
            - 백색소음 재생
            - 커튼 닫기
            - 실내 온도 23도로 설정
        """
        result = self.trigger_ifttt(
            event_name="baby_sleep_mode",
            value1=infant_name,
            value2="sleep",
            value3="auto"
        )
        
        return {
            **result,
            "action_log_data": {
                "action_type": "sleep_mode",
                "action_detail": json.dumps({
                    "actions": ["lights_off", "white_noise_on", "curtains_close", "temp_23c"],
                    "description": "수면 환경 자동 조성",
                    "timestamp": datetime.now().isoformat()
                }),
                "result": "success" if result['success'] else "failed",
                "executed_at": datetime.now()
            }
        }
    
    def trigger_feeding_mode(self, infant_name: str):
        """
        수유 모드 활성화 (hungry 타입)
        
        Actions:
            - 주방 조명 켜기
            - 젖병 데우기 시작
            - 수유 타이머 시작
        """
        result = self.trigger_ifttt(
            event_name="baby_feeding_mode",
            value1=infant_name,
            value2="feeding",
            value3="auto"
        )
        
        return {
            **result,
            "action_log_data": {
                "action_type": "feeding_mode",
                "action_detail": json.dumps({
                    "actions": ["kitchen_light_on", "bottle_warmer_on", "feeding_timer_start"],
                    "description": "수유 준비 자동화",
                    "timestamp": datetime.now().isoformat()
                }),
                "result": "success" if result['success'] else "failed",
                "executed_at": datetime.now()
            }
        }
    
    def get_automation_history(self, event_id: int, db_cursor):
        """
        특정 cry_event의 자동화 히스토리 조회
        
        Args:
            event_id: cry_event.event_id
            db_cursor: Oracle DB 커서
        """
        try:
            db_cursor.execute("""
                SELECT action_id, action_type, action_detail, result, executed_at
                FROM action_log
                WHERE event_id = :1
                ORDER BY executed_at DESC
            """, [event_id])
            
            rows = db_cursor.fetchall()
            
            history = []
            for row in rows:
                history.append({
                    "action_id": row[0],
                    "action_type": row[1],
                    "action_detail": json.loads(row[2]) if row[2] else {},
                    "result": row[3],
                    "executed_at": row[4].isoformat() if row[4] else None
                })
            
            return {"success": True, "history": history}
        except Exception as e:
            logger.error(f"자동화 히스토리 조회 실패: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def test_connection(self):
        """IFTTT 연결 테스트"""
        result = self.trigger_ifttt(
            event_name="bebemento_test",
            value1="Test",
            value2="Connection",
            value3="OK"
        )
        return result