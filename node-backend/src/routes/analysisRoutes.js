import express from 'express';
import { sendNotificationForEvent } from '../services/notificationService.js';

const router = express.Router();

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
