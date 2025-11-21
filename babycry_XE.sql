-- ========================================
-- Oracle XE 호환 스키마 생성 스크립트
-- babycry 유저로 접속한 상태에서 실행
-- ========================================

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

-- ========================================
-- STEP 2: TABLES 생성
-- ========================================

-- 1) 보호자
CREATE TABLE guardian (
  guardian_id        NUMBER(19) PRIMARY KEY,
  name               VARCHAR2(100) NOT NULL,
  phone              VARCHAR2(32)  NOT NULL,
  email              VARCHAR2(254),
  notification_pref  VARCHAR2(16)  DEFAULT 'sms' CHECK (notification_pref IN ('sms','push','both')),
  created_at         TIMESTAMP(6) DEFAULT SYSTIMESTAMP
);

-- 2) 아이
CREATE TABLE infant (
  infant_id    NUMBER(19) PRIMARY KEY,
  guardian_id  NUMBER(19) NOT NULL,
  name         VARCHAR2(100) NOT NULL,
  birth_date   DATE,
  gender       VARCHAR2(16) CHECK (gender IN ('male','female','other')),
  created_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  updated_at   TIMESTAMP(6),
  CONSTRAINT fk_infant_guardian FOREIGN KEY (guardian_id) REFERENCES guardian(guardian_id)
);

-- 3) 음성 파일
CREATE TABLE audio_file (
  audio_id     NUMBER(19) PRIMARY KEY,
  infant_id    NUMBER(19) NOT NULL,
  upload_time  TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  storage_uri  VARCHAR2(512) NOT NULL,
  duration_ms  NUMBER(10),
  sample_rate  NUMBER(10),
  file_hash    VARCHAR2(128),
  deleted_at   TIMESTAMP(6),
  CONSTRAINT fk_audio_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id)
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
  CONSTRAINT fk_infer_audio FOREIGN KEY (audio_id) REFERENCES audio_file(audio_id)
);

-- 5) 울음 이벤트
CREATE TABLE cry_event (
  event_id    NUMBER(19) PRIMARY KEY,
  infant_id   NUMBER(19) NOT NULL,
  event_time  TIMESTAMP(6) NOT NULL,
  duration_ms NUMBER(10),
  confidence  NUMBER(5,2),
  severity    VARCHAR2(16),
  cry_type    VARCHAR2(32),
  detected_by VARCHAR2(32) DEFAULT 'model',
  is_resolved CHAR(1) DEFAULT 'N' CHECK (is_resolved IN ('Y','N')),
  created_at  TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_event_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id)
);

-- 6) 보호자 조치 로그
CREATE TABLE action_log (
  action_id     NUMBER(19) PRIMARY KEY,
  event_id      NUMBER(19) NOT NULL,
  action_type   VARCHAR2(32) NOT NULL,
  action_detail VARCHAR2(4000),
  result        VARCHAR2(32),
  executed_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  created_at    TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_action_event FOREIGN KEY (event_id) REFERENCES cry_event(event_id)
);

-- 7) 알림 이력
CREATE TABLE notification_log (
  notification_id NUMBER(19) PRIMARY KEY,
  event_id        NUMBER(19) NOT NULL,
  guardian_id     NUMBER(19) NOT NULL,
  channel         VARCHAR2(16) NOT NULL CHECK (channel IN ('sms','push','both')),
  sent_at         TIMESTAMP(6),
  status          VARCHAR2(16) CHECK (status IN ('sent','failed','queued')),
  provider_msg_id VARCHAR2(128),
  latency_ms      NUMBER(10),
  CONSTRAINT fk_notif_event FOREIGN KEY (event_id) REFERENCES cry_event(event_id),
  CONSTRAINT fk_notif_guardian FOREIGN KEY (guardian_id) REFERENCES guardian(guardian_id)
);

-- 8) 리포트
CREATE TABLE report (
  report_id    NUMBER(19) PRIMARY KEY,
  infant_id    NUMBER(19) NOT NULL,
  period_start TIMESTAMP(6) NOT NULL,
  period_end   TIMESTAMP(6) NOT NULL,
  report_type  VARCHAR2(16) CHECK (report_type IN ('daily','weekly','monthly')),
  summary      CLOB,
  file_url     VARCHAR2(512),
  created_at   TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_report_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id)
);

-- 9) 패턴 분석
CREATE TABLE pattern_analysis (
  pattern_id          NUMBER(19) PRIMARY KEY,
  infant_id           NUMBER(19) NOT NULL,
  time_slot           VARCHAR2(16),
  frequency           NUMBER(10),
  avg_duration_ms     NUMBER(10),
  predicted_next_time TIMESTAMP(6),
  created_at          TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
  CONSTRAINT fk_pattern_infant FOREIGN KEY (infant_id) REFERENCES infant(infant_id)
);

-- ========================================
-- STEP 3: INDEXES 생성
-- ========================================
CREATE INDEX idx_infant_guardian ON infant(guardian_id);
CREATE INDEX idx_audio_infant_time ON audio_file(infant_id, upload_time);
CREATE INDEX idx_infer_audio ON model_inference(audio_id);
CREATE INDEX idx_infer_type_time ON model_inference(model_type, created_at);
CREATE INDEX idx_event_infant_time ON cry_event(infant_id, event_time);
CREATE INDEX idx_event_type_time ON cry_event(cry_type, event_time);
CREATE INDEX idx_action_event_time ON action_log(event_id, executed_at);
CREATE INDEX idx_notif_event ON notification_log(event_id);
CREATE INDEX idx_notif_guardian_time ON notification_log(guardian_id, sent_at);
CREATE INDEX idx_report_infant_period ON report(infant_id, period_start);
CREATE INDEX idx_pattern_infant_slot ON pattern_analysis(infant_id, time_slot);

-- ========================================
-- STEP 4: TRIGGERS 생성 (자동 증가)
-- ========================================

-- Guardian 트리거
CREATE OR REPLACE TRIGGER trg_guardian_bi
BEFORE INSERT ON guardian
FOR EACH ROW
WHEN (new.guardian_id IS NULL)
BEGIN
  SELECT seq_guardian.NEXTVAL INTO :new.guardian_id FROM dual;
END;
/

-- Infant 트리거
CREATE OR REPLACE TRIGGER trg_infant_bi
BEFORE INSERT ON infant
FOR EACH ROW
WHEN (new.infant_id IS NULL)
BEGIN
  SELECT seq_infant.NEXTVAL INTO :new.infant_id FROM dual;
END;
/

-- Audio File 트리거
CREATE OR REPLACE TRIGGER trg_audio_file_bi
BEFORE INSERT ON audio_file
FOR EACH ROW
WHEN (new.audio_id IS NULL)
BEGIN
  SELECT seq_audio_file.NEXTVAL INTO :new.audio_id FROM dual;
END;
/

-- Model Inference 트리거
CREATE OR REPLACE TRIGGER trg_model_inference_bi
BEFORE INSERT ON model_inference
FOR EACH ROW
WHEN (new.inference_id IS NULL)
BEGIN
  SELECT seq_model_inference.NEXTVAL INTO :new.inference_id FROM dual;
END;
/

-- Cry Event 트리거
CREATE OR REPLACE TRIGGER trg_cry_event_bi
BEFORE INSERT ON cry_event
FOR EACH ROW
WHEN (new.event_id IS NULL)
BEGIN
  SELECT seq_cry_event.NEXTVAL INTO :new.event_id FROM dual;
END;
/

-- Action Log 트리거
CREATE OR REPLACE TRIGGER trg_action_log_bi
BEFORE INSERT ON action_log
FOR EACH ROW
WHEN (new.action_id IS NULL)
BEGIN
  SELECT seq_action_log.NEXTVAL INTO :new.action_id FROM dual;
END;
/

-- Notification Log 트리거
CREATE OR REPLACE TRIGGER trg_notification_log_bi
BEFORE INSERT ON notification_log
FOR EACH ROW
WHEN (new.notification_id IS NULL)
BEGIN
  SELECT seq_notification_log.NEXTVAL INTO :new.notification_id FROM dual;
END;
/

-- Report 트리거
CREATE OR REPLACE TRIGGER trg_report_bi
BEFORE INSERT ON report
FOR EACH ROW
WHEN (new.report_id IS NULL)
BEGIN
  SELECT seq_report.NEXTVAL INTO :new.report_id FROM dual;
END;
/

-- Pattern Analysis 트리거
CREATE OR REPLACE TRIGGER trg_pattern_analysis_bi
BEFORE INSERT ON pattern_analysis
FOR EACH ROW
WHEN (new.pattern_id IS NULL)
BEGIN
  SELECT seq_pattern_analysis.NEXTVAL INTO :new.pattern_id FROM dual;
END;
/

-- ========================================
-- 완료!
-- ========================================
PROMPT ============================================
PROMPT Schema created successfully for Oracle XE!
PROMPT ============================================
PROMPT - 9 Sequences created
PROMPT - 9 Tables created
PROMPT - 11 Indexes created
PROMPT - 9 Triggers created
PROMPT ============================================

-- 수동으로 보호자 및 아기 생성
INSERT INTO guardian (name, phone, email, notification_pref)
VALUES ('김철수', '010-1234-5678', 'chulsoo@example.com', 'both');

INSERT INTO infant (guardian_id, name, birth_date, gender)
VALUES (1, '김예준', TO_DATE('2024-01-15', 'YYYY-MM-DD'), 'male');

COMMIT;