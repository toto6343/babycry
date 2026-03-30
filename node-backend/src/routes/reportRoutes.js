import express from 'express';
import { getPool } from '../db/oracle.js';
import { authRequired } from '../middleware/authMiddleware.js';
import { generateAiReport, generateDoctorSummary } from '../services/aiReportService.js'; // ✅ 추가

const router = express.Router();
const pool = getPool();

// ==========================================
// 🔥 중요: 라우트 순서
// 1. /doctor-summary/:sessionId (🆕 신규)
// 2. /auto (쿼리 파라미터)
// ...
// ==========================================

// ==========================================
// 🆕 0️⃣ GET /api/reports/doctor-summary/:sessionId - 의사용 AI 요약
// ==========================================
router.get('/doctor-summary/:sessionId', authRequired, async (req, res) => {
  console.log('📍 /api/reports/doctor-summary/:sessionId 호출');
  const { sessionId } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    // 1) 세션 정보 및 환아 정보 조회
    const sessionResult = await conn.execute(
      `SELECT 
         v.infant_id, 
         i.name, 
         TRUNC(MONTHS_BETWEEN(SYSDATE, i.birth_date)) as age_months,
         i.gender
       FROM video_call_sessions v
       JOIN infant i ON v.infant_id = i.infant_id
       WHERE v.session_id = :sessionId`,
      { sessionId }
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ message: '상담 세션 또는 환아 정보를 찾을 수 없습니다.' });
    }

    const [infantId, name, ageMonths, gender] = sessionResult.rows[0];
    const infantData = { name, age_months: ageMonths, gender };

    // 2) 최근 24시간 울음 이벤트 조회 (오디오 파일 경로 포함)
    const eventsResult = await conn.execute(
      `SELECT 
         ce.event_time, 
         ce.cry_type, 
         ce.severity, 
         ce.confidence,
         ce.needs_consultation,
         af.storage_uri
       FROM cry_event ce
       LEFT JOIN audio_file af ON ce.infant_id = af.infant_id 
         AND ABS(EXTRACT(SECOND FROM (ce.event_time - af.upload_time))) < 5
       WHERE ce.infant_id = :infantId
         AND ce.event_time >= SYSTIMESTAMP - INTERVAL '1' DAY
       ORDER BY ce.event_time DESC`,
      { infantId }
    );

    const recentEvents = eventsResult.rows.map(row => ({
      event_time: row[0],
      cry_type: row[1],
      severity: row[2],
      confidence: row[3],
      needs_consultation: row[4],
      audio_url: row[5] ? `http://localhost:5000/${row[5]}` : null // Python 정적 파일 서버 주소
    }));

    // 3) AI 요약 생성 (30초 내 파악용)
    console.log('🤖 의사용 AI 요약 브리핑 생성 중...');
    const doctorSummary = await generateDoctorSummary(infantData, recentEvents);

    res.json({
      success: true,
      infantName: name,
      doctorSummary: doctorSummary,
      eventCount: recentEvents.length,
      recentAudioUrl: recentEvents.length > 0 ? recentEvents[0].audio_url : null, // ✅ 최신 오디오
      latestEventTime: recentEvents.length > 0 ? recentEvents[0].event_time : null, // ✅ 최신 시간
      generatedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('❌ /doctor-summary 오류:', err);
    res.status(500).json({ message: '의사 요약 생성 실패', error: err.message });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('DB 연결 종료 오류:', err);
      }
    }
  }
});

// ==========================================
// 1️⃣ GET /api/reports/auto - 자동 리포트 생성
// ==========================================
router.get('/auto', authRequired, async (req, res) => {
  console.log('📍 /api/reports/auto 엔드포인트 호출');
  
  const { infantId, startDate, endDate } = req.query;
  console.log('📋 쿼리 파라미터:', { infantId, startDate, endDate });

  if (!infantId || !startDate || !endDate) {
    return res.status(400).json({
      message: 'infantId, startDate, endDate는 필수입니다.'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const result = await conn.execute(
      `SELECT 
         COUNT(*) as total_events,
         NVL(SUM(duration_ms), 0) / 1000.0 as total_duration,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= TO_DATE(:startDate, 'YYYY-MM-DD')
         AND event_time <= TO_DATE(:endDate, 'YYYY-MM-DD')`,
      { infantId, startDate, endDate }
    );

    const stats = result.rows[0];

    res.json({
      infantId: parseInt(infantId),
      period: `${startDate} ~ ${endDate}`,
      summary: {
        totalEvents: stats[0],
        totalDuration: stats[1],
        avgDuration: stats[2]
      },
      message: '자동 리포트 생성 완료'
    });

  } catch (err) {
    console.error('❌ /auto 오류:', err);
    res.status(500).json({ message: '리포트 생성 실패', error: err.message });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('DB 연결 종료 오류:', err);
      }
    }
  }
});

// ==========================================
// 2️⃣ GET /api/reports/summary/:infantId - 상세 리포트
// ==========================================
router.get('/summary/:infantId', authRequired, async (req, res) => {
  console.log('📍 /api/reports/summary/:infantId 엔드포인트 호출');
  
  const { infantId } = req.params;
  const { startDate, endDate } = req.query;

  console.log('📋 infantId:', infantId);
  console.log('📋 startDate:', startDate);
  console.log('📋 endDate:', endDate);

  if (!startDate || !endDate) {
    return res.status(400).json({
      message: 'startDate와 endDate는 필수입니다.'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1) 전체 요약 통계
    const summaryResult = await conn.execute(
      `SELECT 
         COUNT(*) as total_events,
         NVL(SUM(duration_ms), 0) / 1000.0 as total_duration,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration,
         NVL(MAX(duration_ms), 0) / 1000.0 as max_duration,
         MAX(severity) as max_severity
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const summary = summaryResult.rows[0];
    const totalEvents = summary[0];
    const totalDuration = summary[1];
    const avgDuration = summary[2];
    const maxDurationSeconds = summary[3];
    const maxSeverity = summary[4] || 'Low';

    // 2) 울음 원인별 통계
    const cryTypeResult = await conn.execute(
      `SELECT 
         cry_type,
         COUNT(*) as count,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY cry_type
       ORDER BY count DESC`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const byCryType = cryTypeResult.rows.map(row => {
      const cryType = row[0];
      const count = row[1];
      const avgDur = row[2];
      return {
        cryType: cryType,
        label: translateCause(cryType),
        count: count,
        percentage: totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : '0.0',
        avgDuration: avgDur,
        avgDurationFormatted: formatDuration(avgDur)
      };
    });

    // 3) 심각도별 통계
    const severityResult = await conn.execute(
      `SELECT 
         severity,
         COUNT(*) as count,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY severity
       ORDER BY 
         CASE severity
           WHEN 'High' THEN 1
           WHEN 'Medium' THEN 2
           WHEN 'Low' THEN 3
           ELSE 4
         END`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const bySeverity = severityResult.rows.map(row => ({
      severity: row[0],
      count: row[1],
      percentage: totalEvents > 0 ? ((row[1] / totalEvents) * 100).toFixed(1) : '0.0',
      avgDurationSeconds: row[2]
    }));

    // 4) 시간대별 통계
    const hourlyResult = await conn.execute(
      `SELECT 
         TO_NUMBER(TO_CHAR(event_time, 'HH24')) as hour,
         COUNT(*) as count,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY TO_NUMBER(TO_CHAR(event_time, 'HH24'))
       ORDER BY hour`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const hourMap = {};
    hourlyResult.rows.forEach(row => {
      hourMap[row[0]] = {
        count: row[1],
        avgDurationSeconds: row[2]
      };
    });

    const byHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourMap[i]?.count || 0,
      avgDurationSeconds: hourMap[i]?.avgDurationSeconds || 0
    }));

    // 5) 일별 추세
    const dailyResult = await conn.execute(
      `SELECT 
         TO_CHAR(event_time, 'YYYY-MM-DD') as event_date,
         COUNT(*) as count,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration,
         NVL(SUM(duration_ms), 0) / 1000.0 as total_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY TO_CHAR(event_time, 'YYYY-MM-DD')
       ORDER BY event_date`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const dailyTrend = dailyResult.rows.map(row => ({
      date: row[0],
      count: row[1],
      avgDurationFormatted: formatDuration(row[2]),
      totalDurationFormatted: formatDuration(row[3])
    }));

    // ==========================================
    // 6) 보호자 조치 TOP 5 - action_log 사용
    // ==========================================
    let topActions = [];
    try {
      const actionResult = await conn.execute(
        `SELECT * FROM (
           SELECT 
             al.action_detail,
             COUNT(*) as count,
             NVL(ROUND(AVG(
               CASE al.result
                 WHEN 'success' THEN 1.0
                 WHEN 'partial' THEN 0.6
                 WHEN 'fail' THEN 0.2
                 ELSE 0
               END
             ), 2), 0) as avg_effectiveness
           FROM action_log al
           JOIN cry_event ce ON al.event_id = ce.event_id
           WHERE ce.infant_id = :infantId
             AND ce.event_time >= :startDate
             AND ce.event_time <= :endDate
           GROUP BY al.action_detail
           ORDER BY COUNT(*) DESC
         ) WHERE ROWNUM <= 5`,
        {
          infantId,
          startDate: start,
          endDate: end
        }
      );

      topActions = actionResult.rows.map(row => ({
        actionType: row[0] || '기타 조치',
        label: row[0] || '기타 조치',
        count: row[1],
        avgEffectiveness: row[2]
      }));
      
      console.log(`✅ 보호자 조치 ${topActions.length}개 조회 완료`);
    } catch (err) {
      console.warn('⚠️ action_log 테이블 조회 실패:', err.message);
    }

    const responseData = {
      infantId: parseInt(infantId),
      period: `${start.toLocaleDateString('ko-KR')} ~ ${end.toLocaleDateString('ko-KR')}`,
      summary: {
        totalEvents,
        totalDuration,
        totalDurationFormatted: formatDuration(totalDuration),
        avgDuration,
        avgDurationFormatted: formatDuration(avgDuration),
        maxDurationSeconds,
        maxSeverity
      },
      byCryType,
      bySeverity,
      byHour,
      dailyTrend,
      topActions,
      insights: [],
      prediction: null,
      metadata: {
        generatedAt: new Date().toISOString(),
        reportVersion: '1.0',
        periodStart: start.toISOString(),
        periodEnd: end.toISOString()
      }
    };

    console.log('✅ Report 응답 데이터:', {
      totalEvents,
      cryTypeCount: byCryType.length,
      severityCount: bySeverity.length,
      topActionsCount: topActions.length
    });

    res.json(responseData);

  } catch (err) {
    console.error('❌ /summary/:infantId 오류:', err);
    res.status(500).json({ message: '리포트 조회 실패', error: err.message });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('DB 연결 종료 오류:', err);
      }
    }
  }
});

// ==========================================
// 🆕 3️⃣ GET /api/reports/text/:infantId - AI 텍스트 리포트
// ==========================================
router.get('/text/:infantId', authRequired, async (req, res) => {
  console.log('📍 /api/reports/text/:infantId 엔드포인트 호출');
  
  const { infantId } = req.params;
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({
      message: 'startDate와 endDate는 필수입니다.'
    });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const start = new Date(startDate);
    const end = new Date(endDate);

    // 1) 전체 요약 통계
    const summaryResult = await conn.execute(
      `SELECT 
         COUNT(*) as total_events,
         NVL(SUM(duration_ms), 0) / 1000.0 as total_duration,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration,
         NVL(MAX(duration_ms), 0) / 1000.0 as max_duration,
         MAX(severity) as max_severity
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const summary = summaryResult.rows[0];
    const totalEvents = summary[0];
    const totalDuration = summary[1];
    const avgDuration = summary[2];
    const maxDurationSeconds = summary[3];
    const maxSeverity = summary[4] || 'Low';

    // 2) 울음 원인별 통계
    const cryTypeResult = await conn.execute(
      `SELECT 
         cry_type,
         COUNT(*) as count,
         NVL(ROUND(AVG(duration_ms), 1), 0) / 1000.0 as avg_duration
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY cry_type
       ORDER BY count DESC`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const byCryType = cryTypeResult.rows.map(row => {
      const cryType = row[0];
      const count = row[1];
      const avgDur = row[2];
      return {
        cryType: cryType,
        label: translateCause(cryType),
        count: count,
        percentage: totalEvents > 0 ? ((count / totalEvents) * 100).toFixed(1) : '0.0',
        avgDuration: avgDur,
        avgDurationFormatted: formatDuration(avgDur)
      };
    });

    // 3) 심각도별 통계
    const severityResult = await conn.execute(
      `SELECT 
         severity,
         COUNT(*) as count
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY severity
       ORDER BY 
         CASE severity
           WHEN 'High' THEN 1
           WHEN 'Medium' THEN 2
           WHEN 'Low' THEN 3
           ELSE 4
         END`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const bySeverity = severityResult.rows.map(row => ({
      severity: row[0],
      count: row[1],
      percentage: totalEvents > 0 ? ((row[1] / totalEvents) * 100).toFixed(1) : '0.0'
    }));

    // 4) 시간대별 통계
    const hourlyResult = await conn.execute(
      `SELECT 
         TO_NUMBER(TO_CHAR(event_time, 'HH24')) as hour,
         COUNT(*) as count
       FROM cry_event
       WHERE infant_id = :infantId
         AND event_time >= :startDate
         AND event_time <= :endDate
       GROUP BY TO_NUMBER(TO_CHAR(event_time, 'HH24'))
       ORDER BY hour`,
      {
        infantId,
        startDate: start,
        endDate: end
      }
    );

    const hourMap = {};
    hourlyResult.rows.forEach(row => {
      hourMap[row[0]] = { count: row[1] };
    });

    const byHour = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      count: hourMap[i]?.count || 0
    }));

    // ==========================================
    // 5) 보호자 조치 TOP 5 - action_log 사용
    // ==========================================
    let topActions = [];
    try {
      const actionResult = await conn.execute(
        `SELECT * FROM (
           SELECT 
             al.action_detail,
             COUNT(*) as count,
             NVL(ROUND(AVG(
               CASE al.result
                 WHEN 'success' THEN 1.0
                 WHEN 'partial' THEN 0.6
                 WHEN 'fail' THEN 0.2
                 ELSE 0
               END
             ), 2), 0) as avg_effectiveness
           FROM action_log al
           JOIN cry_event ce ON al.event_id = ce.event_id
           WHERE ce.infant_id = :infantId
             AND ce.event_time >= :startDate
             AND ce.event_time <= :endDate
           GROUP BY al.action_detail
           ORDER BY COUNT(*) DESC
         ) WHERE ROWNUM <= 5`,
        {
          infantId,
          startDate: start,
          endDate: end
        }
      );

      topActions = actionResult.rows.map(row => ({
        actionType: row[0] || '기타 조치',
        label: row[0] || '기타 조치',
        count: row[1],
        avgEffectiveness: row[2]
      }));
      
      console.log(`✅ 보호자 조치 ${topActions.length}개 조회 완료`);
    } catch (err) {
      console.warn('⚠️ action_log 테이블 조회 실패:', err.message);
      topActions = [];
    }

    // summaryData 준비
    const summaryData = {
      period: `${start.toLocaleDateString('ko-KR')} ~ ${end.toLocaleDateString('ko-KR')}`,
      totalEvents,
      totalDuration,
      totalDurationFormatted: formatDuration(totalDuration),
      avgDuration,
      avgDurationFormatted: formatDuration(avgDuration),
      maxSeverity,
      byCryType,
      bySeverity,
      byHour,
      topActions,
      nextCryPredictionTime: null
    };

    // AI 텍스트 리포트 생성
    console.log('🤖 AI 텍스트 리포트 생성 중...');
    const aiReportText = await generateAiReport(summaryData);

    res.json({
      infantId: parseInt(infantId),
      period: summaryData.period,
      reportText: aiReportText,
      summaryData: summaryData,
      generatedAt: new Date().toISOString(),
      metadata: {
        reportVersion: '1.0'
      }
    });

    console.log('✅ AI 텍스트 리포트 생성 완료');

  } catch (err) {
    console.error('❌ /text/:infantId 오류:', err);
    res.status(500).json({ 
      message: '텍스트 리포트 조회 실패', 
      error: err.message 
    });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('DB 연결 종료 오류:', err);
      }
    }
  }
});

// ==========================================
// 4️⃣ POST /api/reports/generate/:infantId - 리포트 생성
// ==========================================
router.post('/generate/:infantId', authRequired, async (req, res) => {
  console.log('📍 POST /api/reports/generate/:infantId 호출');
  
  const { infantId } = req.params;
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({
      message: 'startDate와 endDate는 필수입니다.'
    });
  }

  res.json({
    message: '리포트 생성 요청 접수',
    infantId: parseInt(infantId),
    startDate,
    endDate
  });
});

// ==========================================
// 5️⃣ GET /api/reports/:infantId - 일반 조회 (가장 마지막)
// ==========================================
router.get('/:infantId', authRequired, async (req, res) => {
  console.log('📍 GET /api/reports/:infantId 호출');
  
  const { infantId } = req.params;

  res.json({
    message: '일반 리포트 조회',
    infantId: parseInt(infantId)
  });
});

// ==========================================
// 🆕 6️⃣ GET /api/reports/doctor/high-risk - 의사용 능동형 CRM (3단계 고도화)
// ==========================================
router.get('/doctor/high-risk', authRequired, async (req, res) => {
  console.log('📍 GET /api/reports/doctor/high-risk 호출');
  // req.user.guardianId (의사의 guardian_id)를 이용하여 연결된 의사인지 확인 후 
  // 심각도가 High인 최근 이벤트를 가진 환아 목록을 조회합니다.
  
  const doctorGuardianId = req.user.guardianId;

  let conn;
  try {
    conn = await pool.getConnection();

    // 의사 정보 조회
    const doctorRes = await conn.execute(
      `SELECT doctor_id FROM doctors WHERE guardian_id = :guardianId`,
      { guardianId: doctorGuardianId }
    );

    if (doctorRes.rows.length === 0) {
      return res.status(403).json({ message: '의사 권한이 없습니다.' });
    }

    const doctorId = doctorRes.rows[0][0];

    // 의사와 상담 이력이 있거나 예약된 환아 중 최근 1주일간 High 심각도 울음이 많은 순으로 정렬
    const sql = `
      SELECT 
        i.infant_id, 
        i.name, 
        COUNT(ce.event_id) as high_risk_count,
        MAX(ce.event_time) as last_event_time
      FROM video_call_sessions vcs
      JOIN infant i ON vcs.infant_id = i.infant_id
      JOIN cry_event ce ON i.infant_id = ce.infant_id
      WHERE vcs.doctor_id = :doctorId
        AND ce.severity = 'High'
        AND ce.event_time >= SYSDATE - 7
      GROUP BY i.infant_id, i.name
      ORDER BY high_risk_count DESC
    `;
    
    const result = await conn.execute(sql, { doctorId });
    
    const highRiskPatients = result.rows.map(r => ({
      infantId: r[0],
      name: r[1],
      highRiskCount: r[2],
      lastEventTime: r[3]
    }));

    res.json({ success: true, highRiskPatients });

  } catch (err) {
    console.error('❌ /doctor/high-risk 오류:', err);
    res.status(500).json({ message: '위험 환아 목록 조회 실패' });
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch (err) {
        console.error('DB 연결 종료 오류:', err);
      }
    }
  }
});

// ==========================================
// 헬퍼 함수

// ==========================================
function translateCause(cause) {
  const map = {
    'hungry': '배고픔',
    'burping': '트림 필요',
    'belly_pain': '배 통증',
    'cold_hot': '온도 불편',
    'discomfort': '불편함',
    'emotional': '정서적 요인',
    'tired': '피곤함',
    'needs_attention': '관심 필요'
  };
  return map[cause] || cause;
}

function translateActionType(actionType) {
  const map = {
    'feed': '수유',
    'diaper': '기저귀 교체',
    'burp': '트림 시키기',
    'comfort': '안아주기',
    'temperature': '온도 조절',
    'sleep': '재우기',
    'play': '놀아주기'
  };
  return map[actionType] || actionType;
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '0초';
  
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}시간`);
  if (mins > 0) parts.push(`${mins}분`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}초`);

  return parts.join(' ');
}

export default router;
