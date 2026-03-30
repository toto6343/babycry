# backend/agents/parenting_advice_agent.py
"""
육아 조언 생성 에이전트
GPT-4 기반 맞춤형 육아 조언 제공
"""

import os
from typing import Dict, Optional, List
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()


# ✅ 3번 고도화: 월령별 발달 단계 특징 (RAG 대용 지식 베이스)
MILESTONES = {
    0: "신생아기: 반사 작용이 강하며, 울음은 주로 생리적 욕구(배고픔, 기저귀)입니다.",
    1: "1개월: 오감이 발달하며 주변 소리에 민감해집니다. 배앓이(영아 산통)가 시작될 수 있는 시기입니다.",
    2: "2개월: 사회적 미소가 나타나며, 밤낮 구분을 시작합니다. 급성장기(Growth Spurt)로 울음이 늘 수 있습니다.",
    4: "4개월: 수면 퇴행(Sleep Regression) 시기입니다. 뒤집기를 시도하며 밤에 자주 깰 수 있습니다.",
    6: "6개월: 이유식을 시작하며 소화 패턴이 바뀝니다. 낯가림이 시작될 수 있는 정서적 변화기입니다.",
    8: "8-9개월: 분리 불안이 강해지는 시기입니다. 보호자가 눈앞에서 사라지면 공포를 느껴 크게 웁니다.",
    12: "12개월: 첫 돌 전후로 자아 형성이 시작되며, 자신의 의사 표현(고집)으로 인한 울음이 생깁니다."
}

class ParentingAdviceAgent:
    """
    GPT-4 기반 육아 조언 생성 에이전트
    울음 유형에 따른 맞춤형 조언 및 긴급도 평가
    """
    
    def __init__(self, api_key: Optional[str] = None):
        # ... (기존 코드 유지)
        self.api_key = api_key or os.getenv('OPENAI_API_KEY')
        self.client = AsyncOpenAI(api_key=self.api_key) if self.api_key else None
        
        # ... (fallback_advice 생략)

    async def _generate_with_gpt(
        self, 
        cry_type: str, 
        confidence: float, 
        infant_age_months: Optional[int]
    ) -> Dict:
        """GPT-4를 사용한 조언 생성 (발달 단계 정보 주입)"""
        
        # ✅ 월령별 발달 특징 추출 (3단계 고도화)
        milestone_context = "일반적인 성장 단계"
        if infant_age_months is not None:
            # 가장 가까운 월령 특징 찾기
            applicable_months = [m for m in MILESTONES.keys() if m <= infant_age_months]
            if applicable_months:
                milestone_context = MILESTONES[max(applicable_months)]
        
        age_context = f"영아 월령: {infant_age_months}개월 ({milestone_context})" if infant_age_months else "월령 정보 없음"
        
        prompt = f"""당신은 소아과 전문의이자 베테랑 육아 컨설턴트입니다.

[상황 분석]
- 울음 원인: {cry_type}
- AI 분석 신뢰도: {confidence:.1%}
- 아기 상태: {age_context}

[요청 사항]
위 발달 단계적 특징을 고려하여 부모님께 다음 내용을 포함한 전문적인 리포트를 작성해주세요:

1. **상태 설명**: 현재 울음의 의미와 월령별 발달 단계와의 연관성 (부모를 안심시키는 톤)
2. **권장 조치**: 지금 당장 해야 할 일 TOP 3
3. **전문가 팁**: 이 시기 아기들을 위한 특별한 케어 방법
4. **주의 사항**: 어떤 경우에 병원에 가야 하는지 (Red Flags)
5. **긴급도**: low / medium / high 중 택일

한국어로 다정하고 전문적으로 작성해주세요."""

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o", # 최신 모델 사용
                messages=[
                    {"role": "system", "content": "당신은 아기의 성장 단계별 특징을 꿰뚫고 있는 소아과 전문의입니다."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.6,
                max_tokens=800
            )
            
            content = response.choices[0].message.content
            return self._parse_gpt_response(content, cry_type, confidence)
            
        except Exception as e:
            print(f"⚠️ [Advice] GPT API error: {e}, using fallback")
            return self._get_fallback_advice(cry_type, confidence)

    def _parse_gpt_response(self, content: str, cry_type: str, confidence: float) -> Dict:
        """GPT 응답 파싱 (개선됨)"""
        # 긴급도 추출 로직
        urgency = 'medium'
        if 'high' in content.lower(): urgency = 'high'
        elif 'low' in content.lower(): urgency = 'low'
        
        # 권장 조치 추출 (문장에서 글머리 기호 찾기 등 - 여기서는 단순화)
        actions = []
        for line in content.split('\n'):
            if line.strip().startswith(('-', '1.', '2.', '3.')) and len(line) > 5:
                actions.append(line.strip()[2:].strip())
        
        if not actions:
            actions = self.fallback_advice.get(cry_type, {}).get('actions', ['상태 관찰'])

        return {
            'advice': content,
            'urgency_level': urgency,
            'recommended_actions': actions[:5],
            'when_to_see_doctor': "주의 사항 섹션을 참조하세요.",
            'confidence_note': f"분석 신뢰도 {confidence:.1%}를 바탕으로 작성된 맞춤형 가이드입니다."
        }
    
    def _get_fallback_advice(self, cry_type: str, confidence: float) -> Dict:
        """Fallback 조언 (GPT 실패 시)"""
        fallback = self.fallback_advice.get(cry_type, {
            'advice': '아기의 상태를 주의 깊게 관찰해주세요.',
            'actions': ['전반적인 상태 확인', '필요시 소아과 상담'],
            'urgency': 'low'
        })
        
        return {
            'advice': fallback['advice'],
            'urgency_level': fallback['urgency'],
            'recommended_actions': fallback['actions'],
            'when_to_see_doctor': self._get_doctor_alert(cry_type, confidence),
            'confidence_note': self._get_confidence_note(confidence)
        }
    
    def _get_doctor_alert(self, cry_type: str, confidence: float) -> str:
        """병원 방문 권장 사항"""
        if cry_type == 'belly_pain':
            return "⚠️ 복통이 30분 이상 지속되거나, 구토/설사/발열이 동반되면 즉시 소아과 방문"
        elif confidence < 0.4:
            return "신뢰도가 낮습니다. 아기 상태가 계속 좋지 않다면 소아과 상담을 권장합니다."
        else:
            return "증상이 심해지거나 24시간 이상 지속되면 소아과 상담"
    
    def _get_confidence_note(self, confidence: float) -> str:
        """신뢰도 관련 노트"""
        if confidence >= 0.7:
            return "높은 신뢰도의 분석 결과입니다."
        elif confidence >= 0.4:
            return "중간 신뢰도의 분석 결과입니다. 아기 상태를 추가로 관찰해주세요."
        else:
            return "낮은 신뢰도의 분석 결과입니다. 다른 증상도 함께 확인해주세요."