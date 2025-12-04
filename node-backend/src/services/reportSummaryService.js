// src/services/reportSummaryService.js
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';

/**
  YYYY-MM-DD 문자열을 기간(start, end) Date 객체로 변환
 */
function parseDateRange(startDateStr, endDateStr) {
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endDateStr + 'T23:59:59');
  return { start, end };
}

/* 1) 총 울음 횟수 / 총 시간 / 평균 시간 */
async function fetchSummaryStats(conn, infantId, start, end) {
  const sql = `
    SELECT
      COUNT(*) AS total_events,
      NVL(SUM(duration_ms), 0) AS total_duration_ms,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms,
      NVL(MIN(duration_ms), 0) AS min_duration_ms,
      NVL(MAX(duration_ms), 0) AS max_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows[0] || {};
  const totalEvents = row.TOTAL_EVENTS || 0;
  const totalDurationSeconds = (row.TOTAL_DURATION_MS || 0) / 1000;
  const avgDurationSeconds = (row.AVG_DURATION_MS || 0) / 1000;
  const minDurationSeconds = (row.MIN_DURATION_MS || 0) / 1000;
  const maxDurationSeconds = (row.MAX_DURATION_MS || 0) / 1000;

  return { 
    totalEvents, 
    totalDurationSeconds, 
    avgDurationSeconds,
    minDurationSeconds,
    maxDurationSeconds
  };
}

/* 2) 울음 타입별 통계 */
async function fetchByCryType(conn, infantId, start, end) {
  const sql = `
    SELECT
      cry_type,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms,
      NVL(MIN(duration_ms), 0) AS min_duration_ms,
      NVL(MAX(duration_ms), 0) AS max_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
    GROUP BY cry_type
    ORDER BY cnt DESC
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const totalCount = result.rows.reduce((sum, r) => sum + (r.CNT || 0), 0);

  return result.rows.map(r => ({
    cryType: r.CRY_TYPE,
    count: r.CNT,
    percentage: totalCount > 0 ? ((r.CNT / totalCount) * 100).toFixed(1) : 0,
    avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000,
    minDurationSeconds: (r.MIN_DURATION_MS || 0) / 1000,
    maxDurationSeconds: (r.MAX_DURATION_MS || 0) / 1000
  }));
}

/* 3) 시간대별 통계 */
async function fetchByHour(conn, infantId, start, end) {
  const sql = `
    SELECT
      EXTRACT(HOUR FROM event_time) AS hour_value,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
    GROUP BY EXTRACT(HOUR FROM event_time)
    ORDER BY hour_value
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const hourMap = {};
  result.rows.forEach(r => {
    hourMap[r.HOUR_VALUE] = {
      count: r.CNT,
      avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000
    };
  });

  const allHours = [];
  for (let h = 0; h < 24; h++) {
    allHours.push({
      hour: h,
      count: hourMap[h]?.count || 0,
      avgDurationSeconds: hourMap[h]?.avgDurationSeconds || 0
    });
  }

  return allHours;
}

/* 4) 요일별 통계 */
async function fetchByDayOfWeek(conn, infantId, start, end) {
  const sql = `
    SELECT
      TO_CHAR(event_time, 'D') AS day_of_week,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
    GROUP BY TO_CHAR(event_time, 'D')
    ORDER BY day_of_week
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  
  return result.rows.map(r => ({
    dayOfWeek: parseInt(r.DAY_OF_WEEK),
    dayName: dayNames[parseInt(r.DAY_OF_WEEK) - 1] || '알 수 없음',
    count: r.CNT,
    avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000
  }));
}

/* 5) 심각도별 통계 */
async function fetchBySeverity(conn, infantId, start, end) {
  const sql = `
    SELECT
      severity,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
    GROUP BY severity
    ORDER BY 
      CASE severity
        WHEN 'High' THEN 1
        WHEN 'Medium' THEN 2
        WHEN 'Low' THEN 3
        ELSE 4
      END
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const totalCount = result.rows.reduce((sum, r) => sum + (r.CNT || 0), 0);

  return result.rows.map(r => ({
    severity: r.SEVERITY,
    count: r.CNT,
    percentage: totalCount > 0 ? ((r.CNT / totalCount) * 100).toFixed(1) : 0,
    avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000
  }));
}

/* 6) 일별 트렌드 */
async function fetchDailyTrend(conn, infantId, start, end) {
  const sql = `
    SELECT
      TRUNC(event_time) AS event_date,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms,
      NVL(SUM(duration_ms), 0) AS total_duration_ms
    FROM cry_event
    WHERE infant_id = :infantId
      AND event_time BETWEEN :startTime AND :endTime
    GROUP BY TRUNC(event_time)
    ORDER BY event_date
  `;
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows.map(r => ({
    date: r.EVENT_DATE.toISOString().split('T')[0],
    count: r.CNT,
    avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000,
    totalDurationSeconds: (r.TOTAL_DURATION_MS || 0) / 1000
  }));
}

/* 7) 가장 많이 취해진 조치 Top 5 - ✅ 테이블명 수정 */
async function fetchTopActions(conn, infantId, start, end) {
  const sql = `
    SELECT
      al.action_detail,
      COUNT(*) AS cnt,
      NVL(AVG(
        CASE al.result
          WHEN 'success' THEN 5
          WHEN 'partial' THEN 3
          WHEN 'fail' THEN 1
          ELSE 0
        END
      ), 0) AS avg_effectiveness
    FROM action_log al
    INNER JOIN cry_event ce ON al.event_id = ce.event_id
    WHERE ce.infant_id = :infantId
      AND ce.event_time BETWEEN :startTime AND :endTime
    GROUP BY al.action_detail
    ORDER BY cnt DESC
  `;
  
  const result = await conn.execute(
    sql,
    { infantId, startTime: start, endTime: end },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 5 }
  );

  return result.rows.map(r => ({
    actionType: r.ACTION_DETAIL || '기타',
    count: r.CNT,
    avgEffectiveness: parseFloat((r.AVG_EFFECTIVENESS || 0).toFixed(2))
  }));
}

/* 8) 다음 울음 예측 */
async function fetchNextCryPrediction(conn, infantId) {
  const sql = `
    SELECT predicted_next_time
    FROM (
      SELECT predicted_next_time
      FROM pattern_analysis
      WHERE infant_id = :infantId
        AND predicted_next_time IS NOT NULL
      ORDER BY created_at DESC
    )
    WHERE ROWNUM = 1
  `;
  const result = await conn.execute(
    sql,
    { infantId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const predicted = row.PREDICTED_NEXT_TIME;

  if (!predicted) return null;
  const dateObj = (predicted instanceof Date) ? predicted : new Date(predicted);
  return dateObj.toISOString();
}

/* 9) 인사이트 생성 */
function generateInsights(data) {
  const insights = [];

  if (data.byCryType && data.byCryType.length > 0) {
    const topCryType = data.byCryType[0];
    insights.push({
      type: 'dominant_cry_type',
      title: '가장 흔한 울음 유형',
      description: `${getCryTypeLabel(topCryType.cryType)}이(가) 전체의 ${topCryType.percentage}%를 차지합니다.`,
      severity: 'info',
      actionable: true,
      recommendation: getCryTypeRecommendation(topCryType.cryType)
    });
  }

  if (data.byHour && data.byHour.length > 0) {
    const peakHour = data.byHour.reduce((max, curr) => 
      curr.count > max.count ? curr : max
    );
    if (peakHour.count > 0) {
      insights.push({
        type: 'peak_hour',
        title: '울음이 가장 많은 시간대',
        description: `${peakHour.hour}시에 가장 많은 울음이 발생했습니다 (${peakHour.count}회).`,
        severity: 'info',
        actionable: true,
        recommendation: `${peakHour.hour}시 전후로 아기의 필요사항을 미리 체크하는 것을 권장합니다.`
      });
    }
  }

  if (data.bySeverity) {
    const highSeverity = data.bySeverity.find(s => s.severity === 'High');
    if (highSeverity && highSeverity.count > 0) {
      insights.push({
        type: 'high_severity_alert',
        title: '높은 심각도 울음 감지',
        description: `${highSeverity.count}회의 높은 심각도 울음이 감지되었습니다 (${highSeverity.percentage}%).`,
        severity: 'warning',
        actionable: true,
        recommendation: '지속적으로 높은 심각도의 울음이 발생한다면 소아과 전문의 상담을 권장합니다.'
      });
    }
  }

  if (data.summary.avgDurationSeconds > 120) {
    insights.push({
      type: 'long_duration',
      title: '긴 울음 지속 시간',
      description: `평균 울음 지속 시간이 ${(data.summary.avgDurationSeconds / 60).toFixed(1)}분입니다.`,
      severity: 'warning',
      actionable: true,
      recommendation: '울음의 원인을 빠르게 파악하고 대응하는 것이 중요합니다.'
    });
  }

  if (data.topActions && data.topActions.length > 0) {
    const mostEffective = data.topActions.reduce((max, curr) => 
      curr.avgEffectiveness > max.avgEffectiveness ? curr : max
    );
    if (mostEffective.avgEffectiveness > 0) {
      insights.push({
        type: 'effective_action',
        title: '가장 효과적인 조치',
        description: `"${mostEffective.actionType}"이(가) 평균 효과도 ${mostEffective.avgEffectiveness}점으로 가장 효과적입니다.`,
        severity: 'success',
        actionable: false,
        recommendation: '앞으로도 이 방법을 우선적으로 시도해보세요.'
      });
    }
  }

  return insights;
}

/* 헬퍼 함수들 */
function getCryTypeLabel(cryType) {
  const labels = {
    belly_pain: '배앓이',
    cold_hot: '온도 불편',
    burping: '트림 필요',
    discomfort: '불편함',
    hungry: '배고픔',
    tired: '졸림',
    emotional: '감정적'
  };
  return labels[cryType] || cryType;
}

function getCryTypeRecommendation(cryType) {
  const recommendations = {
    belly_pain: '배 마사지를 해주고, 가스 배출을 도와주세요. 증상이 지속되면 소아과 상담이 필요합니다.',
    cold_hot: '실내 온도를 20-22°C로 유지하고, 아기의 옷차림을 조절해주세요.',
    burping: '수유 후 충분히 트림을 시켜주고, 수유 중간에도 트림 시간을 가지세요.',
    discomfort: '기저귀 상태, 옷의 착용감, 실내 환경을 체크하세요.',
    hungry: '수유 간격과 양이 적절한지 확인하고, 필요시 수유 스케줄을 조정하세요.',
    tired: '낮잠 시간과 밤 수면 패턴을 규칙적으로 유지하고, 수면 환경을 최적화하세요.',
    emotional: '충분한 스킨십과 안정감을 제공하고, 진정 음악이나 백색소음을 활용하세요.'
  };
  return recommendations[cryType] || '아기의 상태를 주의 깊게 관찰하세요.';
}

function getActionTypeLabel(actionType) {
  return actionType; // action_detail을 그대로 사용
}

function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)}초`;
  } else if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
  }
}

export async function getSummaryReport(infantId, startDateStr, endDateStr) {
  const { start, end } = parseDateRange(startDateStr, endDateStr);
  const conn = await getConnection();

  try {
    const [
      summaryStats,
      byCryType,
      byHour,
      byDayOfWeek,
      bySeverity,
      dailyTrend,
      topActions,
      nextCryPredictionTime
    ] = await Promise.all([
      fetchSummaryStats(conn, infantId, start, end),
      fetchByCryType(conn, infantId, start, end),
      fetchByHour(conn, infantId, start, end),
      fetchByDayOfWeek(conn, infantId, start, end),
      fetchBySeverity(conn, infantId, start, end),
      fetchDailyTrend(conn, infantId, start, end),
      fetchTopActions(conn, infantId, start, end),
      fetchNextCryPrediction(conn, infantId)
    ]);

    const reportData = {
      metadata: {
        infantId: Number(infantId),
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
        generatedAt: new Date().toISOString(),
        reportVersion: '2.0'
      },

      summary: {
        totalEvents: summaryStats.totalEvents,
        totalDurationSeconds: parseFloat(summaryStats.totalDurationSeconds.toFixed(2)),
        avgDurationSeconds: parseFloat(summaryStats.avgDurationSeconds.toFixed(2)),
        minDurationSeconds: parseFloat(summaryStats.minDurationSeconds.toFixed(2)),
        maxDurationSeconds: parseFloat(summaryStats.maxDurationSeconds.toFixed(2)),
        totalDurationFormatted: formatDuration(summaryStats.totalDurationSeconds),
        avgDurationFormatted: formatDuration(summaryStats.avgDurationSeconds)
      },

      byCryType: byCryType.map(item => ({
        ...item,
        avgDurationFormatted: formatDuration(item.avgDurationSeconds),
        label: getCryTypeLabel(item.cryType)
      })),

      byHour,

      byDayOfWeek,

      bySeverity,

      dailyTrend: dailyTrend.map(item => ({
        ...item,
        avgDurationFormatted: formatDuration(item.avgDurationSeconds),
        totalDurationFormatted: formatDuration(item.totalDurationSeconds)
      })),

      topActions: topActions.map(item => ({
        ...item,
        label: getActionTypeLabel(item.actionType)
      })),

      prediction: {
        nextCryPredictionTime,
        confidence: nextCryPredictionTime ? 'medium' : 'none'
      }
    };

    const insights = generateInsights(reportData);

    return {
      ...reportData,
      insights
    };

  } finally {
    await conn.close();
  }
}
