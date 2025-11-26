// src/services/actionTextService.js
import { getOpenAI } from '../config/openai.js';
const openai = getOpenAI();

/**
 * 원인 코드를 한글 설명으로 변환 (프롬프트용)
 */
function mapCauseToKorean(cause) {
  switch (cause) {
    case 'hungry':
      return '배고픈 것으로 보입니다.';
    case 'burping':
      return '트림이 필요해 보입니다.';
    case 'belly_pain':
      return '배 통증이 있는 것으로 보입니다.';
    case 'cold_hot':
      return '주변 온도(차갑거나 뜨거움)로 인한 것으로 보입니다.';
    case 'discomfort':
      return '자세나 기저귀 등으로 불편한 것으로 보입니다.';
    case 'emotional':
      return '정서적 이유(불안, 외로움 등)로 보입니다.';
    case 'tired':
      return '피곤하거나 졸린 것으로 보입니다.';
    default:
      return '원인을 정확히 파악하지 못했습니다.';
  }
}

// severity(low/medium/high)를 한글로 변환 (보고서/프롬프트용)
function severityToKorean(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'low':
      return '약한 울음';
    case 'medium':
      return '보통 정도의 울음';
    case 'high':
      return '심한 울음';
    default:
      return '울음 강도 정보 없음';
  }
}

/**
 * OpenAI를 사용해 보호자에게 보여줄 "추천 조치 문장" 생성
 * - OpenAI 호출이 실패하면 (5xx 등) 기본 문장으로 graceful fallback
 */
export async function createActionText(cause, infantName, severity, bestActions = []) {
  const causeKorean = mapCauseToKorean(cause);
  const severityKo = severityToKorean(severity);

  // 과거 조치 요약 텍스트
  let historyText = '과거 보호자 조치 기록이 충분하지 않습니다.';
  if (bestActions.length > 0) {
    const lines = bestActions.slice(0, 3).map((a, idx) => {
      const rate = Math.round(a.successRate * 100);
      return `${idx + 1}. "${a.detail}"  — 시도 횟수: ${a.trials}회, 성공률: ${rate}%`;
    });
    historyText = lines.join('\n');
  }

  const prompt = `
너는 아기를 돌보는 보호자에게 간단한 조치 방법을 알려주는 도우미야.
다음 정보를 참고해서 한글로 1~2문장 정도의 짧은 조치 문장을 만들어줘.

- 아이 이름: ${infantName}
- 울음의 원인(추정): ${causeKorean}
- 울음의 강도: ${severityKo}

[과거 보호자 조치 기록 요약]
${historyText}

규칙:
- 위 과거 조치 기록 중에서 "시행 횟수"와 "성공률"이 높은 조치들을 우선 참고해서,
  보호자에게 가장 도움이 될 만한 조치를 제안해줘.
- 단, 그대로 복붙하지 말고 현재 원인과 강도를 고려해서 자연스럽게 재구성해.
- 문장은 공손하지만 너무 딱딱하지 않게 써줘.
`;

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      input: prompt,
    });

    // responses.create 결과에서 첫 번째 텍스트 꺼내기
    const output =
      response.output?.[0]?.content?.[0]?.text ?? '아기를 한 번 살펴봐 주세요.';
    return output.trim();
  } catch (error) {
    // 🔥 OpenAI 쪽 에러가 나더라도 알림 전체가 죽지 않도록 예외 처리
    console.error('⚠ OpenAI createActionText error:', error);

    // 원인/강도 정보를 활용한 기본 조치 문장 반환 (fallback)
    return `${infantName}의 상태를 확인하시고, ${causeKorean} 상황과 ${severityKo}을(를) 고려해서 차분히 안아주고 주변 환경(기저귀, 온도, 수유 간격 등)을 점검해 주세요.`;
  }
}
