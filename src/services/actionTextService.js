import { openai } from '../config/openai.js';

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

export async function createActionText(cause, infantName, severity) {
  const causeKorean = mapCauseToKorean(cause);
  const severityKo = severityToKorean(severity);

  const prompt = `
너는 아기를 돌보는 보호자에게 간단한 조치 방법을 알려주는 도우미야.
다음 정보를 참고해서 한글로 1~2문장 정도의 짧은 조치 문장을 만들어줘.

- 아이 이름: ${infantName}
- 울음의 원인(추정): ${causeKorean}
- 울음의 강도: ${severityKo}

문장은 공손하지만 너무 딱딱하지 않게 써줘.
`;

  const response = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
  });

  // responses.create 구조에서 첫 번째 텍스트 꺼내기
  const output = response.output?.[0]?.content?.[0]?.text ?? '아기를 살펴봐 주세요.';
  return output.trim();
}
