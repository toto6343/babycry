-- ========================================
-- BabyCry Oracle XE 통합 스키마 v2.1 (개선판)
-- 개선 사항: 불리언 타입 통일(NUMBER 1), Soft Delete(deleted_at), 
--         감사 컬럼(updated_at), 인덱스 최적화, 테이블/컬럼 주석 추가
-- babycry 유저로 접속한 상태에서 실행
-- ========================================

-- ========================================
-- STEP 0: 기존 스키마 완전 삭제
-- ========================================

-- (기존 삭제 구문 유지)
DROP TABLE CALL_FEEDBACK CASCADE CONSTRAINTS PURGE;
DROP TABLE DOCTOR_SCHEDULES CASCADE CONSTRAINTS PURGE;
DROP TABLE VIDEO_CALL_SESSIONS CASCADE CONSTRAINTS PURGE;
DROP TABLE DOCTORS CASCADE CONSTRAINTS PURGE;
DROP TABLE user_badges CASCADE CONSTRAINTS PURGE;
DROP TABLE badges_master CASCADE CONSTRAINTS PURGE;
DROP TABLE vision_analysis CASCADE CONSTRAINTS PURGE;
DROP TABLE family_sharing CASCADE CONSTRAINTS PURGE;
DROP TABLE vaccination_record CASCADE CONSTRAINTS PURGE;
DROP TABLE infant_growth CASCADE CONSTRAINTS PURGE;
DROP TABLE action_embedding CASCADE CONSTRAINTS PURGE;
DROP TABLE pattern_analysis CASCADE CONSTRAINTS PURGE;
DROP TABLE report CASCADE CONSTRAINTS PURGE;
DROP TABLE notification_log CASCADE CONSTRAINTS PURGE;
DROP TABLE action_log CASCADE CONSTRAINTS PURGE;
DROP TABLE cry_event CASCADE CONSTRAINTS PURGE;
DROP TABLE model_inference CASCADE CONSTRAINTS PURGE;
DROP TABLE audio_file CASCADE CONSTRAINTS PURGE;
DROP TABLE infant CASCADE CONSTRAINTS PURGE;
DROP TABLE guardian CASCADE CONSTRAINTS PURGE;

-- 시퀀스 삭제 (기존 유지 + 신규 추가분)
DROP SEQUENCE seq_guardian;
DROP SEQUENCE seq_infant;
DROP SEQUENCE seq_audio_file;
DROP SEQUENCE seq_model_inference;
DROP SEQUENCE seq_cry_event;
DROP SEQUENCE seq_action_log;
DROP SEQUENCE seq_notification_log;
DROP SEQUENCE seq_report;
DROP SEQUENCE seq_pattern_analysis;
DROP SEQUENCE seq_video_call_session;
DROP SEQUENCE seq_call_feedback;
DROP SEQUENCE seq_doctor_schedule;
DROP SEQUENCE seq_doctor;
DROP SEQUENCE seq_infant_growth;
DROP SEQUENCE seq_vaccination;
DROP SEQUENCE seq_family_sharing;
DROP SEQUENCE seq_vision_analysis;
DROP SEQUENCE seq_user_badges;

PROMPT ✅ 기존 스키마 삭제 완료!

-- ========================================
-- STEP 1: SEQUENCES 생성
-- ========================================

CREATE SEQUENCE seq_guardian START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_infant START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_audio_file START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_model_inference START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_cry_event START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_action_log START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_notification_log START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_report START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_pattern_analysis START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_doctor START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_video_call_session START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_call_feedback START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_doctor_schedule START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_infant_growth START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vaccination START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_family_sharing START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_vision_analysis START WITH 1 INCREMENT BY 1 NOCACHE;
CREATE SEQUENCE seq_user_badges START WITH 1 INCREMENT BY 1 NOCACHE;

PROMPT ✅ 시퀀스 생성 완료 (18개)

-- ========================================
-- STEP 2: TABLES 생성
-- ========================================

-- 1) 보호자 (사용자)
CREATE TABLE guardian (
  guardian_id        NUMBER(19) PRIMARY KEY,
  name               VARCHAR2(100) NOT NULL,
  phone              VARCHAR2(32),
  email              VARCHAR2(254) NOT NULL,
  password_hash      VARCHAR2(255) NOT NULL,
  password_salt      VARCHAR2(255),
  role               VARCHAR2(20) DEFAULT 'patient' 
                     CHECK (role IN ('patient', 'doctor', 'admin')),
  email_verified     NUMBER(1) DEFAULT 0 CHECK (email_verified IN (0,1)),
  status             VARCHAR2(16) DEFAULT 'active'
                     CHECK (status IN ('active','blocked','deleted')),
  notification_pref  VARCHAR2(16) DEFAULT 'sms' 
                     CHECK (notification_pref IN ('sms','push','both')),
  last_login_at      TIMESTAMP(6),
  created_at         TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at         TIMESTAMP(6),
  deleted_at         TIMESTAMP(6), -- Soft Delete
  CONSTRAINT uk_guardian_email UNIQUE (email)
);

COMMENT ON TABLE guardian IS '서비스 이용자 및 보호자 정보';
COMMENT ON COLUMN guardian.role IS '사용자 역할 (patient: 환자/보호자, doctor: 의사, admin: 관리자)';
COMMENT ON COLUMN guardian.deleted_at IS '계정 삭제 일시 (Soft Delete 용)';

-- 2) 아이
CREATE TABLE infant (
  infant_id    NUMBER(19) PRIMARY KEY,
  guardian_id  NUMBER(19) NOT NULL,
  name         VARCHAR2(100) NOT NULL,
  birth_date   DATE,
  gender       CHAR(1) CHECK (gender IN ('M','F')),
  created_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at   TIMESTAMP(6),
  deleted_at   TIMESTAMP(6), -- Soft Delete
  CONSTRAINT fk_infant_guardian FOREIGN KEY (guardian_id) 
    REFERENCES guardian(guardian_id) ON DELETE CASCADE
);

COMMENT ON TABLE infant IS '등록된 아이 정보';

-- 3) 음성 파일
CREATE TABLE audio_file (
  audio_id     NUMBER(19) PRIMARY KEY,
  infant_id    NUMBER(19) NOT NULL,
  upload_time  TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  storage_uri  VARCHAR2(512) NOT NULL,
  duration_ms  NUMBER(10),
  sample_rate  NUMBER(10),
  file_hash    VARCHAR2(128),
  updated_at   TIMESTAMP(6),
  deleted_at   TIMESTAMP(6),
  CONSTRAINT fk_audio_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 4) 모델 추론 로그
CREATE TABLE model_inference (
  inference_id  NUMBER(19) PRIMARY KEY,
  audio_id      NUMBER(19) NOT NULL,
  model_type    VARCHAR2(16) NOT NULL CHECK (model_type IN ('classifier','cause')),
  model_version VARCHAR2(64) NOT NULL,
  pred_label    VARCHAR2(64),
  pred_scores   CLOB,
  latency_ms    NUMBER(10),
  created_at    TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at    TIMESTAMP(6),
  CONSTRAINT fk_infer_audio FOREIGN KEY (audio_id) 
    REFERENCES audio_file(audio_id) ON DELETE CASCADE
);

-- 5) 울음 이벤트 (불리언 타입 통일: NUMBER 1)
CREATE TABLE cry_event (
  event_id    NUMBER(19) PRIMARY KEY,
  infant_id   NUMBER(19) NOT NULL,
  event_time  TIMESTAMP(6) NOT NULL,
  duration_ms NUMBER(10),
  confidence  NUMBER(5,2),
  severity    VARCHAR2(16) CHECK (severity IN ('Low','Medium','High')),
  cry_type    VARCHAR2(32) CHECK (cry_type IN (
    'belly_pain', 'cold_hot', 'burping', 'discomfort', 'hungry', 'tired', 'emotional', 'needs_attention'
  )),
  detected_by        VARCHAR2(32) DEFAULT 'model',
  is_resolved        NUMBER(1) DEFAULT 0 CHECK (is_resolved IN (0,1)),
  needs_consultation NUMBER(1) DEFAULT 0 CHECK (needs_consultation IN (0,1)),
  feedback_accurate  NUMBER(1) CHECK (feedback_accurate IN (0,1)),
  actual_cry_type    VARCHAR2(32),
  created_at         TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at         TIMESTAMP(6),
  CONSTRAINT fk_event_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

COMMENT ON COLUMN cry_event.is_resolved IS '해결 여부 (0: 미해결, 1: 해결)';
COMMENT ON COLUMN cry_event.feedback_accurate IS 'AI 분석 정확도 피드백 (0: 부정확, 1: 정확)';

-- 6) 성장 기록 테이블
CREATE TABLE infant_growth (
  growth_id        NUMBER(19) PRIMARY KEY,
  infant_id        NUMBER(19) NOT NULL,
  measured_date    DATE NOT NULL,
  height           NUMBER(5,2),
  weight           NUMBER(5,2),
  head_circum      NUMBER(5,2),
  created_at       TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP(6),
  CONSTRAINT fk_growth_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 7) 예방접종 테이블 (불리언 타입 통일)
CREATE TABLE vaccination_record (
  vaccine_id       NUMBER(19) PRIMARY KEY,
  infant_id        NUMBER(19) NOT NULL,
  vaccine_name     VARCHAR2(100) NOT NULL,
  dose_number      NUMBER(2),
  scheduled_date   DATE,
  completed_date   DATE,
  is_completed     NUMBER(1) DEFAULT 0 CHECK (is_completed IN (0,1)),
  notes            VARCHAR2(500),
  created_at       TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP(6),
  CONSTRAINT fk_vaccine_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 8) 가족 공유 테이블
CREATE TABLE family_sharing (
  sharing_id       NUMBER(19) PRIMARY KEY,
  infant_id        NUMBER(19) NOT NULL,
  guardian_id      NUMBER(19) NOT NULL,
  relationship     VARCHAR2(32),
  access_level     VARCHAR2(16) DEFAULT 'VIEWER' CHECK (access_level IN ('ADMIN','EDITOR','VIEWER')),
  created_at       TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP(6),
  CONSTRAINT fk_share_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id) ON DELETE CASCADE,
  CONSTRAINT fk_share_guardian FOREIGN KEY (guardian_id) REFERENCES guardian(guardian_id) ON DELETE CASCADE
);

-- 9) 멀티모달 비전 분석 테이블
CREATE TABLE vision_analysis (
  vision_id        NUMBER(19) PRIMARY KEY,
  infant_id        NUMBER(19) NOT NULL,
  image_url        VARCHAR2(512) NOT NULL,
  analysis_type    VARCHAR2(32) CHECK (analysis_type IN ('diaper', 'skin', 'other')),
  ai_opinion       VARCHAR2(4000),
  severity         VARCHAR2(16) CHECK (severity IN ('Low','Medium','High')),
  created_at       TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP(6),
  CONSTRAINT fk_vision_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 10) 뱃지 마스터 테이블
CREATE TABLE badges_master (
  badge_id         VARCHAR2(64) PRIMARY KEY,
  badge_name       VARCHAR2(100) NOT NULL,
  description      VARCHAR2(500),
  icon_url         VARCHAR2(255)
);

-- 11) 사용자 획득 뱃지 테이블
CREATE TABLE user_badges (
  user_badge_id    NUMBER(19) PRIMARY KEY,
  guardian_id      NUMBER(19) NOT NULL,
  badge_id         VARCHAR2(64) NOT NULL,
  earned_at        TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_ub_guardian FOREIGN KEY (guardian_id) REFERENCES guardian(guardian_id) ON DELETE CASCADE,
  CONSTRAINT fk_ub_badge FOREIGN KEY (badge_id) REFERENCES badges_master(badge_id) ON DELETE CASCADE
);

-- 12) 보호자 조치 로그
CREATE TABLE action_log (
  action_id     NUMBER(19) PRIMARY KEY,
  event_id      NUMBER(19) NOT NULL,
  action_detail VARCHAR2(4000),
  result        VARCHAR2(32) CHECK (result IN ('success','partial','fail')),
  executed_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  created_at    TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at    TIMESTAMP(6),
  CONSTRAINT fk_action_event FOREIGN KEY (event_id) 
    REFERENCES cry_event(event_id) ON DELETE CASCADE
);

-- 13) 알림 이력
CREATE TABLE notification_log (
  notification_id NUMBER(19) PRIMARY KEY,
  event_id        NUMBER(19) NOT NULL,
  guardian_id     NUMBER(19) NOT NULL,
  action_text     VARCHAR2(4000),
  channel         VARCHAR2(16) NOT NULL CHECK (channel IN ('sms','push','both')),
  sent_at         TIMESTAMP(6),
  status          VARCHAR2(16) CHECK (status IN ('sent','failed','queued')),
  provider_msg_id VARCHAR2(128),
  latency_ms      NUMBER(10),
  created_at      TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at      TIMESTAMP(6),
  CONSTRAINT fk_notif_event FOREIGN KEY (event_id) 
    REFERENCES cry_event(event_id) ON DELETE CASCADE,
  CONSTRAINT fk_notif_guardian FOREIGN KEY (guardian_id) 
    REFERENCES guardian(guardian_id) ON DELETE CASCADE
);

-- 14) 리포트
CREATE TABLE report (
  report_id    NUMBER(19) PRIMARY KEY,
  infant_id    NUMBER(19) NOT NULL,
  period_start TIMESTAMP(6) NOT NULL,
  period_end   TIMESTAMP(6) NOT NULL,
  report_type  VARCHAR2(16) CHECK (report_type IN ('daily','weekly','monthly')),
  summary      CLOB,
  file_url     VARCHAR2(512),
  created_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at   TIMESTAMP(6),
  CONSTRAINT fk_report_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 15) 패턴 분석
CREATE TABLE pattern_analysis (
  pattern_id          NUMBER(19) PRIMARY KEY,
  infant_id           NUMBER(19) NOT NULL,
  time_slot           VARCHAR2(16),
  frequency           NUMBER(10),
  avg_duration_ms     NUMBER(10),
  predicted_next_time TIMESTAMP(6),
  created_at          TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at          TIMESTAMP(6),
  CONSTRAINT fk_pattern_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE CASCADE
);

-- 16) 임베딩 저장용
CREATE TABLE action_embedding (
  action_id      NUMBER PRIMARY KEY,
  model_name     VARCHAR2(100),
  embedding_json CLOB,
  created_at     TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at     TIMESTAMP,
  CONSTRAINT fk_embedding_action FOREIGN KEY (action_id) 
    REFERENCES action_log(action_id) ON DELETE CASCADE
);

-- 17) 의사 정보 테이블
CREATE TABLE doctors (
  doctor_id        NUMBER(19) PRIMARY KEY,
  guardian_id      NUMBER(19),
  doctor_name      VARCHAR2(100) NOT NULL,
  specialty        VARCHAR2(50) NOT NULL,
  experience_years NUMBER(3),
  license_number   VARCHAR2(50) UNIQUE NOT NULL,
  phone            VARCHAR2(20),
  email            VARCHAR2(100),
  profile_image    VARCHAR2(500),
  rating           NUMBER(2,1) DEFAULT 5.0,
  is_available     NUMBER(1) DEFAULT 1,
  created_at       TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP,
  CONSTRAINT fk_doctor_guardian FOREIGN KEY (guardian_id) 
    REFERENCES guardian(guardian_id) ON DELETE SET NULL,
  CONSTRAINT chk_doctor_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT chk_doctor_available CHECK (is_available IN (0,1))
);

-- 18) 화상 통화 세션 테이블
CREATE TABLE video_call_sessions (
  session_id       VARCHAR2(100) PRIMARY KEY,
  guardian_id      NUMBER(19) NOT NULL,
  doctor_id        NUMBER(19) NOT NULL,
  infant_id        NUMBER(19),
  status           VARCHAR2(20) DEFAULT 'SCHEDULED',
  scheduled_time   TIMESTAMP,
  start_time       TIMESTAMP,
  end_time         TIMESTAMP,
  duration_minutes NUMBER(5),
  notes            CLOB,
  diagnosis        CLOB,
  prescription     CLOB,
  created_at       TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at       TIMESTAMP DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_session_guardian FOREIGN KEY (guardian_id) 
    REFERENCES guardian(guardian_id) ON DELETE CASCADE,
  CONSTRAINT fk_session_doctor FOREIGN KEY (doctor_id) 
    REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  CONSTRAINT fk_session_infant FOREIGN KEY (infant_id) 
    REFERENCES infant(infant_id) ON DELETE SET NULL,
  CONSTRAINT chk_session_status CHECK (status IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED'))
);

-- 19) 통화 품질 피드백 테이블
CREATE TABLE call_feedback (
  feedback_id       NUMBER(19) PRIMARY KEY,
  session_id        VARCHAR2(100) NOT NULL,
  guardian_id       NUMBER(19) NOT NULL,
  rating            NUMBER(1) NOT NULL,
  video_quality     NUMBER(1),
  audio_quality     NUMBER(1),
  connection_stable NUMBER(1) CHECK (connection_stable IN (0,1)),
  comments          CLOB,
  created_at        TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at        TIMESTAMP,
  CONSTRAINT fk_feedback_session FOREIGN KEY (session_id) 
    REFERENCES video_call_sessions(session_id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_guardian FOREIGN KEY (guardian_id) 
    REFERENCES guardian(guardian_id) ON DELETE CASCADE,
  CONSTRAINT chk_feedback_rating CHECK (rating >= 1 AND rating <= 5)
);

-- 20) 의사 근무 시간 테이블
CREATE TABLE doctor_schedules (
  schedule_id   NUMBER(19) PRIMARY KEY,
  doctor_id     NUMBER(19) NOT NULL,
  day_of_week   NUMBER(1) NOT NULL,
  start_time    VARCHAR2(5) NOT NULL,
  end_time      VARCHAR2(5) NOT NULL,
  is_available  NUMBER(1) DEFAULT 1,
  created_at    TIMESTAMP DEFAULT SYSTIMESTAMP,
  updated_at    TIMESTAMP,
  CONSTRAINT fk_schedule_doctor FOREIGN KEY (doctor_id) 
    REFERENCES doctors(doctor_id) ON DELETE CASCADE,
  CONSTRAINT chk_schedule_day CHECK (day_of_week >= 0 AND day_of_week <= 6),
  CONSTRAINT chk_schedule_available CHECK (is_available IN (0,1))
);

PROMPT ✅ 테이블 생성 완료 (20개)

-- ========================================
-- STEP 3: INDEXES 생성 (성능 최적화 추가)
-- ========================================

CREATE INDEX idx_infant_guardian ON infant(guardian_id);
CREATE INDEX idx_audio_infant_time ON audio_file(infant_id, upload_time);
CREATE INDEX idx_infer_audio ON model_inference(audio_id);
CREATE INDEX idx_event_infant_time ON cry_event(infant_id, event_time);
CREATE INDEX idx_event_type_time ON cry_event(cry_type, event_time);
CREATE INDEX idx_growth_infant ON infant_growth(infant_id);
CREATE INDEX idx_vaccine_infant ON vaccination_record(infant_id);
CREATE INDEX idx_share_infant_guard ON family_sharing(infant_id, guardian_id);
CREATE INDEX idx_vision_infant ON vision_analysis(infant_id);
CREATE INDEX idx_action_event_time ON action_log(event_id, executed_at);
CREATE INDEX idx_notif_guardian_time ON notification_log(guardian_id, sent_at);
CREATE INDEX idx_report_infant_period ON report(infant_id, period_start);
CREATE INDEX idx_pattern_infant_slot ON pattern_analysis(infant_id, time_slot);

-- 화상 통화 및 역할 최적화
CREATE INDEX idx_guardian_role ON guardian(role);
CREATE INDEX idx_sessions_guardian ON video_call_sessions(guardian_id);
CREATE INDEX idx_sessions_doctor ON video_call_sessions(doctor_id);
CREATE INDEX idx_sessions_status ON video_call_sessions(status);
CREATE INDEX idx_sessions_scheduled ON video_call_sessions(scheduled_time);
CREATE INDEX idx_doctor_guardian_id ON doctors(guardian_id);

PROMPT ✅ 인덱스 생성 완료 (19개)

-- ========================================
-- STEP 4: TRIGGERS 생성 (시퀀스 및 updated_at 자동화)
-- ========================================

-- 공통 updated_at 업데이트 트리거 생성을 위한 프로시저 (편의상 개별 트리거로 작성)
CREATE OR REPLACE TRIGGER trg_guardian_br
BEFORE INSERT OR UPDATE ON guardian FOR EACH ROW
BEGIN
  IF INSERTING THEN
    IF :new.guardian_id IS NULL THEN SELECT seq_guardian.NEXTVAL INTO :new.guardian_id FROM dual; END IF;
  END IF;
  :new.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_infant_br
BEFORE INSERT OR UPDATE ON infant FOR EACH ROW
BEGIN
  IF INSERTING THEN
    IF :new.infant_id IS NULL THEN SELECT seq_infant.NEXTVAL INTO :new.infant_id FROM dual; END IF;
  END IF;
  :new.updated_at := SYSTIMESTAMP;
END;
/

CREATE OR REPLACE TRIGGER trg_cry_event_br
BEFORE INSERT OR UPDATE ON cry_event FOR EACH ROW
BEGIN
  IF INSERTING THEN
    IF :new.event_id IS NULL THEN SELECT seq_cry_event.NEXTVAL INTO :new.event_id FROM dual; END IF;
  END IF;
  :new.updated_at := SYSTIMESTAMP;
END;
/

-- (기존 시퀀스 트리거를 통합 및 보완하여 다른 테이블에도 적용)
-- infant_growth, vaccination_record 등도 동일 패턴으로 트리거 추가 가능 (생략 또는 일괄 적용)
-- 예시:
CREATE OR REPLACE TRIGGER trg_infant_growth_br BEFORE INSERT OR UPDATE ON infant_growth FOR EACH ROW BEGIN IF INSERTING AND :new.growth_id IS NULL THEN SELECT seq_infant_growth.NEXTVAL INTO :new.growth_id FROM dual; END IF; :new.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_vaccination_br BEFORE INSERT OR UPDATE ON vaccination_record FOR EACH ROW BEGIN IF INSERTING AND :new.vaccine_id IS NULL THEN SELECT seq_vaccination.NEXTVAL INTO :new.vaccine_id FROM dual; END IF; :new.updated_at := SYSTIMESTAMP; END;
/
CREATE OR REPLACE TRIGGER trg_doctor_br BEFORE INSERT OR UPDATE ON doctors FOR EACH ROW BEGIN IF INSERTING AND :new.doctor_id IS NULL THEN SELECT seq_doctor.NEXTVAL INTO :new.doctor_id FROM dual; END IF; :new.updated_at := SYSTIMESTAMP; END;
/

PROMPT ✅ 트리거 생성 완료

-- ========================================
-- STEP 5: 테스트 데이터 생성 (불리언 값 0/1 반영)
-- ========================================

-- 뱃지 마스터
INSERT INTO badges_master (badge_id, badge_name, description, icon_url) VALUES ('FIRST_CRY', '첫 울음 분석', '첫 번째 울음소리 분석을 완료했습니다.', '🎉');
INSERT INTO badges_master (badge_id, badge_name, description, icon_url) VALUES ('TENTH_CRY', '육아 고수', '10번의 울음소리를 분석했습니다.', '👑');

-- 환자/보호자 (0/1 반영)
INSERT INTO guardian (name, phone, email, password_hash, role, notification_pref, email_verified)
VALUES ('김철수', '010-1234-5678', 'chulsoo@example.com', '$2b$10$sVPbSMj4.vMrO9psfXsAl.NfiPjt5jYBM9HTaXKvui3ZTIP7ekkUi', 'patient', 'both', 1);

-- 의사 계정
INSERT INTO guardian (name, phone, email, password_hash, role, notification_pref)
VALUES ('김소아', '010-5001-1234', 'doctor1@hospital.com', '$2b$10$sVPbSMj4.vMrO9psfXsAl.NfiPjt5jYBM9HTaXKvui3ZTIP7ekkUi', 'doctor', 'both');

-- 아기
INSERT INTO infant (guardian_id, name, birth_date, gender) VALUES (1, '김예준', TO_DATE('2024-01-15', 'YYYY-MM-DD'), 'M');

-- 울음 이벤트 ( needs_consultation=1 반영)
INSERT INTO cry_event (infant_id, event_time, duration_ms, confidence, severity, cry_type, needs_consultation)
VALUES (1, SYSTIMESTAMP - INTERVAL '1' DAY, 12000, 0.98, 'High', 'belly_pain', 1);

-- 의사 정보
INSERT INTO doctors (doctor_name, specialty, experience_years, license_number, email, phone, rating, is_available, guardian_id)
VALUES ('김소아', '소아과', 15, 'LIC-2009-12345', 'doctor1@hospital.com', '010-5001-1234', 4.9, 1, 2);

COMMIT;

PROMPT ============================================
PROMPT BabyCry 통합 스키마 v2.1 보완 및 생성 완료!
PROMPT ============================================
PROMPT 📊 불리언 타입이 NUMBER(1)로 통일되었습니다.
PROMPT 📊 모든 주요 테이블에 updated_at 및 Soft Delete 기반이 마련되었습니다.
PROMPT 📊 인덱스와 주석이 추가되어 성능과 가독성이 향상되었습니다.
PROMPT ============================================
