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

    await sendNotificationForEvent({ cryEventId, infantId, cause, severity });

    res.status(200).json({ message: 'Notification sent (or attempted).' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error while sending notification.' });
  }
});

export default router;
