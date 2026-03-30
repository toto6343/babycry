import express from 'express';
import { sendNotificationForEvent } from '../services/notificationService.js';
import { withConnection } from '../db/oracle.js'; // ✅ withConnection 사용

const router = express.Router();

// ✅ 1번: 분석 결과에 대한 사용자 피드백 저장
router.post('/feedback', async (req, res) => {
  const { eventId, accurate, actualType } = req.body;
  try {
    await withConnection(async (conn) => {
      await conn.execute(
        `UPDATE cry_event 
         SET feedback_accurate = :accurate, 
             actual_cry_type = :actualType 
         WHERE event_id = :eventId`,
        { accurate: accurate ? 1 : 0, actualType, eventId },
        { autoCommit: true }
      );
    });
    res.json({ success: true, message: '피드백이 저장되었습니다. 감사합니다!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✅ 1번 고도화: 특정 아기의 피드백 통계 가져오기 (개인화 바이어스용)
router.get('/feedback/stats/:infantId', async (req, res) => {
  const { infantId } = req.params;
  try {
    const stats = await withConnection(async (conn) => {
      const result = await conn.execute(
        `SELECT actual_cry_type, COUNT(*) as count 
         FROM cry_event 
         WHERE infant_id = :infantId 
           AND feedback_accurate = 0 
           AND actual_cry_type IS NOT NULL
         GROUP BY actual_cry_type`,
        { infantId }
      );
      
      const statsObj = {};
      result.rows.forEach(row => {
        statsObj[row[0]] = row[1];
      });
      return statsObj;
    });
    
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/result', async (req, res) => {
  try {
    const { cryEventId, infantId, isCrying, cause, severity } = req.body;

    if (!cryEventId || !infantId) {
      return res.status(400).json({ message: 'cryEventId and infantId are required.' });
    }

    if (!isCrying) {
      return res.status(200).json({ message: 'Not crying. No notification sent.' });
    }

    // 알림 전송 시도 (실패해도 200 반환 - 분석 자체는 성공)
    try {
      await sendNotificationForEvent({ cryEventId, infantId, cause, severity });
      res.status(200).json({ message: 'Notification sent successfully.' });
    } catch (notifErr) {
      console.error('⚠️ Notification failed but analysis succeeded:', notifErr.message);
      res.status(200).json({ 
        message: 'Analysis completed. Notification failed (see logs).',
        notificationError: notifErr.message 
      });
    }

  } catch (err) {
    console.error('❌ Analysis route error:', err);
    res.status(500).json({ message: 'Error while processing analysis result.' });
  }
});

export default router;
