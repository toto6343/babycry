// src/services/notificationService.js
import oracledb from 'oracledb';
import { getConnection } from '../db/oracle.js';
import { createActionText } from './actionTextService.js';
import { sendSms, normalizeKoreanPhone } from '../config/sms.js';
import { getBestActionGroupsForCause } from '../services/actionSuggestionService.js';

/**
 * 원인 코드를 한글 짧은 설명으로 변환 (문자 본문용)
 * 모델에서 오는 cause 값은 아래 7가지라고 가정:
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
    case 'needs_attention':
      return '관심이 필요한 것으로 보입니다.';
    default:
      return '원인을 정확히 파악하지 못했습니다.';
  }
}

/**
 * 하나의 울음 이벤트에 대해:
 * - DB에서 아기/보호자 정보 조회
 * - GPT로 조치 문구 생성 (cause + severity 반영)
 * - Twilio로 SMS 발송 (전화번호 있을 때만)
 * - notification_log에 기록
 */
export async function sendNotificationForEvent({ cryEventId, infantId, cause, severity }) {
  console.log('🔔 sendNotificationForEvent called with:', {
    cryEventId,
    infantId,
    cause,
    severity,
  });

  // 1. 아이 + 보호자 정보 조회
  let info;
  try {
    info = await getInfantAndGuardian(infantId);
  } catch (err) {
    console.warn(
      `⚠ infantId=${infantId} 에 대한 아기/보호자 정보를 조회하는 중 오류가 발생하여 알림을 건너뜁니다.`,
      err.message
    );
    return;
  }

  if (!info || !info.guardianId) {
    console.warn(
      `⚠ infantId=${infantId} 에 대한 보호자 정보를 찾을 수 없어 알림을 건너뜁니다.`
    );
    // guardian_id가 없으면 notification_log에도 넣을 수 없으므로 여기서 종료
    return;
  }

  const { infantName, guardianId, guardianPhone } = info;

  // 2. GPT로 조치 문구 생성 (severity 함께 전달)
  const bestActions = await getBestActionGroupsForCause(cause, { minTrials: 2 });
  const actionText = await createActionText(cause, infantName, severity, bestActions);

  // 3. 문자 내용 만들기
  const smsBody = buildSmsBody({
    infantName,
    isCrying: true,
    cause,
    actionText,
  });

  // 4. SMS 전송
  const normalizedPhone = normalizeKoreanPhone(guardianPhone);

  // 보호자 전화번호가 없으면 SMS는 건너뛰고 로그만 남김
  if (!normalizedPhone) {
    console.warn(`⚠ 보호자(${guardianId}) 전화번호가 없어 SMS를 생략합니다.`);

    await saveNotificationLog({
      eventId: cryEventId,
      guardianId,
      channel: 'sms',
      status: 'no_phone',
      providerMsgId: null,
      latencyMs: 0,
      actionText,
    });

    return; // 여기서 종료
  }

  const start = Date.now();
  let sendResult;
  let smsStatus = 'failed';
  let providerId = null;

  try {
    sendResult = await sendSms({ to: normalizedPhone, body: smsBody });
    smsStatus = sendResult.success ? 'sent' : 'failed';
    providerId = sendResult.messageId;
  } catch (smsError) {
    console.error('❌ SMS 전송 실패:', smsError.message);
    
    // Twilio 에러 코드별 처리
    if (smsError.code === 21608) {
      console.warn('⚠️ Twilio Trial 계정: 인증되지 않은 번호입니다.');
      smsStatus = 'unverified_number';
    } else if (smsError.code === 21211) {
      console.warn('⚠️ 잘못된 전화번호 형식입니다.');
      smsStatus = 'invalid_number';
    } else {
      smsStatus = 'error';
    }
  }

  const latencyMs = Date.now() - start;

  // 5. notification_log 저장 (성공/실패 모두)
  await saveNotificationLog({
    eventId: cryEventId,
    guardianId,
    channel: 'sms',
    status: smsStatus,
    providerMsgId: providerId,
    latencyMs,
    actionText,
  });

  console.log(`📊 알림 로그 저장 완료: status=${smsStatus}`);
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

/**
 * infant + guardian 정보 조회
 */
async function getInfantAndGuardian(infantId) {
  const conn = await getConnection();
  try {
    // 디버그: 현재 DB 유저 확인 (CON_NAME 제거)
    const debug = await conn.execute(
      `SELECT user AS username FROM dual`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log('🧪 DB DEBUG:', debug.rows[0]);

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
      { infantId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    console.log('🧪 INFANT QUERY ROWS: ', result.rows.length);

    if (result.rows.length === 0) {
      throw new Error('Infant not found');
    }

    const row = result.rows[0];

    return {
      infantName: row.INFANT_NAME ?? row.infant_name,
      guardianId: row.GUARDIAN_ID ?? row.guardian_id,
      guardianPhone: row.GUARDIAN_PHONE ?? row.guardian_phone,
    };
  } finally {
    await conn.close();
  }
}

/**
 * notification_log 에 기록
 */
async function saveNotificationLog({
  eventId,
  guardianId,
  channel,
  status,
  providerMsgId,
  latencyMs,
  actionText,
}) {
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
        latency_ms,
        action_text
      ) VALUES (
        :eventId,
        :guardianId,
        :channel,
        SYSTIMESTAMP,
        :status,
        :providerMsgId,
        :latencyMs,
        :actionText
      )
      `,
      {
        eventId,
        guardianId,
        channel,
        status,
        providerMsgId,
        latencyMs,
        actionText,
      },
      { autoCommit: true }
    );
  } finally {
    await conn.close();
  }
}
