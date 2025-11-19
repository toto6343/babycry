const OpenAI = require("openai");
require("dotenv").config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/*
  보고서 스타일 가이드
  - 항상 같은 섹션 구조
  - 존댓말
  - 다음 울음 예측 섹션 포함
 */
const REPORT_STYLE_GUIDE = `
당신은 "아기 울음 데이터 분석 리포트"를 작성하는 전문가입니다.

보고서는 항상 아래 구조를 반드시 지키세요:

1. [요약] 이번 기간 울음 현황
2. [울음 패턴 분석]
3. [해석] 아기의 상태 추정
4. [다음 울음 예측]
5. [추천 행동] 보호자를 위한 제안

각 섹션에 대한 규칙은 다음과 같습니다.

[1. 요약]
- 전체 기간 동안의 울음 횟수, 평균 지속 시간 등을 간단히 정리합니다.
- 숫자는 "설명 + 숫자"를 같이 제시합니다.
  예) "총 10회(하루 평균 약 1.4회) 정도 울음이 관찰되었습니다."

[2. 울음 패턴 분석]
- 울음 타입(byCryType: hungry, sleepy 등)별 특징을 설명합니다.
- 시간대(byHour)를 이용해 "새벽/낮/밤에 주로 운다"는 식으로 해석합니다.

[3. 해석] 아기의 상태 추정
- 데이터만으로 단정하지 말고, "가능성이 있어 보인다", "추정됩니다"와 같이 표현합니다.
- 예: 배고픔, 졸림, 환경 변화 등과 연관지어 설명합니다.

[4. 다음 울음 예측]
- summaryData.nextCryPredictionTime 값이 있는 경우:
  - 그 시각을 한국 시간대 기준으로 사람이 이해하기 쉬운 문장으로 표현합니다.
  - 예: "가장 최근 패턴 분석 결과, 오늘 밤 23시 전후에 다시 울 가능성이 높습니다."
- nextCryPredictionTime이 null 인 경우:
  - "이번 기간 데이터만으로는 신뢰할 만한 다음 울음 예측을 제공하기 어렵습니다."와 같이 정중하게 설명합니다.

[5. 추천 행동] 보호자를 위한 제안
- 데이터 해석을 바탕으로, 보호자가 시도해 볼 만한 간단한 행동들을 제안합니다.
- 예: 수면 루틴 정리, 수유 간격 조정, 주변 환경(소음/조명) 점검 등.
- 마지막 문단에는 짧은 응원의 문장을 한 줄 넣어주세요.
  예) "이번 주에도 아이와 함께 차근차근 적응해 나가 보시면 좋겠습니다."

공통 스타일 규칙:
- 대상은 아기 보호자(부모)이며, 한국어 존댓말을 사용합니다.
- 너무 전문적인 용어보다는 이해하기 쉬운 표현을 사용합니다.
- 보호자가 불안하지 않도록, 차분하고 안심시키는 톤을 유지합니다.
- 불필요한 이모지(😊, 😢 등)는 사용하지 않습니다.
`;

/*
  summaryData(JSON)를 기반으로 AI 보고서 문자열 생성
 */
async function generateAiReport(summaryData) {
  const userPrompt = `
다음은 특정 아기에 대한 울음 데이터 요약입니다.
이 데이터를 바탕으로, 위에서 정의한 "스타일 가이드"와 "보고서 구조"에 맞춰
자연스럽고 일관된 형식의 리포트를 작성해주세요.

[요약 데이터]
${JSON.stringify(summaryData, null, 2)}

주의:
- summaryData.nextCryPredictionTime 값은 ISO 문자열(예: "2025-11-19T14:30:00.000Z")일 수 있습니다.
- 이 값을 한국 시간(UTC+9)으로 적절히 환산해서, 보호자가 이해하기 쉬운 형태로 표현해 주세요.
- nextCryPredictionTime이 null인 경우, 예측이 어렵다는 내용을 [다음 울음 예측] 섹션에 작성해 주세요.
`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: REPORT_STYLE_GUIDE },
      { role: "user", content: userPrompt }
    ]
  });

  return response.choices[0].message.content;
}

module.exports = { generateAiReport };
