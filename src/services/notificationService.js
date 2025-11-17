import { getConnection } from '../config/db.js';
import { createActionText } from './actionTextService.js';
import { sendSms, normalizeKoreanPhone } from '../config/sms.js';

/**
 * 원인 코드를 한글 짧은 설명으로 변환 (문자 본문용)
 * 모델에서 오는 reason/cause 값은 아래 7가지라고 가정:
 * hungry, burping, belly_pain, cold_hot, discomfort, emotional, tired
 */
function mapCauseToKoreanForTitle(cause) {
  switch (cause) {
    case 'hungry':
      return '배고픈 것으로 보입니다.';
    case 'burping':
      return '트림이 필요해 보입니다.';
    case 'belly_pain':
      return '배 통증이 있는 것으로 보입니다.';
    case 'cold_hot':
      return '주변 온도(차갑거나 뜨거움)로 인한 것으로 보입니다.';
    case 'discomfort':
      return '자세나 기저귀 등으로 불편한 것으로 보입니다.';
    case 'emotional':
      return '정서적 이유(불안, 외로움 등)로 보입니다.';
    case 'tired':
      return '피곤하거나 졸린 것으로 보입니다.';
    default:
      return '원인을 정확히 파악하지 못했습니다.';
  }
}

/**
 * 하나의 울음 이벤트에 대해:
 * - DB에서 아기/보호자 정보 조회
 * - GPT로 조치 문구 생성 (cause + severity 반영)
 * - Twilio로 SMS 발송
 * - notification_log에 기록
 */
export async function sendNotificationForEvent({ cryEventId, infantId, cause, severity }) {
  // 1. 아이 + 보호자 정보 조회
  const { infantName, guardianId, guardianPhone } = await getInfantAndGuardian(infantId);

  // 2. GPT로 조치 문구 생성 (🔹 severity 함께 전달)
  const actionText = await createActionText(cause, infantName, severity);

  // 3. 문자 내용 만들기
  const smsBody = buildSmsBody({
    infantName,
    isCrying: true,
    cause,
    actionText,
  });

  // 4. SMS 전송
  const start = Date.now();
  const normalizedPhone = normalizeKoreanPhone(guardianPhone);
  const sendResult = await sendSms({ to: normalizedPhone, body: smsBody });
  const latencyMs = sendResult.latencyMs ?? (Date.now() - start);

  // 5. notification_log 저장
  await saveNotificationLog({
    eventId: cryEventId,
    guardianId,
    channel: 'sms',
    status: sendResult.success ? 'sent' : 'failed',
    providerMsgId: sendResult.messageId,
    latencyMs,
  });

}

function buildSmsBody({ infantName, isCrying, cause, actionText }) {
  const cryingText = isCrying ? '지금 울고 있어요.' : '지금 울지 않고 있습니다.';
  const causeText = mapCauseToKoreanForTitle(cause);

  return `
[알림] 아이(${infantName})가 ${cryingText}
울음 원인 추정: ${causeText}
추천 조치: ${actionText}
`.trim();
}

async function getInfantAndGuardian(infantId) {
  const conn = await getConnection();
  try {
    const result = await conn.execute(
      `
      SELECT i.infant_id,
             i.name AS infant_name,
             g.guardian_id,
             g.phone AS guardian_phone
        FROM infant i
        JOIN guardian g ON i.guardian_id = g.guardian_id
       WHERE i.infant_id = :infantId
      `,
      { infantId }
    );

    if (result.rows.length === 0) {
      throw new Error('Infant not found');
    }

    const row = result.rows[0];
    return {
      infantName: row.INFANT_NAME,
      guardianId: row.GUARDIAN_ID,
      guardianPhone: row.GUARDIAN_PHONE,
    };
  } finally {
    await conn.close();
  }
}

async function saveNotificationLog({ eventId, guardianId, channel, status, providerMsgId, latencyMs }) {
  const conn = await getConnection();
  try {
    await conn.execute(
      `
      INSERT INTO notification_log (
        event_id,
        guardian_id,
        channel,
        sent_at,
        status,
        provider_msg_id,
        latency_ms
      ) VALUES (
        :eventId,
        :guardianId,
        :channel,
        SYSTIMESTAMP,
        :status,
        :providerMsgId,
        :latencyMs
      )
      `,
      {
        eventId,
        guardianId,
        channel,
        status,
        providerMsgId,
        latencyMs,
      },
      { autoCommit: true }
    );
  } finally {
    await conn.close();
  }
}
