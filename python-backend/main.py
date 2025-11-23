from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.api import router
from dotenv import load_dotenv
load_dotenv()

app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # 위에서 정의한 origin만 허용
    allow_credentials=True,
    allow_methods=["*"],            # 모든 HTTP 메서드 허용 (GET, POST 등)
    allow_headers=["*"],            # 모든 헤더 허용 (Authorization 등)
)

# /api 로 prefix 붙일지 말지는 너 마음대로
app.include_router(router)

@app.get("/health")
def health():
    return {"status": "ok", "python-backend": True}
