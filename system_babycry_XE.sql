-- ========================================
-- BabyCry 유저 생성 및 권한 설정
-- ========================================
-- SYSTEM 계정으로 실행할 것

-- 1) 유저 생성
CREATE USER babycry IDENTIFIED BY "StrongPassword123!";

-- 2) 기본 권한 부여
GRANT CONNECT, RESOURCE TO babycry;
GRANT CREATE SESSION TO babycry;
GRANT CREATE TABLE TO babycry;
GRANT CREATE SEQUENCE TO babycry;
GRANT CREATE VIEW TO babycry;
GRANT CREATE PROCEDURE TO babycry;
GRANT CREATE TRIGGER TO babycry;

-- 3) 추가 권한 (선택사항이지만 권장)
GRANT CREATE SYNONYM TO babycry;           -- 동의어 생성
GRANT CREATE JOB TO babycry;               -- 스케줄러 작업 생성
GRANT CREATE TYPE TO babycry;              -- 사용자 정의 타입

-- 4) 테이블스페이스 설정
ALTER USER babycry DEFAULT TABLESPACE USERS;
ALTER USER babycry TEMPORARY TABLESPACE TEMP;
ALTER USER babycry QUOTA UNLIMITED ON USERS;

-- 5) 프로파일 설정 (비밀번호 정책 - 선택사항)
-- ALTER USER babycry PROFILE DEFAULT;

-- ========================================
-- 검증 쿼리 (선택사항)
-- ========================================
-- 유저 생성 확인
SELECT username, account_status, default_tablespace, temporary_tablespace
FROM dba_users
WHERE username = 'BABYCRY';

-- 부여된 권한 확인
SELECT grantee, privilege
FROM dba_sys_privs
WHERE grantee = 'BABYCRY'
ORDER BY privilege;

-- 롤 확인
SELECT grantee, granted_role
FROM dba_role_privs
WHERE grantee = 'BABYCRY';

-- 테이블스페이스 할당량 확인
SELECT tablespace_name, bytes/1024/1024 as mb_used, max_bytes/1024/1024 as mb_max
FROM dba_ts_quotas
WHERE username = 'BABYCRY';

-- ========================================
-- 이후 작업
-- ========================================
-- 1. babycry 유저로 접속
-- CONNECT babycry/StrongPassword123!

-- 2. 스키마 생성 스크립트 실행
-- @schema_creation.sql