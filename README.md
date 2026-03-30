# 👶 BabyCry - 아기 울음소리 AI 분석 및 통합 관리 솔루션

BabyCry는 아기 울음소리를 AI로 분석하여 부모에게 원인을 알려주고, 육아 조치 기록 및 전문가 연계를 지원하는 통합 플랫폼입니다.

## 🚀 시작하기

### 1. Node-backend (API 서버)
```bash
cd node-backend
npm install
npm start
```
* **정상 로그:** `Oracle connection pool created`, `Node server running at http://localhost:4000`

### 2. Python-backend (AI 분석 서버)
* **권장 환경:** Python 3.11
```bash
cd python-backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```
* **정상 로그:** `Uvicorn running on http://localhost:8001`, `All models loaded successfully!`

### 3. Frontend (사용자 UI)
```bash
cd frontend
npm install
npm start
```

---

## ⚙️ 환경변수 설정 (.env)

각 백엔드 디렉토리에 `.env` 파일을 생성하고 아래 내용을 설정해야 합니다.

### node-backend/.env
- `DB_USER`, `DB_PASSWORD`, `DB_DSN`: Oracle DB 접속 정보
- `OPENAI_API_KEY`: GPT-4 기반 조치 추천 및 챗봇용 API 키
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: SMS 알림용

### python-backend/.env
- `DB_USER`, `DB_PASSWORD`, `DB_DSN`: Oracle DB 접속 정보
- `CRY_SENSITIVITY`: 울음 감도 설정 (예: balanced)
- `NOTIFICATION_URL`: 분석 결과 전송용 엔드포인트

---

## 📂 프로젝트 구조
- `frontend/`: React 기반 웹 대시보드 및 업로드 UI
- `node-backend/`: 사용자 관리, 데이터 기록, GPT 연동 서비스
- `python-backend/`: 울음소리 실시간 분석 및 AI 모델 추론
- `models/`: 학습된 AI 모델 파일 (.pkl)
- `db/`: 데이터베이스 스키마 및 초기화 SQL

---

## ✨ 주요 기능
1. **울음 분석:** 실시간 오디오 스트리밍 및 파일 업로드를 통한 원인(배고픔, 졸림 등) 분석
2. **맞춤형 조치 추천:** 분석 결과와 과거 기록을 바탕으로 GPT가 최적의 조치 방법 제안
3. **육아 대시보드:** 울음 이벤트 통계, 조치 기록(CRUD), 원더위크 알림
4. **AI 챗봇:** 육아 궁금증 해결을 위한 전문가급 상담 인터페이스
5. **의사 연계:** 심각도가 높은 경우 담당 소아과 의사에게 자동 알림 및 리포트 공유

---

## 📈 업데이트 내역

### v4.0 (최신) - 생명 안전 및 보안 강화
- **바이오 신호 결합:** 웨어러블 기기와 연동하여 체온/심박수 기반 위험도 교차 검증
- **오프라인 페일세이프:** 네트워크 단절 시 엣지 디바이스를 통한 로컬 비상 경보 작동
- **의료급 보안:** 개인정보 및 민감 데이터 AES-256 종단간 암호화 적용

### v3.0 - 엔터프라이즈 기능 확장
- **Voice ID:** 아기별 음색 식별 기술 도입 (다둥이/조리원 환경 대응)
- **MLOps 파이프라인:** 사용자 피드백을 통한 모델 자동 재학습 및 무중단 배포
- **하이브리드 알림:** FCM 앱 푸시 및 Twilio SMS 통합을 통한 운영 비용 최적화

---

## 🛠 향후 계획
- 대시보드 UI/UX 고도화 (다크모드 및 차트 시각화 개선)
- 울음 원인에 따른 맞춤형 자장가/백색소음 자동 재생 기능 확장
