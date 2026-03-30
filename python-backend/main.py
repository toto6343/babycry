"""
FastAPI 메인 애플리케이션
기존 API + LangGraph 워크플로우 통합
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import os

# ✅ 기존 router import
from backend.api import router

# ✅ LangGraph 통합 함수 import
from backend.api import get_all_routers, LANGGRAPH_AVAILABLE

from dotenv import load_dotenv
load_dotenv()

# FastAPI 앱 생성
app = FastAPI(
    title="BabyCry AI Service",
    description="울음 분석 AI 서비스 with LangGraph 멀티 에이전트 시스템",
    version="2.0.0"
)

# CORS 설정
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:4000",  # Node.js 백엔드
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ====================================================================
# 라우터 등록 (기존 API + LangGraph)
# ====================================================================

# ✅ 방법 1: get_all_routers() 사용 (권장 - 자동으로 LangGraph 포함)
for router_instance in get_all_routers():
    app.include_router(router_instance)
    prefix = getattr(router_instance, 'prefix', 'root')
    print(f"✅ 라우터 등록: {prefix}")

# 기존 방법 (주석 처리 - 위에서 자동으로 포함됨)
# app.include_router(router)


# ====================================================================
# Static Files (음악 파일 서빙)
# ====================================================================

try:
    PROJECT_ROOT = Path(__file__).resolve().parent
    MUSIC_DIR = PROJECT_ROOT / 'music_local'
    
    if MUSIC_DIR.exists():
        app.mount("/music", StaticFiles(directory=str(MUSIC_DIR)), name="music")
        print(f"🎵 음악 디렉토리 마운트: {MUSIC_DIR}")
except Exception as e:
    print(f"⚠️ 음악 디렉토리 마운트 실패: {e}")


# ====================================================================
# 루트 엔드포인트
# ====================================================================

@app.get("/")
async def root():
    """API 루트 - 서비스 정보"""
    return {
        "service": "BabyCry AI",
        "version": "2.0.0",
        "description": "AI-powered baby cry analysis with LangGraph workflow",
        "features": [
            "Baby cry classification (6 types)",
            "LangGraph multi-agent workflow" if LANGGRAPH_AVAILABLE else "Legacy API only",
            "GPT-4 parenting advice",
            "Music recommendation",
            "SMS notification"
        ],
        "endpoints": {
            "legacy_api": "/api/*",
            "langgraph_workflow": "/api/v2/*" if LANGGRAPH_AVAILABLE else "Not available",
            "health_check": "/health",
            "api_docs": "/docs"
        }
    }


@app.get("/health")
def health():
    """
    시스템 헬스 체크 (LangGraph 상태 포함)
    """
    from backend.api import MUSIC_SERVICE_AVAILABLE, STORAGE_MANAGER_AVAILABLE
    
    health_status = {
        "status": "ok",
        "python-backend": True,
        "components": {
            "legacy_api": True,
            "langgraph_workflow": LANGGRAPH_AVAILABLE,
            "music_service": MUSIC_SERVICE_AVAILABLE,
            "storage_manager": STORAGE_MANAGER_AVAILABLE,
        }
    }
    
    # LangGraph 활성화 시 엔드포인트 목록 추가
    if LANGGRAPH_AVAILABLE:
        health_status["langgraph_endpoints"] = [
            "/api/v2/analyze-cry (전체 워크플로우)",
            "/api/v2/classify-only (분류만)",
            "/api/v2/get-advice (조언만)",
            "/api/v2/recommend-music (음악만)",
            "/api/v2/workflow-status (상태 확인)"
        ]
    
    return health_status


@app.get("/status")
async def status():
    """
    상세 시스템 상태 (디버깅용)
    """
    return {
        "status": "running",
        "langgraph_available": LANGGRAPH_AVAILABLE,
        "registered_routes": [
            {
                "path": route.path,
                "methods": list(route.methods) if hasattr(route, 'methods') else [],
                "name": route.name if hasattr(route, 'name') else "unknown"
            }
            for route in app.routes
            if hasattr(route, 'path')
        ]
    }


# ====================================================================
# 실행
# ====================================================================

if __name__ == "__main__":
    import uvicorn
    
    print("\n" + "="*60)
    print("🚀 BabyCry FastAPI 서버 시작")
    print("="*60)
    
    if LANGGRAPH_AVAILABLE:
        print("\n✅ LangGraph 워크플로우 활성화!")
        print("   멀티 에이전트 파이프라인 사용 가능")
    else:
        print("\n⚠️  LangGraph 비활성화 (레거시 API만 사용)")
        print("   활성화: pip install -r requirements_langgraph.txt")
    
    print("\n사용 가능한 엔드포인트:")
    print("  🏠 홈: http://localhost:8001/")
    print("  💚 Health: http://localhost:8001/health")
    print("  📚 API 문서: http://localhost:8001/docs")
    
    if LANGGRAPH_AVAILABLE:
        print("  🤖 LangGraph 상태: http://localhost:8001/api/v2/workflow-status")
        print("  🔥 전체 워크플로우: POST /api/v2/analyze-cry")
    
    print("\n레거시 API:")
    print("  📤 업로드: POST /api/upload")
    print("  💬 챗봇: POST /api/chatbot")
    print("  📊 대시보드: GET /api/dashboard")
    
    print("\n" + "="*60 + "\n")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        reload=True,  # 개발 모드
        log_level="info"
    )