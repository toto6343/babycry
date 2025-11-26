// src/services/reportSummaryService.js
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';

/**
  YYYY-MM-DD 문자열을 기간(start, end) Date 객체로 변환
  start: 00:00:00
  end:   23:59:59
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
      NVL(AVG(duration_ms), 0) AS avg_duration_ms
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

  return { totalEvents, totalDurationSeconds, avgDurationSeconds };
}

/* 2) 울음 타입별 통계 */
async function fetchByCryType(conn, infantId, start, end) {
  const sql = `
    SELECT
      cry_type,
      COUNT(*) AS cnt,
      NVL(AVG(duration_ms), 0) AS avg_duration_ms
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
  return result.rows.map(r => ({
    cryType: r.CRY_TYPE,
    count: r.CNT,
    avgDurationSeconds: (r.AVG_DURATION_MS || 0) / 1000
  }));
}

/* 3) 시간대별(시 단위) 통계 */
async function fetchByHour(conn, infantId, start, end) {
  const sql = `
    SELECT
      EXTRACT(HOUR FROM event_time) AS hour_value,
      COUNT(*) AS cnt
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
  return result.rows.map(r => ({
    hour: r.HOUR_VALUE,
    count: r.CNT
  }));
}

/* 4) pattern_analysis 기반 "다음 울음 예측 시각" 가져오기 */
async function fetchNextCryPrediction(conn, infantId) {
  const sql = `
    SELECT predicted_next_time
    FROM pattern_analysis
    WHERE infant_id = :infantId
      AND predicted_next_time IS NOT NULL
    ORDER BY created_at DESC
    FETCH FIRST 1 ROWS ONLY
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

/*
  외부에서 사용하는 메인 함수:
  - DB에서 요약 + 타입별 + 시간대별 + 다음 울음 예측까지 모두 묶어서 리턴
 */
export async function getSummaryReport(infantId, startDateStr, endDateStr) {
  const { start, end } = parseDateRange(startDateStr, endDateStr);
  const conn = await getConnection();

  try {
    const summaryStats = await fetchSummaryStats(conn, infantId, start, end);
    const byCryType = await fetchByCryType(conn, infantId, start, end);
    const byHour = await fetchByHour(conn, infantId, start, end);
    const nextCryPredictionTime = await fetchNextCryPrediction(conn, infantId);

    return {
      infantId: Number(infantId),
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      totalEvents: summaryStats.totalEvents,
      totalDurationSeconds: summaryStats.totalDurationSeconds,
      avgDurationSeconds: summaryStats.avgDurationSeconds,
      byCryType,
      byHour,
      nextCryPredictionTime
    };
  } finally {
    await conn.close();
  }
}
