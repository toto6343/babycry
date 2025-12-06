# 🍼 Baby Cry Analysis System

아기 울음소리를 AI로 분석하여 원인을 파악하고, 보호자에게 적절한 조치를 추천하는 시스템입니다.

---

## 📋 목차

- [시작하기](#-시작하기)
- [환경변수 설정](#-환경변수-설정)
- [프로젝트 구조](#-프로젝트-구조)
- [주요 기능](#-주요-기능)
- [API 가이드](#-api-가이드)
- [업데이트 현황](#-업데이트-현황)
- [향후 계획](#-향후-계획)

---

## 🚀 시작하기

### 1️⃣ Node Backend 실행

```bash
cd Final_Project/node-backend
npm install
npm start
```

**정상 실행 로그:**
```
Oracle connection pool created
Node server running at http://localhost:4000
```

### 2️⃣ Python Backend 실행

> ⚠️ Python 3.11 버전이 필요합니다.

```bash
cd Final_Project/python-backend

# 가상환경 생성
py -3.11 -m venv venv
venv\Scripts\activate

# 라이브러리 설치
pip install -r requirements.txt

# 서버 실행
uvicorn main:app --reload --port 8001
```

**정상 실행 로그:**
```
Uvicorn running on http://localhost:8001
All models loaded successfully!
DB 연결 성공
```

### 3️⃣ Frontend 실행

```bash
cd Final_Project/frontend
npm install
npm start
```

---

## ⚙️ 환경변수 설정

각 백엔드 폴더에 `.env` 파일이 필요합니다.

### Node Backend (`.env`)

```env
# Database
DB_USER=babycry
DB_PASSWORD=YOUR_PASSWORD
DB_DSN=localhost:1521/XEPDB1

ORACLE_USER=babycry
ORACLE_PASSWORD=YOUR_PASSWORD
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1

# OpenAI
OPENAI_API_KEY=sk-xxxx
OPENAI_MODEL=gpt-4.1-mini

# Twilio
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_PHONE_NUMBER=+1xxxx

# Server
PORT=4000
```

### Python Backend (`.env`)

```env
# Database
DB_USER=babycry
DB_PASSWORD=YOUR_PASSWORD
DB_DSN=localhost:1521/XEPDB1

# Analysis Settings
CRY_SENSITIVITY=balanced
NOTIFICATION_URL=http://localhost:4000/api/analysis/result
```

> 📌 **참고:** 현재 XEPDB1로 테스트되었습니다. XE로 변경 시 환경변수를 수정해주세요.

---

## 📁 프로젝트 구조

```
Final_Project/
├── node-backend/      # Node.js API 서버
├── python-backend/    # Python AI 분석 서버
├── frontend/          # React 프론트엔드
├── models/            # AI 모델 파일
└── db/                # 데이터베이스 스키마
```

---

## ✨ 주요 기능

### 1. 인증 시스템 (Auth)
- 보호자 계정 생성 및 로그인
- JWT 기반 인증

**API Endpoints:**
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인

**필요한 정보:**
- 이름 (name)
- 이메일 (email)
- 비밀번호 (password)
- 전화번호 (phone) - 선택사항

### 2. 아기 관리
- 아기 정보 등록 및 조회
- 여러 아기 관리 가능

**API Endpoints:**
- `POST /api/infants` - 아기 등록
- `GET /api/infants` - 아기 목록 조회

**필요한 정보:**
- 이름 (name)
- 생년월일 (birthDate) - YYYY-MM-DD 형식
- 성별 (gender)
- 프로필 이미지 (profileImage) - 선택사항

### 3. 울음 분석
- 녹음 파일 업로드 및 AI 분석
- 울음 원인 및 심각도 파악

**API Endpoint:**
- `POST /api/upload` - 파일 업로드 (FastAPI)

**분석 결과 예시:**
```json
{
  "message": "File received and processed",
  "prediction": "hungry",
  "severity": "High",
  "confidence": 0.92
}
```

### 4. 대시보드
- 울음 이벤트 히스토리
- GPT 기반 조치 추천
- 보호자 조치 기록 관리

**API Endpoint:**
- `GET /api/actions/dashboard?infantId={id}`

**응답 구조:**
```json
{
  "events": [
    {
      "eventId": 11,
      "cryType": "hungry",
      "severity": "High",
      "confidence": 0.92,
      "eventTime": "2024-01-13 10:23:11",
      "notification": {
        "actionText": "분유 온도를 확인해 주세요."
      },
      "actions": [
        {
          "actionId": 51,
          "actionDetail": "분유를 데워 먹임",
          "result": "success",
          "executedAt": "2024-01-13 10:25:00"
        }
      ]
    }
  ]
}
```

### 5. 보호자 조치 관리
- 조치 내용 기록
- 조치 결과 업데이트
- 조치 히스토리 삭제

**API Endpoints:**
- `POST /api/actions/record` - 조치 기록
- `PUT /api/actions/:actionId` - 조치 수정
- `DELETE /api/actions/:actionId` - 조치 삭제

**조치 결과 옵션:**
- `success` - 성공
- `partial` - 부분 성공
- `fail` - 실패

### 6. AI 챗봇
- GPT 기반 육아 상담
- 맞춤형 조언 제공

**API Endpoint:**
- `POST /api/chatbot`

**요청 형식:**
```json
{
  "infantId": 3,
  "guardianId": 12,
  "message": "아기가 잠을 잘 안자요",
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

### 7. 음악 재생 기능
- 울음 원인에 따른 자동 음악 재생
- Tired, Emotional 상태 지원

---

## 🗄️ 데이터베이스 스키마

### 주요 테이블

#### `infant` - 아기 정보
- `infant_id` - 아기 고유 ID
- `name` - 이름
- `birth_date` - 생년월일
- `gender` - 성별

#### `guardian` - 보호자 정보
- `guardian_id` - 보호자 고유 ID
- `name` - 이름
- `email` - 이메일
- `phone` - 전화번호

#### `cry_event` - 울음 이벤트
- `event_id` - 이벤트 고유 ID
- `infant_id` - 아기 ID
- `severity` - 심각도
- `cry_type` - 울음 원인
- `confidence` - 신뢰도
- `event_time` - 발생 시간

#### `action_log` - 보호자 조치 기록
- `action_id` - 조치 고유 ID
- `event_id` - 이벤트 ID
- `action_detail` - 조치 내용
- `result` - 결과
- `executed_at` - 실행 시간

#### `action_embedding` - 조치 임베딩
- `action_id` - 조치 ID
- `embedding` - 벡터 임베딩 (AI 추천용)

---

## 📱 UI 페이지 구성

| 페이지 | 주요 기능 |
|--------|----------|
| 로그인 | 이메일/비밀번호 입력 |
| 회원가입 | 보호자 정보 입력 |
| 아기 선택 | 내 아기 목록, 아기 추가 |
| 아기 등록 | 아기 정보 입력 |
| 울음 업로드 | 파일 업로드, 결과 표시 |
| 대시보드 | 이벤트 카드, 조치 CRUD, 추천 조치 |
| 챗봇 | 채팅 UI |

---

## 🔐 인증

모든 API 요청은 JWT 인증이 필요합니다.

**헤더 포함:**
```
Authorization: Bearer {your_jwt_token}
```

로그인 성공 시 받은 토큰을 `localStorage`에 저장하여 사용하세요.

---

## 📊 업데이트 현황

**2025-11-26 업데이트:**

- ✅ Tired, Emotional 상태에 대응하는 로컬 음악 재생 기능
- ✅ Action_log 기록/수정/삭제 기능
- ✅ Action_log가 반영된 조치 추천
- ✅ Action_log 및 DB 데이터가 반영된 챗봇
- ✅ DB 스키마 변경 (테이블 추가 + 컬럼 삭제)
- ✅ Python API Flask 삭제
- ✅ 프로토타입 UI 구현

---

## 🎯 향후 계획

1. 대시보드 및 UI/UX 개선
2. 울음 원인에 따른 오디오 파일 재생 기능 확장

---

## 💡 UI 개발 팁

### 핵심 포인트

1. **infantId는 필수**: 모든 기능에서 아기 선택 UI 필요
2. **조치 관리**: 대시보드에서 수정/삭제 가능
3. **GPT 추천**: 서버가 자동 생성 (편집 불가)
4. **파일 업로드**: FastAPI `/api/upload` 하나만 사용
5. **인증**: 모든 API는 JWT 토큰 필요

### 에러 처리

- 로딩 상태 표시
- 에러 메시지 사용자 친화적으로 표시
- 네트워크 실패 시 재시도 옵션 제공

---

## 📞 문의

프로젝트 관련 문의사항이 있으시면 이슈를 등록해주세요.

---

**Made with ❤️ for babies and parents**
