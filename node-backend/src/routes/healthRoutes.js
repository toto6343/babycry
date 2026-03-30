import express from 'express';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ 성장 기록 조회
router.get('/growth/:infantId', authRequired, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT measured_date, height, weight, head_circum 
       FROM infant_growth 
       WHERE infant_id = :infantId 
       ORDER BY measured_date ASC`,
      { infantId: req.params.infantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ✅ 성장 기록 추가
router.post('/growth/:infantId', authRequired, async (req, res) => {
  const { measured_date, height, weight, head_circum } = req.body;
  let conn;
  try {
    conn = await getConnection();
    await conn.execute(
      `INSERT INTO infant_growth (infant_id, measured_date, height, weight, head_circum)
       VALUES (:infantId, TO_DATE(:measured_date, 'YYYY-MM-DD'), :height, :weight, :head_circum)`,
      { infantId: req.params.infantId, measured_date, height, weight, head_circum },
      { autoCommit: true }
    );
    res.json({ success: true, message: '성장 기록이 저장되었습니다.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ✅ 예방접종 이력 조회
router.get('/vaccination/:infantId', authRequired, async (req, res) => {
  let conn;
  try {
    conn = await getConnection();
    const result = await conn.execute(
      `SELECT vaccine_id, vaccine_name, dose_number, scheduled_date, completed_date, is_completed 
       FROM vaccination_record 
       WHERE infant_id = :infantId 
       ORDER BY scheduled_date ASC`,
      { infantId: req.params.infantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) await conn.close();
  }
});

// ==========================================
// ✅ 4.0 고도화: 바이오 신호(웨어러블 연동) 시뮬레이션
// ==========================================
// 실제 상용화 시에는 DB 또는 Redis에 저장하여 관리
const vitalCache = {};

// 생체 신호 기록 (웨어러블 기기에서 호출한다고 가정)
router.post('/vitals/:infantId', async (req, res) => {
  const { infantId } = req.params;
  const { heartRate, temperature, oxygenLevel } = req.body;
  
  vitalCache[infantId] = {
    heartRate: heartRate || 120, // 정상: 100~160
    temperature: temperature || 36.5, // 정상: 36.5~37.5
    oxygenLevel: oxygenLevel || 98, // 정상: 95~100
    timestamp: new Date().toISOString()
  };
  
  console.log(`📡 [Bio-Signal] Updated for Infant ${infantId}:`, vitalCache[infantId]);
  res.json({ success: true, message: '생체 신호 업데이트 완료' });
});

// 최신 생체 신호 조회 (AI 분석 시 교차 검증용)
router.get('/vitals/:infantId', async (req, res) => {
  const { infantId } = req.params;
  const vitals = vitalCache[infantId];
  
  if (vitals) {
    res.json({ success: true, vitals });
  } else {
    // 저장된 값이 없으면 정상 범위의 더미 데이터 반환
    res.json({ 
      success: true, 
      vitals: { heartRate: 110, temperature: 36.8, oxygenLevel: 99, timestamp: new Date().toISOString() } 
    });
  }
});

export default router;
