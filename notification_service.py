import os
from twilio.rest import Client
from datetime import datetime
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

class NotificationService:
    def __init__(self):
        # Twilio 초기화 (SMS 전용)
        self.twilio_client = Client(
            os.getenv('TWILIO_ACCOUNT_SID'),
            os.getenv('TWILIO_AUTH_TOKEN')
        )
        self.twilio_phone = os.getenv('TWILIO_PHONE_NUMBER')
        
        # 이메일 설정 (선택 사항)
        self.smtp_host = os.getenv('SMTP_HOST', 'smtp.gmail.com')
        self.smtp_port = int(os.getenv('SMTP_PORT', 587))
        self.smtp_user = os.getenv('SMTP_USER')
        self.smtp_password = os.getenv('SMTP_PASSWORD')
        
        # 울음 타입 매핑 (7가지 → 3가지 카테고리)
        self.cry_category_map = {
            'belly_pain': 'pain_discomfort',
            'cold_hot': 'needs_attention',
            'burping': 'needs_attention',
            'discomfort': 'needs_attention',
            'hungry': 'needs_attention',
            'tired': 'needs_attention',
            'emotional': 'emotional'
        }
    
    def get_cry_category(self, cry_type: str) -> str:
        """울음 타입을 카테고리로 변환"""
        return self.cry_category_map.get(cry_type, 'needs_attention')
    
    def send_sms(self, to_phone: str, cry_type: str, severity: str, infant_name: str = "아기"):
        """SMS 알림 발송 (Oracle DB 스키마 기반)"""
        
        # 울음 타입별 메시지 템플릿
        message_template = {
            "hungry": f"🍼 {infant_name}가 배고파 울고 있어요!\n\n대처법:\n- 수유 시간 확인\n- 젖병/모유 준비\n- 트림 필요 여부 체크",
            "belly_pain": f"😭 {infant_name}가 배앓이 중이에요!\n\n긴급 조치:\n- 배 마사지 (시계방향)\n- 따뜻한 찜질\n- 증상 지속시 병원 방문",
            "tired": f"😴 {infant_name}가 피곤해 보여요.\n\n대처법:\n- 조명 어둡게\n- 백색소음 재생\n- 포대기로 감싸기",
            "discomfort": f"🌡️ {infant_name}가 불편해하고 있어요.\n\n확인사항:\n- 기저귀 상태\n- 옷 온도\n- 주변 환경",
            "cold_hot": f"🌡️ {infant_name}가 온도 불편을 느껴요.\n\n대처법:\n- 실내 온도 확인 (22-24도)\n- 옷 두께 조절\n- 에어컨/히터 점검",
            "burping": f"💨 {infant_name}가 트림이 필요해요!\n\n대처법:\n- 어깨에 기대어 등 두드리기\n- 앉힌 자세로 턱 받치기",
            "emotional": f"🤗 {infant_name}가 안아달라고 해요.\n\n대처법:\n- 부드럽게 안아주기\n- 조용한 노래 불러주기\n- 눈 맞춤과 대화"
        }
        
        body = message_template.get(cry_type, f"{infant_name}가 울고 있어요.")
        
        # severity 기반 메시지 강조 (high/medium/low)
        if severity == "high":
            body = f"🚨 긴급!\n{body}\n\n지금 바로 확인하세요!"
        elif severity == "medium":
            body = f"⚠️ 주의\n{body}"
        
        try:
            message = self.twilio_client.messages.create(
                body=body,
                from_=self.twilio_phone,
                to=to_phone
            )
            logger.info(f"SMS 발송 성공: {message.sid} to {to_phone}")
            return {
                "success": True, 
                "sid": message.sid, 
                "phone": to_phone,
                "provider_msg_id": message.sid  # notification_log.provider_msg_id
            }
        except Exception as e:
            logger.error(f"SMS 발송 실패: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def send_email(self, to_email: str, subject: str, html_body: str):
        """이메일 알림 발송"""
        if not self.smtp_user or not self.smtp_password:
            logger.warning("SMTP 설정이 없어 이메일을 발송하지 않습니다.")
            return {"success": False, "error": "SMTP not configured"}
        
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = self.smtp_user
        msg['To'] = to_email
        
        html_part = MIMEText(html_body, 'html')
        msg.attach(html_part)
        
        try:
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)
            
            logger.info(f"이메일 발송 성공: {to_email}")
            return {"success": True, "email": to_email}
        except Exception as e:
            logger.error(f"이메일 발송 실패: {str(e)}")
            return {"success": False, "error": str(e)}
    
    def send_cry_alert(self, guardian_data: dict, infant_name: str, cry_type: str, 
                       severity: str, notification_pref: str = 'sms'):
        """
        울음 감지 시 알림 발송 (Oracle DB 스키마 기반)
        
        Args:
            guardian_data: {'phone': str, 'email': str}
            infant_name: 아기 이름
            cry_type: 울음 타입 (belly_pain, hungry, tired 등)
            severity: 긴급도 (high/medium/low)
            notification_pref: 알림 방식 (sms/push/both) - guardian 테이블 참조
        """
        results = {}
        start_time = datetime.now()
        
        # SMS 발송 (notification_pref가 'sms' 또는 'both')
        if notification_pref in ['sms', 'both'] and guardian_data.get('phone'):
            sms_result = self.send_sms(
                to_phone=guardian_data['phone'],
                cry_type=cry_type,
                severity=severity,
                infant_name=infant_name
            )
            results['sms'] = sms_result
        
        # 이메일 발송 (notification_pref가 'both'이고 이메일 있을 경우)
        if notification_pref == 'both' and guardian_data.get('email'):
            subject = f"🚨 {infant_name} 울음 알림"
            html_body = f"""
            <html>
            <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2 style="color: #FF6B6B;">🍼 {infant_name}가 울고 있어요</h2>
                <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p><strong>울음 타입:</strong> {cry_type}</p>
                    <p><strong>긴급도:</strong> {severity}</p>
                    <p><strong>감지 시간:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
                </div>
                <p>자세한 내용은 베베멘토 앱에서 확인하세요.</p>
            </body>
            </html>
            """
            email_result = self.send_email(guardian_data['email'], subject, html_body)
            results['email'] = email_result
        
        # 지연 시간 계산 (notification_log.latency_ms)
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        results['latency_ms'] = latency_ms
        
        return results
    
    def send_weekly_report(self, guardian_email: str, infant_name: str, stats: dict):
        """주간 리포트 이메일 발송 (report 테이블 연동)"""
        subject = f"📊 {infant_name}의 주간 울음 패턴 리포트"
        
        html_body = f"""
        <html>
        <head>
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; background-color: #f5f5f5; padding: 20px; }}
                .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                h2 {{ color: #FF6B6B; border-bottom: 3px solid #FF6B6B; padding-bottom: 10px; }}
                h3 {{ color: #4ECDC4; margin-top: 25px; }}
                .stat-box {{ background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 10px 0; }}
                .highlight {{ color: #FF6B6B; font-weight: bold; font-size: 1.2em; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #888; font-size: 0.9em; }}
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🍼 {infant_name}의 이번 주 리포트</h2>
                <p><strong>📅 분석 기간:</strong> {stats.get('period_start', 'N/A')} ~ {stats.get('period_end', 'N/A')}</p>
                
                <h3>📊 울음 통계 (cry_event 테이블 기반)</h3>
                <div class="stat-box">
                    <p>🔢 <strong>총 울음 횟수:</strong> <span class="highlight">{stats.get('total_events', 0)}회</span></p>
                    <p>🏆 <strong>가장 많은 타입:</strong> {stats.get('most_common_cry_type', 'N/A')}</p>
                    <p>⏱️ <strong>평균 지속 시간:</strong> {stats.get('avg_duration_ms', 0) // 1000}초</p>
                    <p>🌙 <strong>야간 울음:</strong> {stats.get('night_events', 0)}회</p>
                    <p>✅ <strong>해결율:</strong> {stats.get('resolution_rate', 0)}%</p>
                </div>
                
                <h3>📈 패턴 분석 (pattern_analysis 테이블 기반)</h3>
                <div class="stat-box">
                    <p>🕐 <strong>가장 많은 시간대:</strong> {stats.get('peak_time_slot', 'N/A')}</p>
                    <p>📊 <strong>빈도:</strong> {stats.get('peak_frequency', 0)}회</p>
                    <p>🔮 <strong>예측 다음 울음:</strong> {stats.get('predicted_next_time', 'N/A')}</p>
                </div>
                
                <h3>💡 이번 주 인사이트</h3>
                <div class="stat-box">
                    <p>{stats.get('summary', '데이터를 수집하고 있습니다.')}</p>
                </div>
                
                <h3>🎯 추천 액션 (action_log 기반)</h3>
                <ul>
                    <li>{stats.get('recommendation_1', '수유 시간을 일정하게 유지해보세요.')}</li>
                    <li>{stats.get('recommendation_2', '낮잠 패턴을 체크해보세요.')}</li>
                    <li>{stats.get('recommendation_3', '실내 온도를 22-24도로 유지해보세요.')}</li>
                </ul>
                
                <div class="footer">
                    <p>🚀 베베멘토 앱에서 실시간 분석과 AI 챗봇을 만나보세요!</p>
                    <p>문의: support@bebemento.com</p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(guardian_email, subject, html_body)
    
    def send_daily_summary(self, guardian_data: dict, infant_name: str, daily_stats: dict):
        """일일 요약 발송 (report 테이블 daily 타입)"""
        results = {}
        
        # SMS 요약
        if guardian_data.get('phone'):
            summary_text = f"""📊 {infant_name}의 오늘 요약

🔢 울음: {daily_stats.get('total_events', 0)}회
🏆 주요 타입: {daily_stats.get('most_common_cry_type', 'N/A')}
⏱️ 총 시간: {daily_stats.get('total_duration_ms', 0) // 60000}분

내일도 화이팅! 🍼"""
            
            try:
                message = self.twilio_client.messages.create(
                    body=summary_text,
                    from_=self.twilio_phone,
                    to=guardian_data['phone']
                )
                results['sms'] = {"success": True, "sid": message.sid}
            except Exception as e:
                results['sms'] = {"success": False, "error": str(e)}
        
        return results
    
    def get_notification_status(self, provider_msg_id: str):
        """Twilio 메시지 전송 상태 조회 (notification_log.status 업데이트용)"""
        try:
            message = self.twilio_client.messages(provider_msg_id).fetch()
            # Twilio 상태: queued, sent, delivered, failed
            # Oracle status: sent, failed, queued
            status_map = {
                'queued': 'queued',
                'sent': 'sent',
                'delivered': 'sent',
                'failed': 'failed',
                'undelivered': 'failed'
            }
            return {
                "status": status_map.get(message.status, 'queued'),
                "error_code": message.error_code,
                "error_message": message.error_message
            }
        except Exception as e:
            logger.error(f"메시지 상태 조회 실패: {str(e)}")
            return {"status": "failed", "error": str(e)}