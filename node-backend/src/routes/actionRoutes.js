// src/routes/actionRoutes.js
import express from 'express';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { createAndSaveEmbedding } from '../services/actionEmbeddingService.js';

const router = express.Router();

/**
 * GET /api/actions/dashboard?infantId=1
 * - 특정 아기의 울음 이벤트 + 문자 알림 + action_log를 한 번에 반환
 */
router.get('/dashboard', async (req, res) => {
  const { infantId } = req.query;

  if (!infantId) {
    return res.status(400).json({ message: 'infantId is required' });
  }

  const conn = await getConnection();
  try {
    const sql = `
      SELECT
        e.event_id,
        e.event_time,
        e.cry_type,
        e.severity,
        e.confidence,
        n.notification_id,
        n.sent_at,
        n.status AS notif_status,
        n.action_text,
        a.action_id,
        a.action_detail,
        a.result AS action_result,
        a.executed_at
      FROM cry_event e
      LEFT JOIN notification_log n
        ON n.event_id = e.event_id
      LEFT JOIN action_log a
        ON a.event_id = e.event_id
      WHERE e.infant_id = :infantId
      ORDER BY e.event_time DESC, a.executed_at ASC
    `;

    const result = await conn.execute(
      sql,
      { infantId: Number(infantId) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const rows = result.rows || [];
    const byEvent = {};

    for (const row of rows) {
      const eid = row.EVENT_ID;

      if (!byEvent[eid]) {
        byEvent[eid] = {
          eventId: eid,
          eventTime: row.EVENT_TIME,
          cryType: row.CRY_TYPE,
          severity: row.SEVERITY,
          confidence: row.CONFIDENCE,
          notification: row.NOTIFICATION_ID
            ? {
                notificationId: row.NOTIFICATION_ID,
                sentAt: row.SENT_AT,
                status: row.NOTIF_STATUS,
                actionText: row.ACTION_TEXT,
              }
            : null,
          actions: [],
        };
      }

      // 여러 action_log가 있을 수 있으니 "push"로 계속 추가
      if (row.ACTION_ID) {
        byEvent[eid].actions.push({
          actionId: row.ACTION_ID,
          actionDetail: row.ACTION_DETAIL,
          result: row.ACTION_RESULT,
          executedAt: row.EXECUTED_AT,
        });
      }
    }

    res.json({
      infantId: Number(infantId),
      events: Object.values(byEvent),
    });
  } catch (err) {
    console.error('Error in /api/actions/dashboard:', err);
    res.status(500).json({
      message: 'Error loading actions dashboard',
      error: err.message,
    });
  } finally {
    await conn.close();
  }
});

/**
 * POST /api/actions/record
 * body: { eventId, actionDetail, result }
 * - 보호자가 직접 조치 내용을 기록
 */
router.post('/record', async (req, res) => {
  const { eventId, actionDetail, result } = req.body;

  if (!eventId || !actionDetail) {
    return res
      .status(400)
      .json({ message: 'eventId와 actionDetail은 필수입니다.' });
  }

  const conn = await getConnection();
  try {
    const resultDb = await conn.execute(
      `
      INSERT INTO action_log (
        event_id,
        action_detail,
        result,
        executed_at,
        created_at
      ) VALUES (
        :eventId,
        :actionDetail,
        :result,
        SYSTIMESTAMP,
        SYSTIMESTAMP
      )
      RETURNING action_id INTO :actionId
      `,
      {
        eventId: Number(eventId),
        actionDetail,
        result: result || null,
        actionId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    const actionId = resultDb.outBinds.actionId[0];

    // 🔥 여기서 임베딩 생성 + 저장
    await createAndSaveEmbedding(actionId);

    res.json({
      success: true,
      message: 'Action recorded successfully',
    });
  } catch (err) {
    console.error('Error in /api/actions/record:', err);
    res.status(500).json({
      success: false,
      message: 'Error recording action',
      error: err.message,
    });
  } finally {
    await conn.close();
  }
});

/**
 * DELETE /api/actions/:actionId
 * - 보호자가 잘못 기록한 조치를 삭제
 */
router.delete('/:actionId', async (req, res) => {
  const { actionId } = req.params;

  const conn = await getConnection();
  try {
    // 1) 임베딩 먼저 삭제
    await conn.execute(
      `DELETE FROM action_embedding WHERE action_id = :actionId`,
      { actionId: Number(actionId) },
      { autoCommit: false }
    );

    // 2) action_log 삭제
    const resultDb = await conn.execute(
      `DELETE FROM action_log WHERE action_id = :actionId`,
      { actionId: Number(actionId) },
      { autoCommit: false }
    );

    if (resultDb.rowsAffected === 0) {
      await conn.rollback();
      return res.status(404).json({ message: '해당 action_id를 찾을 수 없습니다.' });
    }

    await conn.commit();

    res.json({ success: true, message: '조치가 삭제되었습니다.' });
  } catch (err) {
    console.error('Error in DELETE /api/actions/:actionId', err);
    try {
      await conn.rollback();
    } catch (_) {}
    res.status(500).json({
      success: false,
      message: '조치 삭제 중 오류',
      error: err.message,
    });
  } finally {
    await conn.close();
  }
});

router.put('/:actionId', async (req, res) => {
  const { actionId } = req.params;
  const { actionDetail, result } = req.body;

  if (!actionDetail && !result) {
    return res
      .status(400)
      .json({ message: '수정할 actionDetail 또는 result 중 하나는 있어야 합니다.' });
  }

  const conn = await getConnection();
  try {
    const resultDb = await conn.execute(
      `
      UPDATE action_log
      SET
        action_detail = COALESCE(:actionDetail, action_detail),
        result        = COALESCE(:result, result),
        executed_at   = SYSTIMESTAMP
      WHERE action_id = :actionId
      `,
      {
        actionId: Number(actionId),
        actionDetail: actionDetail ?? null,
        result: result ?? null,
      },
      { autoCommit: true }
    );

    if (resultDb.rowsAffected === 0) {
      return res.status(404).json({ message: '해당 action_id를 찾을 수 없습니다.' });
    }

    // ⚠ 임베딩도 내용 바뀌면 다시 만들어야 함
    const conn2 = await getConnection();
    try {
      await conn2.execute(
        `DELETE FROM action_embedding WHERE action_id = :actionId`,
        { actionId: Number(actionId) },
        { autoCommit: true }
      );
    } finally {
      await conn2.close();
    }

    // 새 내용 기준으로 임베딩 다시 생성
    await createAndSaveEmbedding(Number(actionId));

    res.json({ success: true, message: '조치가 수정되었습니다.' });
  } catch (err) {
    console.error('Error in PUT /api/actions/:actionId', err);
    res.status(500).json({
      success: false,
      message: '조치 수정 중 오류',
      error: err.message,
    });
  } finally {
    await conn.close();
  }
});

export default router;
