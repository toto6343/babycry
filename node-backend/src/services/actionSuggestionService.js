// src/services/actionSuggestionService.js
import { getConnection } from '../db/oracle.js';

/**
 * 1차 버전: 임베딩 없이, 텍스트 그대로 그룹핑
 *  - 나중에 임베딩으로 비슷한 텍스트 묶는 로직을 여기에 추가
 */
export async function getBestActionGroupsForCause(cause, options = {}) {
  const { minTrials = 2 } = options;
  const conn = await getConnection();

  try {
    // cry_type = cause 인 이벤트에 연결된 action_log 불러오기
    const result = await conn.execute(
      `
      SELECT
        a.action_detail,
        a.result,
        e.cry_type
      FROM action_log a
      JOIN cry_event e ON a.event_id = e.event_id
      WHERE e.cry_type = :cause
      `,
      { cause },
      { outFormat: conn.oracleDb?.OUT_FORMAT_OBJECT || undefined }
    );

    const rows = result.rows || [];
    const byDetail = {};

    for (const row of rows) {
      const detail = row.ACTION_DETAIL;
      const res = (row.RESULT || '').toLowerCase();

      if (!byDetail[detail]) {
        byDetail[detail] = { detail, trials: 0, success: 0, partial: 0, fail: 0 };
      }
      byDetail[detail].trials += 1;

      if (res === 'success') byDetail[detail].success += 1;
      else if (res === 'partial') byDetail[detail].partial += 1;
      else if (res === 'fail') byDetail[detail].fail += 1;
    }

    const groups = Object.values(byDetail).map((g) => {
      const successRate = g.trials > 0 ? g.success / g.trials : 0;
      const score = successRate * Math.log(1 + g.trials); // 시행횟수도 반영
      return { ...g, successRate, score };
    });

    // 최소 시행 횟수 필터
    const filtered = groups.filter((g) => g.trials >= minTrials);

    // 점수로 정렬
    filtered.sort((a, b) => b.score - a.score);

    return filtered; // 상위 N개는 문자 만들 때 골라 쓰기
  } finally {
    await conn.close();
  }
}
