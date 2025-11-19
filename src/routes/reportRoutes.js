const express = require('express');
const router = express.Router();

const { getSummaryReport } = require('../services/reportSummaryService');
const { generateAiReport } = require('../services/aiReportService');

/*
  GET /api/reports/auto
  예: /api/reports/auto?infantId=1&startDate=2025-11-01&endDate=2025-11-07
 */
router.get('/auto', async (req, res) => {
  try {
    const { infantId, startDate, endDate } = req.query;

    if (!infantId || !startDate || !endDate) {
      return res.status(400).json({
        message: 'infantId, startDate, endDate 쿼리 파라미터가 필요합니다.'
      });
    }

    // 1) DB에서 요약 + 예측 데이터 가져오기
    const summaryData = await getSummaryReport(infantId, startDate, endDate);

    // 2) OpenAI에게 보고서 작성 요청
    const aiReport = await generateAiReport(summaryData);

    // 3) 결과 반환
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

module.exports = router;
