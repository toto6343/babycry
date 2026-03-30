// src/routes/eventRoutes.js
import express from 'express';
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';

const router = express.Router();

/**
 * POST /api/events/create
 * - FastAPI에서 울음 분석 결과를 받아서 cry_event 테이블에 저장
 */
router.post('/create', async (req, res) => {
  const { 
    infant_id, 
    reason,        // cry_type
    severity, 
    confidence,
    duration,      // duration_ms (초 단위로 받아서 밀리초로 변환)
    timestamp,
    needs_consultation // ✅ 추가
  } = req.body;

  console.log('📥 이벤트 저장 요청:', req.body);

  if (!infant_id || !reason) {
    return res.status(400).json({ 
      success: false,
      message: 'infant_id and reason are required' 
    });
  }

  // ✅ cry_type 매핑 (모델 학습 카테고리 기준)
  const cryTypeMapping = {
    'belly_pain': 'belly_pain',
    'cold_hot': 'cold_hot',
    'burping': 'burping',
    'discomfort': 'discomfort',
    'hungry': 'hungry',
    'tired': 'tired',
    'emotional': 'emotional',
    // 예외 케이스 처리
    'needs_attention': 'discomfort',  // 기본값
    'pain': 'belly_pain',
    'uncomfortable': 'discomfort',
    'not_cry': 'emotional'
  };

  const mappedCryType = cryTypeMapping[reason] || 'discomfort';

  // ✅ severity 정규화 (첫 글자만 대문자)
  const normalizedSeverity = severity 
    ? severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase() 
    : 'Medium';

  console.log(`🔄 매핑: ${reason} → ${mappedCryType}, ${severity} → ${normalizedSeverity}`);

  let conn;
  try {
    conn = await getConnection();
    
    // ✅ needs_consultation을 1 또는 0으로 변환
    const needsConsultationVal = (needs_consultation === true || needs_consultation === 1 || needs_consultation === 'Y') ? 1 : 0;
    
    const result = await conn.execute(
      `
      INSERT INTO cry_event (
        infant_id,
        event_time,
        duration_ms,
        confidence,
        severity,
        cry_type,
        detected_by,
        is_resolved,
        needs_consultation,
        created_at
      ) VALUES (
        :infantId,
        :eventTime,
        :durationMs,
        :confidence,
        :severity,
        :cryType,
        :detectedBy,
        :isResolved,
        :needsConsultation,
        SYSTIMESTAMP
      )
      RETURNING event_id INTO :eventId
      `,
      {
        infantId: Number(infant_id),
        eventTime: timestamp ? new Date(timestamp) : new Date(),
        durationMs: duration ? Number(duration) * 1000 : null, // 초 → 밀리초
        confidence: confidence ? Number(confidence) : null,
        severity: normalizedSeverity,
        cryType: mappedCryType,
        detectedBy: 'AI_MODEL', 
        isResolved: 0, 
        needsConsultation: needsConsultationVal,
        eventId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const eventId = result.outBinds.eventId[0];

    console.log(`✅ 이벤트 저장 완료: event_id=${eventId}`);

    res.json({
      success: true,
      event_id: eventId,
      message: 'Cry event saved successfully'
    });

  } catch (err) {
    console.error('❌ 이벤트 저장 에러:', err);
    res.status(500).json({
      success: false,
      message: 'Error saving cry event',
      error: err.message
    });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

export default router;