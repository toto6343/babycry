import express from 'express';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/stats/:ageMonths', authRequired, async (req, res) => {
  const { ageMonths } = req.params;
  let conn;
  try {
    conn = await getConnection();
    
    // 해당 월령(±1개월) 아기들의 가장 흔한 울음 원인 TOP 3
    // (간단히 모든 데이터 중 비율로 계산하는 쿼리 예시)
    const result = await conn.execute(
      `SELECT cry_type, COUNT(*) as cnt
       FROM cry_event ce
       JOIN infant i ON ce.infant_id = i.infant_id
       WHERE TRUNC(MONTHS_BETWEEN(SYSDATE, i.birth_date)) BETWEEN :age - 1 AND :age + 1
       GROUP BY cry_type
       ORDER BY cnt DESC
       FETCH FIRST 3 ROWS ONLY`,
      { age: Number(ageMonths) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const totalRes = await conn.execute(
      `SELECT COUNT(*) as total
       FROM cry_event ce
       JOIN infant i ON ce.infant_id = i.infant_id
       WHERE TRUNC(MONTHS_BETWEEN(SYSDATE, i.birth_date)) BETWEEN :age - 1 AND :age + 1`,
      { age: Number(ageMonths) },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const totalEvents = totalRes.rows[0].TOTAL || 1; // 0 나누기 방지

    const stats = result.rows.map(row => ({
      type: row.CRY_TYPE,
      percentage: Math.round((row.CNT / totalEvents) * 100)
    }));

    res.json({ success: true, stats, totalEvents });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

export default router;
