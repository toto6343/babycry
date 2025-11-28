"""
Chatbot Service - Claude API 통합
"""
import os
import uuid
from datetime import datetime
from typing import List, Dict, Optional
from anthropic import Anthropic

try:
    from backend.utils.storage_manager import get_storage_manager
    STORAGE_AVAILABLE = True
except ImportError:
    STORAGE_AVAILABLE = False


class ChatbotService:
    """AI 챗봇 서비스 (Claude API)"""
    
    def __init__(self):
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다")
        
        self.client = Anthropic(api_key=api_key)
        self.model = os.getenv('CLAUDE_MODEL', 'claude-sonnet-4-20250514')
    
    def generate_response(
        self,
        infant_id: int,
        guardian_id: int,
        user_message: str,
        conversation_history: List[Dict] = None
    ) -> Dict:
        """챗봇 응답 생성"""
        
        conversation_id = str(uuid.uuid4())
        
        # 시스템 프롬프트
        system_prompt = self._build_system_prompt(infant_id)
        
        # 메시지 히스토리 구성
        messages = []
        if conversation_history:
            for msg in conversation_history[-10:]:  # 최근 10개만
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
        
        # 현재 메시지 추가
        messages.append({
            "role": "user",
            "content": user_message
        })
        
        try:
            # Claude API 호출
            response = self.client.messages.create(
                model=self.model,
                max_tokens=2000,
                system=system_prompt,
                messages=messages,
                temperature=0.7
            )
            
            assistant_message = response.content[0].text
            
            # 긴급도 및 제안 액션 분석
            urgency, actions = self._analyze_response(user_message, assistant_message)
            
            return {
                "response": assistant_message,
                "suggested_actions": actions,
                "urgency_level": urgency,
                "conversation_id": conversation_id,
                "success": True
            }
            
        except Exception as e:
            raise Exception(f"Claude API 호출 실패: {str(e)}")
    
    def _build_system_prompt(self, infant_id: int) -> str:
        """시스템 프롬프트 생성"""
        
        base_prompt = """당신은 전문 소아과 간호사이자 육아 전문가입니다.
보호자들에게 다음과 같은 도움을 제공합니다:

1. 아기 울음의 원인 분석 및 대처법
2. 월령별 발달 단계와 적절한 돌봄 방법
3. 수유, 수면, 배변 등 일상 육아 조언
4. 응급 상황 판단 및 병원 방문 권고

**중요 원칙:**
- 항상 공감하고 따뜻한 톤으로 답변
- 의학적 진단은 절대 하지 않음 (의심 증상 시 병원 방문 권유)
- 구체적이고 실행 가능한 조언 제공
- 보호자의 불안감을 이해하고 안심시킴
- 긴급 상황(고열, 의식 저하, 심한 경련 등)에는 즉시 119 또는 응급실 방문 권고

답변 형식:
- 간결하고 읽기 쉽게 (단락 구분)
- 필요시 단계별 설명
- 이모지 적절히 사용 👶🍼😴
"""
        
        # 아기 데이터 추가
        if STORAGE_AVAILABLE:
            try:
                context = self._get_infant_context(infant_id)
                if context:
                    base_prompt += f"""

**현재 상담 중인 아기 정보:**
- 월령: {context.get('age_months', '알 수 없음')}개월
- 최근 7일 울음 패턴: {context.get('cry_patterns', '데이터 없음')}

위 데이터를 참고하여 맞춤형 조언을 제공하세요.
"""
            except Exception as e:
                print(f"아기 컨텍스트 로드 실패: {e}")
        
        return base_prompt
    
    def _get_infant_context(self, infant_id: int) -> Optional[Dict]:
        """아기의 최근 데이터 수집"""
        try:
            storage = get_storage_manager()
            
            # 최근 7일 울음 히스토리
            history = storage.get_history(infant_id, limit=50)
            
            if not history:
                return None
            
            # 울음 원인별 카운트
            cry_counts = {}
            for event in history:
                reason = event.get('reason', 'unknown')
                cry_counts[reason] = cry_counts.get(reason, 0) + 1
            
            # 가장 빈번한 울음 원인
            most_common = max(cry_counts, key=cry_counts.get) if cry_counts else 'unknown'
            
            return {
                'age_months': 'N/A',  # DB에서 가져와야 함
                'cry_patterns': f"{most_common} ({cry_counts.get(most_common, 0)}회)"
            }
            
        except Exception as e:
            print(f"컨텍스트 수집 실패: {e}")
            return None
    
    def _analyze_response(self, user_msg: str, response: str) -> tuple:
        """응답에서 긴급도와 제안 액션 추출"""
        urgency = "low"
        actions = []
        
        # 긴급 키워드
        emergency_keywords = ["119", "응급실", "즉시", "병원", "위험"]
        high_keywords = ["소아과", "진료", "의사", "확인"]
        
        response_lower = response.lower()
        
        if any(kw in response_lower for kw in emergency_keywords):
            urgency = "emergency"
            actions.append("119 전화 또는 응급실 방문")
        elif any(kw in response_lower for kw in high_keywords):
            urgency = "high"
            actions.append("소아과 진료 예약")
        elif any(kw in response for kw in ["수유", "먹이"]):
            urgency = "medium"
            actions.append("수유하기")
        
        # 일반 조치
        if "기저귀" in response:
            actions.append("기저귀 확인")
        if "안아" in response or "달래" in response:
            actions.append("아기 안아주기")
        if "트림" in response:
            actions.append("트림 시키기")
        
        return urgency, actions[:3]
    
    def get_suggested_questions(self, infant_id: int) -> List[str]:
        """상황별 추천 질문"""
        
        default_suggestions = [
            "우리 아기가 자주 우는 이유가 뭘까요?",
            "밤에 자주 깨는데 어떻게 해야 하나요?",
            "수유 간격을 어떻게 조절해야 하나요?",
            "아기가 잠을 잘 못 자요. 수면 교육이 필요한가요?",
            "기저귀 발진이 생겼는데 어떻게 관리하나요?"
        ]
        
        # 최근 패턴 기반 추천 (선택)
        if STORAGE_AVAILABLE:
            try:
                context = self._get_infant_context(infant_id)
                if context and 'cry_patterns' in context:
                    pattern = context['cry_patterns']
                    if 'hungry' in pattern:
                        default_suggestions.insert(0, "수유 간격을 어떻게 조절해야 하나요?")
                    elif 'tired' in pattern:
                        default_suggestions.insert(0, "아기가 잠을 잘 못 자요. 어떻게 하나요?")
            except:
                pass
        
        return default_suggestions[:5]