// src/services/actionEmbeddingService.js
import { getOpenAI } from '../config/openai.js';
import { getConnection } from '../db/oracle.js';

const openai = getOpenAI();
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

export async function createAndSaveEmbedding(actionId) {
  const conn = await getConnection();
  try {
    // 1) action_log + cry_event 조인해서 상황정보 가져오기
    const result = await conn.execute(
      `
      SELECT
        a.action_detail,
        a.result,
        e.cry_type,
        e.severity
      FROM action_log a
      JOIN cry_event e ON a.event_id = e.event_id
      WHERE a.action_id = :actionId
      `,
      { actionId },
      { outFormat: conn.oracleDb?.OUT_FORMAT_OBJECT || undefined }
    );

    if (!result.rows || result.rows.length === 0) {
      console.warn('⚠ action_id에 해당하는 action_log 를 찾지 못했습니다:', actionId);
      return;
    }

    const row = result.rows[0];

    const detail = row.ACTION_DETAIL;
    const cause = row.CRY_TYPE || 'unknown';
    const severity = row.SEVERITY || 'Unknown';

    // 2) 임베딩에 넣을 입력 문자열 구성 (상황+조치)
    const embeddingInput = `
원인: ${cause}
강도: ${severity}
조치: ${detail}
`.trim();

    const resp = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: embeddingInput,
    });

    const vector = resp.data[0].embedding; // 숫자 배열

    // 2) DB에 JSON 문자열로 저장
    await conn.execute(
      `
      INSERT INTO action_embedding (
        action_id,
        model_name,
        embedding_json,
        created_at
      ) VALUES (
        :actionId,
        :modelName,
        :embeddingJson,
        SYSTIMESTAMP
      )
      `,
      {
        actionId,
        modelName: EMBEDDING_MODEL,
        embeddingJson: JSON.stringify(vector),
      },
      { autoCommit: true }
    );
  } finally {
    await conn.close();
  }
}
