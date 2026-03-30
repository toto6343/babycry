// src/services/aiReportService.js
import { getOpenAI } from '../config/openai.js';
const openai = getOpenAI();

// ✅ 월령별 발달 단계 정보 (원더위크 및 주요 이정표)
const DEVELOPMENT_MILESTONES = {
  1: "오감의 발달 시기. 주변 소리와 빛에 민감해지며 울음이 늘 수 있음.",
  2: "사회적 미소 시작. 밤낮 구분이 생기기 시작하는 시기.",
  3: "원더위크(5주~8주) 전후. 주변 사물을 인지하며 혼란을 느껴 자주 울 수 있음.",
  4: "뒤집기 시도. 수면 퇴행(Sleep Regression)이 나타날 수 있는 시기.",
  5: "원더위크(19주) 전후. 관계의 세계를 깨달으며 분리불안이 생길 수 있음.",
  6: "소화 기관 발달 및 이유식 준비기. 밤중 수유 중단 시도 시기."
};

const REPORT_STYLE_GUIDE = `
당신은 "아기 울음 데이터 분석 리포트"를 작성하는 전문 육아 컨설턴트입니다.

보고서는 반드시 아래 5개 섹션 구조를 따르며, 각 섹션은 충분히 상세하고 구체적으로 작성합니다:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[1. 요약] 이번 기간 울음 현황
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**목표**: 전체 데이터를 한눈에 파악할 수 있도록 핵심 지표를 요약

**포함 내용**:
- 분석 기간 동안의 총 울음 횟수와 하루 평균 횟수
- 총 울음 시간과 1회당 평균 지속 시간
- 가장 긴 울음과 가장 짧은 울음의 시간
- 전반적인 울음 패턴의 특징 (안정적/불규칙적/증가 추세 등)

**작성 스타일**:
- 객관적인 수치와 함께 간결한 설명
- 예시: "분석 기간 동안 총 25회의 울음이 관찰되었으며, 이는 하루 평균 약 3.6회에 해당합니다. 총 울음 시간은 42분 30초로, 1회당 평균 1분 42초 정도 지속되었습니다."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[2. 울음 패턴 분석]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**목표**: 울음의 원인, 시간대, 빈도 패턴을 구체적으로 분석

**포함 내용**:

A. 울음 원인별 분석 (byCryType 데이터 활용)
- 가장 빈번한 울음 원인 TOP 3 상세 설명
- 각 원인별 발생 비율과 평균 지속 시간
- 원인별 특징과 패턴
- 예시: "배고픔(hungry)이 전체의 40%로 가장 많았으며, 평균 2분 15초 지속되었습니다. 주로 수유 시간 전후에 집중되어 나타났습니다."

B. 시간대별 분석 (byHour 데이터 활용)
- 울음이 가장 많은 시간대 (새벽/오전/오후/저녁/밤)
- 시간대별 울음 빈도와 패턴의 의미
- 예시: "새벽 2-4시와 저녁 7-9시에 울음이 집중되었습니다. 이는 수면 사이클과 수유 시간과 연관이 있어 보입니다."

C. 심각도 분석 (bySeverity 데이터 활용)
- High/Medium/Low 각 심각도 비율
- 높은 심각도 울음의 특징과 시간대
- 예시: "전체 울음 중 15%가 높은 심각도로 분류되었으며, 주로 배고픔이나 배앓이와 연관되었습니다."

**작성 분량**: 최소 4-6개 문단 (각 문단 2-4문장)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[3. 해석] 아기의 상태 추정
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**목표**: 데이터를 바탕으로 아기의 현재 상태와 필요를 해석

**포함 내용**:

A. 생리적 상태 추정
- 수면 패턴의 안정성
- 수유 리듬의 규칙성
- 소화 상태 (배앓이, 가스 등)
- 예시: "수유 시간이 3-4시간 간격으로 일정하게 유지되고 있어, 소화 기능이 안정적으로 발달하고 있는 것으로 보입니다."

B. 정서적 상태 추정
- 분리불안이나 애착 형성 단계
- 환경 적응 정도
- 예시: "저녁 시간대 울음이 증가한 것은 '황혼 증후군'일 가능성이 있습니다. 이는 생후 3-6개월 아기에게 흔한 현상입니다."

C. 발달 단계와의 연관성
- 현재 월령에서 예상되는 행동 패턴
- 발달 이정표와의 관계
- 예시: "이 시기 아기들은 수면 패턴이 재조정되는 시기이므로, 일시적인 울음 증가는 정상적인 발달 과정일 수 있습니다."

**중요**: 단정적 표현 대신 "가능성이 있습니다", "추정됩니다", "보입니다" 등 완곡한 표현 사용

**작성 분량**: 최소 4-6개 문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[4. 다음 울음 예측]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**목표**: 패턴 기반으로 다음 울음 발생 가능 시점 예측

**케이스 A - nextCryPredictionTime이 있는 경우**:
- 예측 시각을 한국 시간으로 명확히 표시
- 예측 근거 설명 (어떤 패턴에 기반했는지)
- 사전 준비 사항 제안
- 예시: "패턴 분석 결과, 오늘 저녁 19시 30분경 울음이 발생할 가능성이 높습니다. 이는 최근 7일간 동일 시간대에 수유 관련 울음이 반복되었기 때문입니다. 미리 수유 준비를 하시면 좋겠습니다."

**케이스 B - nextCryPredictionTime이 null인 경우**:
- 예측이 어려운 이유 설명
- 대신 일반적인 패턴 정보 제공
- 예시: "현재 데이터만으로는 정확한 예측이 어렵습니다. 다만, 최근 패턴을 보면 새벽 2-3시와 저녁 7-8시에 울음이 집중되는 경향이 있으니, 이 시간대를 주의 깊게 관찰하시면 좋겠습니다."

**작성 분량**: 최소 2-3개 문단

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[5. 추천 행동] 보호자를 위한 제안
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**목표**: 실행 가능한 구체적인 돌봄 가이드 제공

**포함 내용**:

A. 즉시 실행 가능한 조치 (3-5가지)
데이터에서 발견된 패턴을 기반으로 구체적인 액션 제안
- 예시 1: "배고픔 울음이 많으므로, 수유 간격을 30분 정도 앞당겨 보세요."
- 예시 2: "새벽 2-3시 울음을 줄이기 위해, 자기 전 수유량을 10-20ml 늘려보는 것을 권장합니다."
- 예시 3: "저녁 시간대 울음이 많으니, 오후 5시경부터 조명을 어둡게 하고 조용한 환경을 만들어 주세요."

B. 중기 개선 전략 (2-3가지)
- 수면 루틴 정립 방법
- 수유 스케줄 조정 가이드
- 환경 개선 사항 (온도, 소음, 조명 등)

C. 보호자 조치 효과 분석 (topActions 데이터 활용)
- 가장 효과적이었던 조치 강조
- 개선이 필요한 조치 제안
- 예시: "수유가 가장 효과적이었습니다(효과도 85%). 반면 기저귀 교체의 효과가 낮았으니, 교체 타이밍을 재검토해 보세요."

D. 전문가 상담이 필요한 케이스
- 어떤 경우에 소아과 방문이 필요한지
- 예시: "하루 울음 횟수가 15회 이상이거나, 높은 심각도 울음이 30% 이상이면 소아과 상담을 권장합니다."

E. 마무리 격려 메시지
- 따뜻하고 지지적인 톤
- 예시: "매일 아기를 돌보시느라 수고가 많으십니다. 이런 패턴 분석이 조금이나마 도움이 되길 바랍니다. 아기도 보호자님도 함께 성장하고 있습니다."

**작성 분량**: 최소 6-8개 문단 (가장 풍부하게 작성)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
전체 공통 스타일 가이드
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **톤 & 보이스**:
   - 대상: 아기 보호자 (주로 부모)
   - 존댓말 사용, 전문적이면서도 따뜻한 톤
   - 불안을 주지 않고 안심시키는 표현
   - 전문 용어는 쉬운 말로 풀어서 설명

2. **구조와 가독성**:
   - 각 섹션은 명확히 구분 ([섹션명] 형식 유지)
   - 문단은 2-4문장으로 구성
   - 중요한 수치나 시간은 구체적으로 명시
   - 적절한 줄바꿈으로 가독성 확보

3. **데이터 활용**:
   - 제공된 summaryData의 모든 주요 지표 활용
   - 수치는 반드시 설명과 함께 제시
   - 백분율, 평균, 추세 등 다양한 관점에서 분석

4. **금지 사항**:
   - 이모지 사용 금지 (😊, 😢 등)
   - 과도하게 단정적인 표현 금지
   - 의학적 진단 표현 금지 ("질병이 있습니다" 등)
   - 지나치게 짧은 문장이나 불완전한 설명 금지

5. **분량 가이드**:
   - 전체 리포트: 최소 20-30개 문단
   - 각 섹션당: 최소 3-6개 문단
   - [5. 추천 행동]이 가장 길어야 함 (6-8개 문단)
`;

/**
 * summaryData(JSON)를 기반으로 AI 보고서 문자열 생성
 */
export async function generateAiReport(summaryData) {
  // 데이터 전처리: 한국 시간대로 변환
  let nextCryTimeKST = null;
  if (summaryData.nextCryPredictionTime) {
    try {
      const utcDate = new Date(summaryData.nextCryPredictionTime);
      // UTC+9 (한국 시간)
      const kstDate = new Date(utcDate.getTime() + (9 * 60 * 60 * 1000));
      nextCryTimeKST = kstDate.toLocaleString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch (err) {
      console.warn('시간 변환 오류:', err);
    }
  }

  // 울음 원인별 TOP 3 추출
  const topCryTypes = (summaryData.byCryType || [])
    .slice(0, 3)
    .map(item => `${item.label}: ${item.count}회 (${item.percentage}%), 평균 ${item.avgDurationFormatted}`)
    .join('\n  - ');

  // 시간대별 울음이 많은 구간 추출
  const peakHours = (summaryData.byHour || [])
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => `${h.hour}시: ${h.count}회`)
    .join(', ');

  // 보호자 조치 효과 분석
  const topActionsText = (summaryData.topActions || [])
    .slice(0, 3)
    .map((action, idx) => 
      `${idx + 1}. ${action.label}: ${action.count}회 실행, 효과도 ${(action.avgEffectiveness * 100).toFixed(0)}%`
    )
    .join('\n  ');

  const userPrompt = `
다음은 특정 아기에 대한 울음 데이터 요약입니다.
위에서 정의한 "스타일 가이드"와 "보고서 구조"에 따라, 상세하고 풍부한 내용의 리포트를 작성해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 데이터 요약
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**기본 통계**:
- 분석 기간: ${summaryData.period}
- 총 울음 횟수: ${summaryData.totalEvents}회
- 총 울음 시간: ${summaryData.totalDurationFormatted}
- 평균 울음 시간: ${summaryData.avgDurationFormatted}
- 최대 심각도: ${summaryData.maxSeverity}

**울음 원인 TOP 3**:
  - ${topCryTypes}

**울음이 많은 시간대**:
  ${peakHours}

**심각도 분포**:
${(summaryData.bySeverity || []).map(s => `  - ${s.severity}: ${s.count}회 (${s.percentage}%)`).join('\n')}

**보호자 조치 효과**:
  ${topActionsText || '데이터 없음'}

**다음 울음 예측**:
  ${nextCryTimeKST || 'null (예측 불가)'}

**또래 집단 비교 (Peer Analytics)**:
  - 현재 아기 월령: ${summaryData.peerComparison?.targetAgeMonths || '알 수 없음'}개월
  - 동일 월령 아기들의 하루 평균 울음 횟수: ${summaryData.peerComparison?.peerDailyAvgEvents || '데이터 없음'}회
  - 우리 아기의 하루 평균 울음 횟수: ${(summaryData.summary.totalEvents / 7).toFixed(1)}회

**멀티모달 교차 분석 데이터 (기저귀/피부 AI 분석 기록)**:
  ${summaryData.visionAnalysis && summaryData.visionAnalysis.length > 0 
    ? summaryData.visionAnalysis.map(v => `- [${v.type}] 심각도 ${v.severity}: ${v.opinion}`).join('\n  ') 
    : '최근 분석 기록 없음'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 작성 지침
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 위 데이터를 충분히 활용하여 구체적이고 상세하게 작성하세요.
2. 각 섹션은 최소 3-6개 문단으로 구성하세요.
3. [5. 추천 행동] 섹션은 특히 풍부하게 작성하세요 (6-8개 문단).
4. nextCryPredictionTime이 null이면, 대신 일반적인 패턴 정보를 제공하세요.
5. 수치와 백분율을 적극 활용하여 구체성을 높이세요.
6. 보호자가 즉시 실행할 수 있는 구체적인 조언을 포함하세요.
7. (중요) 또래 집단 데이터(Peer Analytics)가 있다면 우리 아기의 상태가 백분위 상 어느 정도인지 객관적으로 안심시켜 주세요.
8. (중요) '멀티모달 교차 분석 데이터'가 있다면, 이 정보(예: 기저귀 발진, 녹변 등)와 아기의 주된 울음 원인(예: 배앓이, 불편함) 사이의 상관관계를 강력하게 추론하여 설명하세요.

전체 리포트가 최소 20-30개 문단이 되도록 충분히 상세하게 작성해주세요.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REPORT_STYLE_GUIDE },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7, // 약간의 창의성
      max_tokens: 3000, // 충분한 토큰 할당
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ OpenAI API 오류:', error);
    
    // 폴백: 간단한 기본 리포트
    return generateFallbackReport(summaryData);
  }
}

/**
 * 의사 전용 AI 요약 리포트 생성 (Doctor's AI Briefing)
 * 최근 24시간 데이터를 기반으로 전문적인 의학적 관점의 요약 제공
 */
export async function generateDoctorSummary(infantData, recentEvents) {
  const DOCTOR_BRIEFING_PROMPT = `
당신은 소아과 전문의의 진료를 돕는 AI 의료 어시스턴트입니다.
아래 제공되는 아기의 최근 24시간 울음 분석 데이터를 바탕으로, 의사가 30초 내에 파악할 수 있는 "진료 전 요약 리포트"를 작성하세요.

[작성 지침]
1. 전문적이고 객관적인 의학적 톤을 유지하세요.
2. 불필요한 수식어나 격려 문구는 생략하고 핵심 정보만 기술하세요.
3. 가장 위험하거나 주의 깊게 봐야 할 'Red Flags'를 최상단에 배치하세요.
4. AI 분석의 신뢰도(Confidence)와 심각도(Severity)를 반드시 언급하세요.

[리포트 구조]
- 🚨 긴급도 및 위험 징후 (Urgency & Red Flags)
- 📊 주요 울음 패턴 (Key Patterns)
- 💡 AI 임상 추론 (AI Clinical Reasoning)
- 📋 권장 확인 사항 (Recommended Checks)
`;

  const eventSummary = recentEvents.map(e => 
    `- 시간: ${new Date(e.event_time).toLocaleString('ko-KR')}, 유형: ${e.cry_type}, 심각도: ${e.severity}, 신뢰도: ${e.confidence}%`
  ).join('\n');

  // ✅ 월령별 발달 맥락 추출
  const milestone = DEVELOPMENT_MILESTONES[infantData.age_months] || "일반적인 성장 단계";

  const userPrompt = `
  [환아 정보]
  - 이름: ${infantData.name}
  - 월령: ${infantData.age_months}개월
  - 성별: ${infantData.gender}
  - 📅 현재 발달 단계 특징: ${milestone}

  [최근 24시간 울음 이벤트 정보]
  ${eventSummary || '최근 데이터 없음'}

  [특이사항]
  - 상담 권장 여부: ${recentEvents.some(e => e.needs_consultation === 1) ? 'YES (긴급)' : 'NO'}

  위 발달 단계 특징과 울음 데이터를 결합하여 의사 전용 브리핑을 작성해주세요. 
  특히 현재 월령에서 나타날 수 있는 생리적 현상(예: 원더위크, 수면퇴행)과의 연관성을 언급해주세요.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DOCTOR_BRIEFING_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // 일관성 있고 객관적인 응답을 위해 낮게 설정
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ 의사 요약 생성 오류:', error);
    return "데이터 분석 중 오류가 발생했습니다. 직접 로그를 확인해 주세요.";
  }
}

/**
 * 화상 상담 대화 요약 (AI 진료 일지 생성)
 */
export async function summarizeConsultation(transcript) {
  const SUMMARY_PROMPT = `
당신은 소아과 진료 기록을 정리하는 전문 의료 서기입니다.
의사와 보호자 사이의 화상 상담 대화 내용을 바탕으로 표준 진료 일지(Clinical Note)를 작성하세요.

[일지 구조]
1. 상담 핵심 요약 (Summary)
2. 주요 증상 및 상태 (Symptoms)
3. 의사의 권고 및 처방 (Recommendations)
4. 향후 관찰 필요 사항 (Follow-up)

[작성 지침]
- 구어체(~했어요)를 전문적인 문어체(~함, ~임)로 변환하세요.
- 환아의 건강과 직접적인 관련이 없는 잡담은 제외하세요.
- 불확실한 부분은 '추정됨'으로 표기하세요.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        { role: 'user', content: `다음 대화 내용을 요약해 주세요:\n\n${transcript}` },
      ],
      temperature: 0.3,
    });

    return response.choices[0].message.content;
  } catch (err) {
    console.error('❌ 상담 요약 오류:', err);
    return "상담 내용 요약에 실패했습니다.";
  }
}

/**
 * 아기 하루 데이터를 기반으로 감성적인 'AI 성장 일기' 생성
 */
export async function generateDailyDiary(infantData, summaryData) {
  const DIARY_PROMPT = `
당신은 아기의 시점에서 부모님께 편지를 쓰는 "성장 일기 AI"입니다.
제공된 하루 울음 데이터를 바탕으로, 오늘 하루 아기가 느꼈을 감정과 부모님의 노고에 대한 감사를 담아 다정하고 따뜻한 일기를 작성해주세요.

[작성 지침]
1. 아기의 시점(1인칭)에서 작성하거나, 아기를 관찰하는 아주 따뜻한 육아 조력자의 시점에서 작성하세요.
2. "오늘 나는 배가 조금 고파서 울기도 했지만, 엄마/아빠가 금방 안아줘서 안심했어요"와 같이 데이터를 자연스럽게 녹여내세요.
3. 수치 위주의 딱딱한 보고서가 아닌, 감성적이고 따뜻한 문체(~해요, ~했어요)를 사용하세요.
4. 마지막에는 부모님께 드리는 격려와 사랑의 메시지를 꼭 포함하세요.
5. 이모지를 적절히 사용하여 생동감을 주되, 너무 과하지 않게 하세요.

[구조]
- 제목: 오늘 우리의 기록 (날짜 포함 가능)
- 본문: 하루의 흐름과 주요 사건(울음의 의미)에 대한 이야기
- 맺음말: 부모님을 향한 응원
`;

  const userPrompt = `
[아기 정보]
- 이름: ${infantData.name}
- 월령: ${infantData.age_months}개월

[오늘의 데이터 요약]
- 총 울음 횟수: ${summaryData.totalEvents}회
- 가장 많았던 울음 원인: ${summaryData.topCryType}
- 가장 효과적이었던 부모님의 조치: ${summaryData.bestAction}
- 심각했던 순간: ${summaryData.highSeverityCount}회

위 데이터를 바탕으로 따뜻한 성장 일기를 작성해주세요.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: DIARY_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8, // 감성적인 표현을 위해 조금 높게 설정
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ AI 일기 생성 오류:', error);
    return `${infantData.name}와 함께한 소중한 하루였습니다. 오늘은 아기가 ${summaryData.topCryType} 때문에 조금 힘들었지만 부모님의 사랑으로 잘 이겨냈어요. 내일은 더 많이 웃는 하루가 될 거예요.`;
  }
}

/**
 * 간단한 기본 리포트 생성 (폴백용)
 */
function generateFallbackReport(summaryData) {
  return `
[요약] 이번 기간 울음 현황

분석 기간 ${summaryData.period} 동안 총 ${summaryData.totalEvents}회의 울음이 관찰되었습니다. 총 울음 시간은 ${summaryData.totalDurationFormatted}이며, 1회당 평균 ${summaryData.avgDurationFormatted} 정도 지속되었습니다.

전반적으로 ${summaryData.totalEvents > 30 ? '울음 횟수가 다소 많은 편' : '안정적인 패턴'}을 보이고 있습니다.

[울음 패턴 분석]

울음 원인별로 살펴보면, ${summaryData.byCryType && summaryData.byCryType.length > 0 ? `${summaryData.byCryType[0].label}이(가) 전체의 ${summaryData.byCryType[0].percentage}%로 가장 빈번하게 나타났습니다.` : '다양한 원인이 고르게 분포되어 있습니다.'}

시간대별로는 ${summaryData.byHour ? '일정한 패턴' : '불규칙한 패턴'}을 보이고 있습니다.

[해석] 아기의 상태 추정

현재 데이터를 종합해 볼 때, 아기는 ${summaryData.totalEvents > 40 ? '환경 적응 과정' : '비교적 안정적인 상태'}에 있는 것으로 추정됩니다. 

지속적인 관찰과 기록을 통해 더 정확한 패턴 파악이 가능할 것입니다.

[다음 울음 예측]

${summaryData.nextCryPredictionTime ? `패턴 분석 결과, 가까운 시일 내에 울음이 발생할 가능성이 있습니다.` : '현재 데이터만으로는 정확한 예측이 어렵습니다. 최근 패턴을 주의 깊게 관찰하시기 바랍니다.'}

[추천 행동] 보호자를 위한 제안

1. 가장 빈번한 울음 원인에 대한 예방적 조치를 취해보세요.
2. 울음이 집중되는 시간대 전후로 아기의 상태를 체크하세요.
3. 규칙적인 수유와 수면 루틴을 유지하세요.
4. 필요시 소아과 전문의와 상담하시기 바랍니다.

매일 아기를 돌보시느라 수고가 많으십니다. 이 분석이 조금이나마 도움이 되기를 바랍니다.
`;
}
