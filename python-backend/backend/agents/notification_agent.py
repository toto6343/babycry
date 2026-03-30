# backend/agents/notification_agent.py
"""
알림 전송 에이전트
SMS/푸시 알림 전송 및 리포트 생성
"""

import os
import requests
from typing import Dict, Optional
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()


class NotificationAgent:
    """
    SMS/푸시 알림 전송 에이전트
    Node.js 백엔드의 SMS 서비스를 활용
    """
    
    def __init__(self, node_backend_url: Optional[str] = None):
        """
        Parameters:
        -----------
        node_backend_url : str, optional
            Node.js 백엔드 URL (기본값: http://localhost:4000)
        """
        self.node_backend_url = node_backend_url or os.getenv('NODE_BACKEND_URL', 'http://localhost:4000')
        
        print(f"📱 [NotificationAgent] Initializing...")
        print(f"   Node backend: {self.node_backend_url}")
        
        # Twilio 설정 확인 (환경변수)
        self.twilio_available = all([
            os.getenv('TWILIO_ACCOUNT_SID'),
            os.getenv('TWILIO_AUTH_TOKEN'),
            os.getenv('TWILIO_PHONE_NUMBER')
        ])
        
        if self.twilio_available:
            print(f"✅ [NotificationAgent] Twilio configuration found")
        else:
            print(f"⚠️ [NotificationAgent] Twilio not configured, using mock notifications")
        
        # 울음 유형별 메시지 템플릿
        self.message_templates = {
            'hungry': '🍼 아기가 배고파합니다. 수유 시간을 확인해주세요.',
            'tired': '😴 아기가 피곤해합니다. 조용한 환경에서 재워주세요.',
            'belly_pain': '⚠️ 아기가 복통을 느끼고 있습니다. 즉시 확인이 필요합니다!',
            'burping': '💨 아기가 트림이 필요합니다. 등을 두드려주세요.',
            'discomfort': '😣 아기가 불편함을 느낍니다. 기저귀와 옷을 확인해주세요.',
            'emotional': '😢 아기가 감정적으로 불안해합니다. 안아서 달래주세요.'
        }
    
    async def send_notification(
        self,
        phone_number: str,
        cry_type: str,
        confidence: float,
        advice_summary: Optional[str] = None,
        is_urgent: bool = False
    ) -> Dict:
        """
        SMS/푸시 알림 전송
        
        Parameters:
        -----------
        phone_number : str
            수신자 전화번호 (E.164 형식)
        cry_type : str
            울음 유형
        confidence : float
            신뢰도 (0-1)
        advice_summary : str, optional
            조언 요약
        is_urgent : bool
            긴급 여부
        
        Returns:
        --------
        dict : {
            'sent': bool,           # 전송 성공 여부
            'message': str,         # 전송된 메시지
            'channel': str,         # 전송 채널 (sms/push/mock)
            'timestamp': str,       # 전송 시각
            'message_id': str       # 메시지 ID (있는 경우)
        }
        """
        try:
            print(f"\n📱 [Notification] Sending to: {phone_number}")
            print(f"   Cry type: {cry_type}, Confidence: {confidence:.2%}")
            print(f"   Urgent: {is_urgent}")
            
            # 메시지 생성
            message = self._build_message(cry_type, confidence, advice_summary, is_urgent)
            
            # 전화번호 정규화
            normalized_phone = self._normalize_phone(phone_number)
            
            if not normalized_phone:
                print(f"⚠️ [Notification] Invalid phone number: {phone_number}")
                return {
                    'sent': False,
                    'message': message,
                    'channel': 'none',
                    'timestamp': datetime.now().isoformat(),
                    'error': 'Invalid phone number'
                }
            
            # Twilio 사용 가능 시 실제 전송
            if self.twilio_available:
                result = await self._send_via_node_backend(normalized_phone, message, is_urgent)
            else:
                # Mock 알림
                result = self._send_mock(normalized_phone, message)
            
            print(f"✅ [Notification] Sent via {result['channel']}")
            
            return result
            
        except Exception as e:
            print(f"❌ [Notification] Error: {e}")
            return {
                'sent': False,
                'message': message if 'message' in locals() else '',
                'channel': 'error',
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def _build_message(
        self, 
        cry_type: str, 
        confidence: float, 
        advice_summary: Optional[str],
        is_urgent: bool
    ) -> str:
        """알림 메시지 생성"""
        base_message = self.message_templates.get(cry_type, f'아기가 울고 있습니다 ({cry_type})')
        
        # 긴급 표시
        if is_urgent:
            base_message = f'🚨 [긴급] {base_message}'
        
        # 신뢰도 추가
        confidence_text = f' (신뢰도: {confidence:.0%})'
        
        # 조언 요약 추가
        if advice_summary:
            message = f'{base_message}{confidence_text}\n\n💡 {advice_summary}'
        else:
            message = f'{base_message}{confidence_text}'
        
        # SMS 길이 제한 (한글 기준 ~70자)
        if len(message) > 200:
            message = message[:197] + '...'
        
        return message
    
    def _normalize_phone(self, phone: str) -> Optional[str]:
        """전화번호 정규화 (E.164 형식)"""
        if not phone:
            return None
        
        # 숫자만 추출
        digits = ''.join(filter(str.isdigit, phone))
        
        if not digits:
            return None
        
        # 한국 번호 처리
        if digits.startswith('0'):
            return '+82' + digits[1:]
        elif digits.startswith('82'):
            return '+' + digits
        elif phone.startswith('+'):
            return phone
        
        return digits
    
    async def _send_via_node_backend(self, phone: str, message: str, is_urgent: bool) -> Dict:
        """Node.js 백엔드를 통한 SMS 전송"""
        try:
            url = f"{self.node_backend_url}/api/notifications/sms"
            
            payload = {
                'phone': phone,
                'message': message,
                'is_urgent': is_urgent
            }
            
            response = requests.post(url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'sent': True,
                    'message': message,
                    'channel': 'sms',
                    'timestamp': datetime.now().isoformat(),
                    'message_id': data.get('messageId')
                }
            else:
                print(f"⚠️ [Notification] Node backend error: {response.status_code}")
                return self._send_mock(phone, message)
                
        except Exception as e:
            print(f"⚠️ [Notification] Node backend unavailable: {e}")
            return self._send_mock(phone, message)
    
    def _send_mock(self, phone: str, message: str) -> Dict:
        """Mock 알림 (테스트용)"""
        print(f"\n📱 [Mock Notification]")
        print(f"   To: {phone}")
        print(f"   Message: {message}")
        
        return {
            'sent': True,
            'message': message,
            'channel': 'mock',
            'timestamp': datetime.now().isoformat(),
            'message_id': 'mock_' + datetime.now().strftime('%Y%m%d%H%M%S')
        }
    
    async def send_summary_report(self, phone_number: str, report_data: Dict) -> Dict:
        """
        주간/월간 리포트 전송
        
        Parameters:
        -----------
        phone_number : str
            수신자 전화번호
        report_data : dict
            리포트 데이터
        
        Returns:
        --------
        dict : 전송 결과
        """
        try:
            print(f"\n📊 [Report] Sending summary report to: {phone_number}")
            
            # 리포트 메시지 생성
            period = report_data.get('period', '이번 주')
            total_cries = report_data.get('total_cries', 0)
            most_common = report_data.get('most_common_type', 'unknown')
            
            message = f"""📊 {period} 아기 울음 분석 리포트

총 울음 횟수: {total_cries}회
가장 많은 원인: {most_common}

자세한 내용은 앱에서 확인하세요."""
            
            normalized_phone = self._normalize_phone(phone_number)
            
            if self.twilio_available and normalized_phone:
                result = await self._send_via_node_backend(normalized_phone, message, False)
            else:
                result = self._send_mock(phone_number, message)
            
            print(f"✅ [Report] Sent via {result['channel']}")
            
            return result
            
        except Exception as e:
            print(f"❌ [Report] Error: {e}")
            return {
                'sent': False,
                'error': str(e)
            }