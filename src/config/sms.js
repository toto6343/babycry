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
    // Twilio Programmable Messaging API 호출
    const message = await client.messages.create({
      body,           // 문자 내용
      from: fromNumber, // Twilio에서 발급받은 번호
      to,             // 보호자 번호 (E.164 형식)
    });

    const latencyMs = Date.now() - start;

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
  const trimmed = phone.replace(/[^0-9]/g, '');
  if (trimmed.startsWith('0')) {
    return '+82' + trimmed.slice(1);
  }
  return phone;
}