import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();

// 1) 환경변수에서 Twilio 계정 정보 읽기
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

// 2) Twilio 클라이언트 생성
const client = twilio(accountSid, authToken);

/**
 * SMS 전송 함수
 * @param {Object} params
 * @param {string} params.to
 * @param {string} params.body
 * @returns {Promise<{success:boolean, messageId?:string, latencyMs?:number, error?:any}>}
 */
export async function sendSms({ to, body }) {
  const start = Date.now();

  try {
    console.log('📨 [Twilio] sendSms called:', { from: fromNumber, to, body });
    // Twilio Programmable Messaging API 호출
    const message = await client.messages.create({
      body,           // 문자 내용
      from: fromNumber, // Twilio에서 발급받은 번호
      to,             // 보호자 번호 (E.164 형식)
    });

    const latencyMs = Date.now() - start;
    console.log('📨 [Twilio] message created:', {
      sid: message.sid,
      status: message.status,
      latencyMs,
    });

    return {
      success: true,
      messageId: message.sid,
      latencyMs,
    };
  } catch (err) {
    console.error('[Twilio SMS Error]', err);
    const latencyMs = Date.now() - start;

    return {
      success: false,
      error: err,
      latencyMs,
    };
  }
}

export function normalizeKoreanPhone(phone) {
  // 1) 값이 아예 없으면 null로 돌려보냄
  if (!phone) {
    return null;
  }

  // 혹시 숫자가 아닌 문자(공백, -, 괄호 등) 제거
  const trimmed = String(phone).replace(/[^0-9]/g, '');

  // 숫자가 하나도 안 남으면 마찬가지로 null
  if (!trimmed) {
    return null;
  }

  // 01012345678 → +821012345678 로 변환
  if (trimmed.startsWith('0')) {
    return '+82' + trimmed.slice(1);
  }

  // 이미 82로 시작하는 경우 (예: 821012345678) → 앞에 +만 붙이기
  if (trimmed.startsWith('82')) {
    return '+' + trimmed;
  }

  // 이미 +82... 형태라면 그대로 사용
  if (String(phone).startsWith('+')) {
    return String(phone);
  }

  // 그 외는 숫자만 남긴 형태로 리턴
  return trimmed;
}
