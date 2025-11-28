import express from 'express';
import oracledb from 'oracledb';
import { getSummaryReport } from '../services/reportSummaryService.js';
import { generateAiReport } from '../services/aiReportService.js';
import { authRequired } from '../middleware/authMiddleware.js';
import { getConnection } from '../db/oracle.js';

const router = express.Router();

// ✅ CLOB 데이터를 문자열로 변환하는 헬퍼 함수
async function clobToString(clob) {
  if (!clob) return null;
  if (typeof clob === 'string') return clob;
  
  return new Promise((resolve, reject) => {
    let text = '';
    clob.setEncoding('utf8');
    clob.on('data', (chunk) => {
      text += chunk;
    });
    clob.on('end', () => {
      resolve(text);
    });
    clob.on('error', (err) => {
      reject(err);
    });
  });
}

// ✅ 보고서 목록 조회 (REPORT 테이블 사용)
router.get('/:infantId', authRequired, async (req, res) => {
  let conn;
  try {
    const { infantId } = req.params;
    
    conn = await getConnection();
    
    const result = await conn.execute(
      `
      SELECT 
        report_id,
        infant_id,
        period_start,
        period_end,
        report_type,
        summary,
        file_url,
        created_at
      FROM report
      WHERE infant_id = :infantId
      ORDER BY created_at DESC
      `,
      { infantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    // ✅ CLOB 데이터 처리
    const reports = await Promise.all(
      result.rows.map(async (row) => {
        const summaryText = await clobToString(row.SUMMARY);
        
        return {
          reportId: row.REPORT_ID,
          infantId: row.INFANT_ID,
          periodStart: row.PERIOD_START?.toISOString() || null,
          periodEnd: row.PERIOD_END?.toISOString() || null,
          reportType: row.REPORT_TYPE,
          summary: summaryText,
          content: summaryText, // summary를 content로도 사용
          fileUrl: row.FILE_URL,
          createdAt: row.CREATED_AT?.toISOString() || new Date().toISOString(),
          metadata: {
            periodStart: row.PERIOD_START?.toISOString() || null,
            periodEnd: row.PERIOD_END?.toISOString() || null,
            reportType: row.REPORT_TYPE || 'weekly'
          }
        };
      })
    );

    res.json(reports);
  } catch (err) {
    console.error('보고서 목록 조회 에러:', err);
    res.status(500).json({ 
      message: '보고서 목록 조회 중 오류가 발생했습니다.',
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

// ✅ 보고서 생성 (REPORT 테이블 사용)
router.post('/generate/:infantId', authRequired, async (req, res) => {
  let conn;
  try {
    const { infantId } = req.params;
    
    // 기본값: 최근 7일
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // 1) DB에서 요약 + 예측 데이터 가져오기
    const summaryData = await getSummaryReport(
      infantId, 
      startDate.toISOString().split('T')[0], 
      endDate.toISOString().split('T')[0]
    );

    // 2) OpenAI에게 보고서 작성 요청
    const aiReport = await generateAiReport(summaryData);

    // 3) DB에 저장
    conn = await getConnection();
    
    const result = await conn.execute(
      `
      INSERT INTO report (
        infant_id,
        period_start,
        period_end,
        report_type,
        summary
      ) VALUES (
        :infantId,
        :periodStart,
        :periodEnd,
        :reportType,
        :summary
      )
      RETURNING report_id INTO :reportId
      `,
      {
        infantId,
        periodStart: startDate,
        periodEnd: endDate,
        reportType: 'weekly',
        summary: aiReport,
        reportId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
      },
      { autoCommit: true }
    );

    const reportId = result.outBinds.reportId[0];

    res.json({
      success: true,
      reportId,
      message: '보고서가 성공적으로 생성되었습니다.'
    });

  } catch (err) {
    console.error('보고서 생성 에러:', err);
    res.status(500).json({
      message: '보고서 생성 중 오류가 발생했습니다.',
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

// 📌 기존 auto 엔드포인트 (유지)
router.get('/auto', async (req, res) => {
  try {
    const { infantId, startDate, endDate } = req.query;

    if (!infantId || !startDate || !endDate) {
      return res.status(400).json({
        message: 'infantId, startDate, endDate 쿼리 파라미터가 필요합니다.'
      });
    }

    const summaryData = await getSummaryReport(infantId, startDate, endDate);
    const aiReport = await generateAiReport(summaryData);

    res.json({
      summaryData,
      aiReport
    });

  } catch (err) {
    console.error('Error in /api/reports/auto:', err);
    res.status(500).json({
      message: '자동 보고서 생성 중 오류가 발생했습니다.',
      error: err.message
    });
  }
});

export default router;