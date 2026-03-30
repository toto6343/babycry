import express from 'express';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = express.Router();

// 1. 내 뱃지 목록 가져오기
router.get('/', authRequired, async (req, res) => {
  let conn;
  try {
    const guardianId = req.user.guardianId;
    conn = await getConnection();
    
    // 마스터 뱃지 목록과 사용자가 획득한 뱃지를 LEFT JOIN
    const result = await conn.execute(
      `SELECT 
         b.badge_id, b.badge_name, b.description, b.icon_url,
         u.earned_at,
         CASE WHEN u.user_badge_id IS NOT NULL THEN 1 ELSE 0 END as is_earned
       FROM badges_master b
       LEFT JOIN user_badges u ON b.badge_id = u.badge_id AND u.guardian_id = :guardianId
       ORDER BY is_earned DESC, b.badge_id ASC`,
      { guardianId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ success: true, badges: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// 2. 뱃지 획득 검사 (다른 API에서 호출 가능하도록 유틸 형태로도 분리 가능)
router.post('/check', authRequired, async (req, res) => {
  const { eventType } = req.body; // 'first_cry', 'tenth_cry', 'health_check'
  const guardianId = req.user.guardianId;
  let conn;
  try {
    conn = await getConnection();
    
    let badgeIdToAward = null;
    if (eventType === 'first_cry') badgeIdToAward = 'FIRST_CRY';
    else if (eventType === 'tenth_cry') badgeIdToAward = 'TENTH_CRY';
    else if (eventType === 'health_check') badgeIdToAward = 'HEALTH_CHECKER';

    if (!badgeIdToAward) return res.json({ success: true, newlyEarned: false });

    // 이미 있는지 확인
    const checkResult = await conn.execute(
      `SELECT user_badge_id FROM user_badges WHERE guardian_id = :gId AND badge_id = :bId`,
      { gId: guardianId, bId: badgeIdToAward }
    );

    if (checkResult.rows.length === 0) {
      await conn.execute(
        `INSERT INTO user_badges (guardian_id, badge_id) VALUES (:gId, :bId)`,
        { gId: guardianId, bId: badgeIdToAward },
        { autoCommit: true }
      );
      return res.json({ success: true, newlyEarned: true, badgeId: badgeIdToAward });
    }
    res.json({ success: true, newlyEarned: false });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

export default router;
