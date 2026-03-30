// src/routes/videoCallRoutes.js - 의사 대시보드 API 추가 버전
import express from 'express';
import oracledb from 'oracledb';
import dbConfig from '../db/oracle.js';
import { authRequired, doctorOnly } from '../middleware/authMiddleware.js';
import { summarizeConsultation } from '../services/aiReportService.js'; // ✅ 추가

const router = express.Router();

// ... (기존 코드)

// ✅ 🆕 상담 대화 자동 요약 및 저장 API
router.post('/sessions/:sessionId/auto-summary', authRequired, async (req, res) => {
  let connection;
  try {
    const { sessionId } = req.params;
    const { transcript } = req.body;

    if (!transcript || transcript.length < 10) {
      return res.status(400).json({ success: false, message: '요약할 대화 내용이 부족합니다.' });
    }

    console.log(`🤖 상담 자동 요약 시작: ${sessionId}`);
    
    // 1) AI 요약 생성
    const summary = await summarizeConsultation(transcript);

    // 2) DB 저장 (DIAGNOSIS 컬럼 활용)
    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      `UPDATE VIDEO_CALL_SESSIONS 
       SET DIAGNOSIS = :summary,
           UPDATED_AT = SYSTIMESTAMP
       WHERE SESSION_ID = :sessionId`,
      { sessionId, summary },
      { autoCommit: true }
    );

    res.json({
      success: true,
      summary,
      message: 'AI 진료 일지가 자동 생성 및 저장되었습니다.'
    });

  } catch (error) {
    console.error('❌ 자동 요약 에러:', error);
    res.status(500).json({ success: false, message: '자동 요약 생성 중 오류가 발생했습니다.' });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (err) {}
    }
  }
});

// 사용 가능한 의사 목록 조회
router.get('/doctors/available', authRequired, async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    
    const result = await connection.execute(
      `SELECT 
        DOCTOR_ID,
        DOCTOR_NAME,
        SPECIALTY,
        EXPERIENCE_YEARS,
        RATING,
        IS_AVAILABLE,
        PROFILE_IMAGE,
        LICENSE_NUMBER,
        PHONE,
        EMAIL
      FROM DOCTORS
      WHERE IS_AVAILABLE = 1
      ORDER BY RATING DESC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      success: true,
      doctors: result.rows
    });

  } catch (error) {
    console.error('❌ 의사 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: '의사 목록을 불러오는데 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 화상 통화 세션 생성
router.post('/sessions', authRequired, async (req, res) => {
  let connection;
  try {
    const { doctorId, infantId, scheduledTime } = req.body;
    const guardianId = req.user.guardianId;

    connection = await oracledb.getConnection(dbConfig);

    // 세션 ID 생성
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await connection.execute(
      `INSERT INTO VIDEO_CALL_SESSIONS 
        (SESSION_ID, GUARDIAN_ID, DOCTOR_ID, INFANT_ID, SCHEDULED_TIME, STATUS, CREATED_AT)
      VALUES 
        (:sessionId, :guardianId, :doctorId, :infantId, 
         TO_TIMESTAMP(:scheduledTime, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'), 
         'SCHEDULED', SYSTIMESTAMP)`,
      {
        sessionId,
        guardianId,
        doctorId,
        infantId,
        scheduledTime: scheduledTime || new Date().toISOString()
      },
      { autoCommit: true }
    );

    console.log(`✅ 화상 통화 세션 생성: ${sessionId}`);

    res.json({
      success: true,
      sessionId,
      message: '화상 통화 세션이 생성되었습니다.'
    });

  } catch (error) {
    console.error('❌ 세션 생성 실패:', error);
    res.status(500).json({
      success: false,
      message: '세션 생성에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 세션 상태 업데이트
router.put('/sessions/:sessionId/status', authRequired, async (req, res) => {
  let connection;
  try {
    const { sessionId } = req.params;
    const { status } = req.body;

    connection = await oracledb.getConnection(dbConfig);

    const updateData = {
      sessionId,
      status
    };

    let query = `UPDATE VIDEO_CALL_SESSIONS 
                 SET STATUS = :status`;

    if (status === 'ACTIVE') {
      query += `, START_TIME = SYSTIMESTAMP`;
    } else if (status === 'COMPLETED') {
      query += `, END_TIME = SYSTIMESTAMP`;
      query += `, DURATION_MINUTES = ROUND(EXTRACT(DAY FROM (SYSTIMESTAMP - START_TIME)) * 24 * 60 + 
                  EXTRACT(HOUR FROM (SYSTIMESTAMP - START_TIME)) * 60 + 
                  EXTRACT(MINUTE FROM (SYSTIMESTAMP - START_TIME)))`;
    }

    query += `, UPDATED_AT = SYSTIMESTAMP WHERE SESSION_ID = :sessionId`;

    await connection.execute(query, updateData, { autoCommit: true });

    console.log(`✅ 세션 상태 업데이트: ${sessionId} -> ${status}`);

    res.json({
      success: true,
      message: '세션 상태가 업데이트되었습니다.'
    });

  } catch (error) {
    console.error('❌ 세션 상태 업데이트 실패:', error);
    res.status(500).json({
      success: false,
      message: '세션 상태 업데이트에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 세션 정보 조회
router.get('/sessions/:sessionId', authRequired, async (req, res) => {
  let connection;
  try {
    const { sessionId } = req.params;

    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT 
        s.SESSION_ID,
        s.GUARDIAN_ID,
        s.DOCTOR_ID,
        s.INFANT_ID,
        s.STATUS,
        s.START_TIME,
        s.END_TIME,
        s.SCHEDULED_TIME,
        s.DURATION_MINUTES,
        d.DOCTOR_NAME,
        d.SPECIALTY,
        g.NAME as GUARDIAN_NAME,
        i.NAME as INFANT_NAME
      FROM VIDEO_CALL_SESSIONS s
      LEFT JOIN DOCTORS d ON s.DOCTOR_ID = d.DOCTOR_ID
      LEFT JOIN GUARDIAN g ON s.GUARDIAN_ID = g.GUARDIAN_ID
      LEFT JOIN INFANT i ON s.INFANT_ID = i.INFANT_ID
      WHERE s.SESSION_ID = :sessionId`,
      { sessionId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '세션을 찾을 수 없습니다.'
      });
    }

    res.json({
      success: true,
      session: result.rows[0]
    });

  } catch (error) {
    console.error('❌ 세션 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: '세션 조회에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 사용자의 화상 통화 이력 조회
router.get('/history', authRequired, async (req, res) => {
  let connection;
  try {
    const guardianId = req.user.guardianId;

    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT 
        s.SESSION_ID,
        s.STATUS,
        s.START_TIME,
        s.END_TIME,
        s.SCHEDULED_TIME,
        s.DURATION_MINUTES,
        d.DOCTOR_NAME,
        d.SPECIALTY,
        i.NAME as INFANT_NAME
      FROM VIDEO_CALL_SESSIONS s
      LEFT JOIN DOCTORS d ON s.DOCTOR_ID = d.DOCTOR_ID
      LEFT JOIN INFANT i ON s.INFANT_ID = i.INFANT_ID
      WHERE s.GUARDIAN_ID = :guardianId
      ORDER BY s.CREATED_AT DESC`,
      { guardianId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      success: true,
      sessions: result.rows
    });

  } catch (error) {
    console.error('❌ 이력 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: '이력 조회에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 통화 메모 저장 (의사용)
router.post('/sessions/:sessionId/notes', authRequired, async (req, res) => {
  let connection;
  try {
    const { sessionId } = req.params;
    const { notes, diagnosis, prescription } = req.body;

    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(
      `UPDATE VIDEO_CALL_SESSIONS 
       SET NOTES = :notes,
           DIAGNOSIS = :diagnosis,
           PRESCRIPTION = :prescription,
           UPDATED_AT = SYSTIMESTAMP
       WHERE SESSION_ID = :sessionId`,
      { sessionId, notes, diagnosis, prescription },
      { autoCommit: true }
    );

    console.log(`✅ 통화 메모 저장: ${sessionId}`);

    res.json({
      success: true,
      message: '메모가 저장되었습니다.'
    });

  } catch (error) {
    console.error('❌ 메모 저장 실패:', error);
    res.status(500).json({
      success: false,
      message: '메모 저장에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 통화 피드백 저장
router.post('/sessions/:sessionId/feedback', authRequired, async (req, res) => {
  let connection;
  try {
    const { sessionId } = req.params;
    const { rating, videoQuality, audioQuality, connectionStable, comments } = req.body;
    const guardianId = req.user.guardianId;

    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(
      `INSERT INTO CALL_FEEDBACK 
        (SESSION_ID, GUARDIAN_ID, RATING, VIDEO_QUALITY, AUDIO_QUALITY, CONNECTION_STABLE, COMMENTS, CREATED_AT)
      VALUES 
        (:sessionId, :guardianId, :rating, :videoQuality, :audioQuality, :connectionStable, :comments, SYSTIMESTAMP)`,
      {
        sessionId,
        guardianId,
        rating,
        videoQuality,
        audioQuality,
        connectionStable: connectionStable ? 1 : 0,
        comments
      },
      { autoCommit: true }
    );

    console.log(`✅ 통화 피드백 저장: ${sessionId}`);

    res.json({
      success: true,
      message: '피드백이 저장되었습니다.'
    });

  } catch (error) {
    console.error('❌ 피드백 저장 실패:', error);
    res.status(500).json({
      success: false,
      message: '피드백 저장에 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// 의사 상세 정보 조회
router.get('/doctors/:doctorId', authRequired, async (req, res) => {
  let connection;
  try {
    const { doctorId } = req.params;

    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT 
        DOCTOR_ID,
        DOCTOR_NAME,
        SPECIALTY,
        EXPERIENCE_YEARS,
        LICENSE_NUMBER,
        PHONE,
        EMAIL,
        PROFILE_IMAGE,
        RATING,
        IS_AVAILABLE,
        CREATED_AT
      FROM DOCTORS
      WHERE DOCTOR_ID = :doctorId`,
      { doctorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '의사를 찾을 수 없습니다.'
      });
    }

    // 근무 시간도 함께 조회
    const scheduleResult = await connection.execute(
      `SELECT DAY_OF_WEEK, START_TIME, END_TIME, IS_AVAILABLE
       FROM DOCTOR_SCHEDULES
       WHERE DOCTOR_ID = :doctorId
       ORDER BY DAY_OF_WEEK`,
      { doctorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    res.json({
      success: true,
      doctor: result.rows[0],
      schedules: scheduleResult.rows
    });

  } catch (error) {
    console.error('❌ 의사 정보 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: '의사 정보를 불러오는데 실패했습니다.'
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// ========================================
// ✅ 의사 대시보드용 API (신규 추가)
// ========================================

// ✅ 의사 세션 목록 조회 (GUARDIAN_ID 기반)
router.get('/doctor/sessions', authRequired, doctorOnly, async (req, res) => {
  let connection;
  try {
    const guardianId = req.user.guardianId;
    const role = req.user.role;

    console.log(`👨‍⚕️ 의사 세션 목록 조회: guardianId=${guardianId}, role=${role}`);

    connection = await oracledb.getConnection(dbConfig);

    // GUARDIAN_ID로 DOCTOR_ID 조회
    const doctorResult = await connection.execute(
      `SELECT DOCTOR_ID FROM DOCTORS WHERE GUARDIAN_ID = :guardianId`,
      { guardianId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (doctorResult.rows.length === 0) {
      console.log('❌ 의사 정보 없음:', guardianId);
      return res.status(404).json({ 
        success: false, 
        error: '의사 정보를 찾을 수 없습니다.' 
      });
    }

    const doctorId = doctorResult.rows[0].DOCTOR_ID;
    console.log(`✅ DOCTOR_ID 조회 완료: ${doctorId}`);

    // 세션 목록 조회 (최근 30일)
    const sessionsResult = await connection.execute(
      `SELECT 
        vcs.SESSION_ID,
        vcs.STATUS,
        vcs.SCHEDULED_TIME,
        vcs.START_TIME,
        vcs.END_TIME,
        vcs.DURATION_MINUTES,
        g.NAME as GUARDIAN_NAME,
        i.NAME as INFANT_NAME
      FROM VIDEO_CALL_SESSIONS vcs
      LEFT JOIN GUARDIAN g ON vcs.GUARDIAN_ID = g.GUARDIAN_ID
      LEFT JOIN INFANT i ON vcs.INFANT_ID = i.INFANT_ID
      WHERE vcs.DOCTOR_ID = :doctorId
        AND vcs.SCHEDULED_TIME >= SYSTIMESTAMP - INTERVAL '30' DAY
      ORDER BY vcs.SCHEDULED_TIME DESC`,
      { doctorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log(`✅ 세션 ${sessionsResult.rows.length}개 조회 완료`);

    res.json({
      success: true,
      sessions: sessionsResult.rows
    });

  } catch (error) {
    console.error('❌ 의사 세션 조회 실패:', error);
    res.status(500).json({ 
      success: false, 
      error: '세션 조회에 실패했습니다.',
      details: error.message 
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// ✅ 의사 가용성 조회
router.get('/doctor/:doctorId/availability', authRequired, async (req, res) => {
  let connection;
  try {
    const { doctorId } = req.params;

    connection = await oracledb.getConnection(dbConfig);

    const result = await connection.execute(
      `SELECT IS_AVAILABLE FROM DOCTORS WHERE DOCTOR_ID = :doctorId`,
      { doctorId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: '의사 정보를 찾을 수 없습니다.' 
      });
    }

    res.json({
      success: true,
      isAvailable: result.rows[0].IS_AVAILABLE === 1
    });

  } catch (error) {
    console.error('❌ 가용성 조회 실패:', error);
    res.status(500).json({ 
      success: false, 
      error: '가용성 조회에 실패했습니다.',
      details: error.message 
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

// ✅ 의사 가용성 변경
router.put('/doctor/:doctorId/availability', authRequired, doctorOnly, async (req, res) => {
  let connection;
  try {
    const { doctorId } = req.params;
    const { isAvailable } = req.body;

    console.log(`🔄 가용성 변경 요청: doctorId=${doctorId}, isAvailable=${isAvailable}`);

    connection = await oracledb.getConnection(dbConfig);

    await connection.execute(
      `UPDATE DOCTORS 
       SET IS_AVAILABLE = :isAvailable 
       WHERE DOCTOR_ID = :doctorId`,
      { 
        isAvailable: isAvailable ? 1 : 0,
        doctorId 
      },
      { autoCommit: true }
    );

    console.log(`✅ 의사 ${doctorId} 가용성 변경: ${isAvailable}`);

    res.json({
      success: true,
      message: '가용성이 변경되었습니다.',
      isAvailable
    });

  } catch (error) {
    console.error('❌ 가용성 변경 실패:', error);
    res.status(500).json({ 
      success: false, 
      error: '가용성 변경에 실패했습니다.',
      details: error.message 
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error('Connection close error:', err);
      }
    }
  }
});

export default router;