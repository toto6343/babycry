"""
LangGraph Workflow Routes v2.0
울음 분석 LangGraph 워크플로우 API 엔드포인트

✅ 제공 기능:
- [NEW] 진짜 StateGraph 기반 워크플로우 (조건부 엣지, 자동 상태 관리)
- [LEGACY] 기존 순차 파이프라인 (호환성 유지)
- 개별 에이전트 독립 실행
- 플레이리스트 생성
- 주간/월간 리포트
"""

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse
from pathlib import Path
from datetime import datetime
import shutil
import os
import traceback

# ========================================
# 기존 워크플로우 (레거시)
# ========================================
try:
    from backend.agents.workflow import run_cry_analysis as run_legacy_workflow
    LEGACY_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Legacy workflow를 찾을 수 없습니다: {e}")
    LEGACY_AVAILABLE = False

# ========================================
# ✅ 진짜 LangGraph 워크플로우 (NEW!)
# ========================================
try:
    from langgraph.graph import StateGraph, END
    from typing import TypedDict, Literal
    LANGGRAPH_AVAILABLE = True
    print("✅ LangGraph (StateGraph) 사용 가능!")
except ImportError as e:
    print(f"⚠️ LangGraph를 찾을 수 없습니다: {e}")
    print("   pip install langgraph 실행 필요")
    LANGGRAPH_AVAILABLE = False

# 에이전트 import
try:
    from backend.agents.cry_classification_agent import CryClassificationAgent
    from backend.agents.parenting_advice_agent import ParentingAdviceAgent
    from backend.agents.music_recommendation_agent import MusicRecommendationAgent
    from backend.agents.notification_agent import NotificationAgent
    AGENTS_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ 에이전트를 찾을 수 없습니다: {e}")
    AGENTS_AVAILABLE = False

# FastAPI Router 생성
router = APIRouter(prefix="/api/v2", tags=["LangGraph Workflow v2"])

# 전역 에이전트 인스턴스 (싱글톤)
_classification_agent = None
_advice_agent = None
_music_agent = None
_notification_agent = None
_langgraph_app = None


def get_agents():
    """에이전트 싱글톤 - 지연 로딩"""
    global _classification_agent, _advice_agent, _music_agent, _notification_agent
    
    if not AGENTS_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Agents not available. Please check agent files."
        )
    
    if _classification_agent is None:
        print("🤖 Initializing agents...")
        _classification_agent = CryClassificationAgent()
        _advice_agent = ParentingAdviceAgent()
        _music_agent = MusicRecommendationAgent()
        _notification_agent = NotificationAgent()
        print("✅ Agents initialized")
    
    return _classification_agent, _advice_agent, _music_agent, _notification_agent


# ========================================
# ✅ 진짜 LangGraph 구현
# ========================================

if LANGGRAPH_AVAILABLE:
    # 상태 정의
    class CryAnalysisState(TypedDict):
        """LangGraph 상태 - 모든 노드가 공유"""
        # 입력
        audio_path: str
        infant_id: str
        user_id: str
        phone_number: str
        infant_age_months: int
        
        # 중간 결과
        cry_type: str
        confidence: float
        severity: str
        
        # 최종 결과
        advice: dict
        music: dict
        notification_sent: bool
        
        # 메타
        timestamp: str
        actions_taken: list
        error: str

    # ========================================
    # 노드 함수들
    # ========================================
    
    async def classify_cry_node(state: CryAnalysisState) -> CryAnalysisState:
        """노드 1: 울음 분류"""
        print(f"\n📍 [Node 1] Classify Cry")
        print(f"   Audio: {state['audio_path']}")
        
        classification_agent, _, _, _ = get_agents()
        
        try:
            result = await classification_agent.classify(state['audio_path'])
            
            print(f"   ✅ Result: {result['cry_type']} ({result['confidence']:.2%})")
            
            return {
                **state,
                'cry_type': result['cry_type'],
                'confidence': result['confidence'],
                'severity': result.get('severity', 'Medium'),
                'actions_taken': state.get('actions_taken', []) + [
                    f"✅ Classified as {result['cry_type']} (confidence: {result['confidence']:.2%})"
                ]
            }
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {
                **state,
                'cry_type': 'error',
                'confidence': 0.0,
                'error': str(e),
                'actions_taken': state.get('actions_taken', []) + [f"❌ Classification error: {e}"]
            }

    async def generate_advice_node(state: CryAnalysisState) -> CryAnalysisState:
        """노드 2: 조언 생성"""
        print(f"\n📍 [Node 2] Generate Advice")
        print(f"   Cry Type: {state['cry_type']}")
        
        _, advice_agent, _, _ = get_agents()
        
        try:
            result = await advice_agent.generate_advice(
                cry_type=state['cry_type'],
                confidence=state['confidence'],
                infant_age_months=state.get('infant_age_months')
            )
            
            print(f"   ✅ Advice generated (urgency: {result['urgency_level']})")
            
            return {
                **state,
                'advice': result,
                'actions_taken': state.get('actions_taken', []) + [
                    f"✅ Generated advice (urgency: {result['urgency_level']})"
                ]
            }
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {
                **state,
                'advice': {'error': str(e)},
                'error': str(e),
                'actions_taken': state.get('actions_taken', []) + [f"❌ Advice error: {e}"]
            }

    async def recommend_music_node(state: CryAnalysisState) -> CryAnalysisState:
        """노드 3: 음악 추천"""
        print(f"\n📍 [Node 3] Recommend Music")
        
        _, _, music_agent, _ = get_agents()
        
        try:
            result = await music_agent.recommend(state['cry_type'])
            
            print(f"   ✅ Music: {result.get('title', 'N/A')}")
            
            return {
                **state,
                'music': result,
                'actions_taken': state.get('actions_taken', []) + [
                    f"✅ Recommended: {result.get('title', 'N/A')}"
                ]
            }
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {
                **state,
                'music': {'error': str(e)},
                'actions_taken': state.get('actions_taken', []) + [f"❌ Music error: {e}"]
            }

    async def send_notification_node(state: CryAnalysisState) -> CryAnalysisState:
        """노드 4: 알림 전송"""
        print(f"\n📍 [Node 4] Send Notification")
        
        _, _, _, notification_agent = get_agents()
        
        try:
            is_urgent = (
                state.get('severity') == 'High' or 
                state.get('advice', {}).get('urgency_level') == 'high'
            )
            
            advice_text = state.get('advice', {}).get('advice', '')
            advice_summary = advice_text[:100] + '...' if len(advice_text) > 100 else advice_text
            
            result = await notification_agent.send_notification(
                phone_number=state['phone_number'],
                cry_type=state['cry_type'],
                confidence=state['confidence'],
                advice_summary=advice_summary,
                is_urgent=is_urgent
            )
            
            print(f"   ✅ Sent: {result['sent']}")
            
            return {
                **state,
                'notification_sent': result['sent'],
                'actions_taken': state.get('actions_taken', []) + [
                    f"✅ Notification sent via {result['channel']}"
                ]
            }
            
        except Exception as e:
            print(f"   ❌ Error: {e}")
            return {
                **state,
                'notification_sent': False,
                'actions_taken': state.get('actions_taken', []) + [f"❌ Notification error: {e}"]
            }

    # ========================================
    # 조건부 엣지
    # ========================================
    
    def should_continue_after_classify(state: CryAnalysisState) -> Literal["advice", "end"]:
        """분류 후 계속 진행 여부"""
        if state.get('cry_type') == 'not_cry':
            print("   → Not a cry, stopping")
            return "end"
        
        if state.get('cry_type') == 'error':
            print("   → Classification error, stopping")
            return "end"
        
        if state.get('confidence', 0) < 0.3:
            print(f"   → Low confidence ({state.get('confidence', 0):.2%}), stopping")
            return "end"
        
        print("   → Continuing to advice")
        return "advice"

    def should_send_notification(state: CryAnalysisState) -> Literal["notification", "end"]:
        """알림 전송 여부"""
        if not state.get('phone_number'):
            print("   → No phone number, skipping notification")
            return "end"
        
        if state.get('confidence', 0) < 0.5:
            print(f"   → Low confidence ({state.get('confidence', 0):.2%}), skipping notification")
            return "end"
        
        print("   → Sending notification")
        return "notification"

    # ========================================
    # 그래프 구성
    # ========================================
    
    def build_langgraph():
        """LangGraph 워크플로우 구축"""
        global _langgraph_app
        
        if _langgraph_app is not None:
            return _langgraph_app
        
        print("🔨 Building LangGraph workflow...")
        
        workflow = StateGraph(CryAnalysisState)
        
        # 노드 추가
        workflow.add_node("classify", classify_cry_node)
        workflow.add_node("advice", generate_advice_node)
        workflow.add_node("music", recommend_music_node)
        workflow.add_node("notification", send_notification_node)
        
        # 시작점
        workflow.set_entry_point("classify")
        
        # 엣지 연결
        workflow.add_conditional_edges(
            "classify",
            should_continue_after_classify,
            {
                "advice": "advice",
                "end": END
            }
        )
        
        workflow.add_edge("advice", "music")
        
        workflow.add_conditional_edges(
            "music",
            should_send_notification,
            {
                "notification": "notification",
                "end": END
            }
        )
        
        workflow.add_edge("notification", END)
        
        # 컴파일
        _langgraph_app = workflow.compile()
        
        print("✅ LangGraph workflow built!")
        
        return _langgraph_app


# ====================================================================
# 🔥 메인 워크플로우 엔드포인트 - 진짜 LangGraph
# ====================================================================

@router.post("/langgraph/analyze-cry")
async def analyze_cry_with_real_langgraph(
    audio_file: UploadFile = File(..., description="울음 소리 오디오 파일 (.wav)"),
    infant_id: str = Form(..., description="영아 ID"),
    user_id: str = Form(..., description="사용자 ID"),
    phone_number: str = Form(None, description="알림 받을 전화번호 (선택)"),
    infant_age_months: int = Form(None, description="영아 월령 (선택)")
):
    """
    🔥 진짜 LangGraph (StateGraph) 기반 울음 분석
    
    **NEW Features:**
    - ✅ StateGraph 사용
    - ✅ 조건부 엣지 (conditional_edges)
    - ✅ 자동 상태 관리
    - ✅ actions_taken으로 완벽한 추적
    - ✅ 워크플로우 시각화 가능
    
    **워크플로우:**
    1. classify → 울음 분류
    2. (조건) confidence > 0.3 AND cry_type != 'not_cry' → advice
    3. advice → 조언 생성
    4. music → 음악 추천
    5. (조건) phone_number exists AND confidence > 0.5 → notification
    6. notification → 알림 전송
    
    **Returns:**
    - langgraph_info.engine: "StateGraph" (진짜 확인!)
    - workflow.actions_taken: 각 단계 실행 이력
    - workflow.total_steps: 실행된 노드 개수
    """
    temp_file = None
    
    try:
        if not LANGGRAPH_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "LangGraph (StateGraph) not available",
                    "solution": "pip install langgraph",
                    "fallback": "Use /api/v2/analyze-cry for legacy workflow"
                }
            )
        
        if not AGENTS_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Agents not available"
            )
        
        print(f"\n{'='*60}")
        print(f"🔥 Real LangGraph (StateGraph) 워크플로우 시작")
        print(f"{'='*60}")
        print(f"📥 파일: {audio_file.filename}")
        print(f"👶 영아 ID: {infant_id}")
        print(f"👤 사용자 ID: {user_id}")
        
        # 1. 오디오 파일 저장
        upload_dir = Path("uploads") / user_id / infant_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = upload_dir / f"cry_{timestamp}.wav"
        temp_file = file_path
        
        with file_path.open("wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        
        print(f"✅ 파일 저장: {file_path}")
        
        # 2. LangGraph 초기 상태
        initial_state = {
            'audio_path': str(file_path),
            'infant_id': infant_id,
            'user_id': user_id,
            'phone_number': phone_number,
            'infant_age_months': infant_age_months,
            'timestamp': datetime.now().isoformat(),
            'actions_taken': [],
            'cry_type': None,
            'confidence': 0.0,
            'severity': None,
            'advice': None,
            'music': None,
            'notification_sent': False,
            'error': None
        }
        
        # 3. LangGraph 실행
        print(f"\n🔄 StateGraph 실행 중...")
        
        app = build_langgraph()
        final_state = await app.ainvoke(initial_state)
        
        print(f"\n✅ StateGraph 워크플로우 완료!")
        print(f"   울음 유형: {final_state.get('cry_type')}")
        print(f"   확신도: {final_state.get('confidence', 0):.2%}")
        print(f"   실행 단계: {len(final_state.get('actions_taken', []))}개")
        
        # 4. 결과 반환
        response_data = {
            "success": final_state.get('cry_type') != 'error',
            "analysis": {
                "cry_type": final_state.get("cry_type"),
                "confidence": final_state.get("confidence"),
                "severity": final_state.get("severity"),
                "timestamp": final_state.get("timestamp"),
                "audio_file": file_path.name
            },
            "advice": final_state.get("advice"),
            "music": final_state.get("music"),
            "notification": {
                "sent": final_state.get("notification_sent", False)
            },
            "workflow": {
                "actions_taken": final_state.get("actions_taken", []),
                "total_steps": len(final_state.get("actions_taken", [])),
                "error": final_state.get("error")
            },
            "langgraph_info": {
                "engine": "StateGraph",  # ✅ 진짜 확인!
                "version": "v2.0",
                "features": [
                    "conditional_edges",
                    "automatic_state_management",
                    "workflow_visualization"
                ]
            }
        }
        
        return JSONResponse(content=response_data)
        
    except HTTPException:
        raise
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"\n❌ LangGraph 에러: {e}")
        print(error_trace)
        
        raise HTTPException(
            status_code=500,
            detail={
                "error": "LangGraph 실행 실패",
                "message": str(e),
                "trace": error_trace.splitlines()[-5:]
            }
        )


@router.get("/langgraph/workflow-diagram")
async def get_langgraph_diagram():
    """
    📊 LangGraph 워크플로우 다이어그램
    
    StateGraph의 구조를 시각적으로 표현
    """
    if not LANGGRAPH_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="LangGraph not available. pip install langgraph"
        )
    
    diagram = """
BabyCry LangGraph (StateGraph) Workflow:

┌─────────────────┐
│    classify     │  울음 분류 (6가지 유형)
└────────┬────────┘
         │
         ↓ (조건: cry_type != 'not_cry' AND confidence > 0.3)
┌─────────────────┐
│     advice      │  GPT-4 조언 생성
└────────┬────────┘
         │
         ↓ (직접 연결)
┌─────────────────┐
│      music      │  음악 추천
└────────┬────────┘
         │
         ↓ (조건: phone_number exists AND confidence > 0.5)
┌─────────────────┐
│  notification   │  SMS/푸시 알림
└────────┬────────┘
         │
         ↓
       [END]

✅ 특징:
- StateGraph: 자동 상태 관리
- Conditional Edges: 조건부 분기
- Actions Taken: 완벽한 추적
"""
    
    return {
        "diagram": diagram,
        "nodes": [
            {
                "name": "classify",
                "description": "울음 분류 (6가지 유형)",
                "type": "agent_node"
            },
            {
                "name": "advice",
                "description": "GPT-4 조언 생성",
                "type": "agent_node"
            },
            {
                "name": "music",
                "description": "음악 추천",
                "type": "agent_node"
            },
            {
                "name": "notification",
                "description": "SMS/푸시 알림",
                "type": "agent_node"
            }
        ],
        "edges": [
            {
                "from": "classify",
                "to": "advice",
                "type": "conditional",
                "condition": "cry_type != 'not_cry' AND confidence > 0.3"
            },
            {
                "from": "advice",
                "to": "music",
                "type": "direct"
            },
            {
                "from": "music",
                "to": "notification",
                "type": "conditional",
                "condition": "phone_number exists AND confidence > 0.5"
            }
        ],
        "state_keys": [
            "audio_path", "infant_id", "user_id", "phone_number",
            "cry_type", "confidence", "severity", 
            "advice", "music", "notification_sent",
            "timestamp", "actions_taken", "error"
        ]
    }


# ====================================================================
# 레거시 워크플로우 엔드포인트 (기존 호환성 유지)
# ====================================================================

@router.post("/analyze-cry")
async def analyze_cry_legacy(
    audio_file: UploadFile = File(...),
    infant_id: str = Form(...),
    user_id: str = Form(...),
    phone_number: str = Form(None)
):
    """
    ⚠️ LEGACY: 기존 순차 파이프라인 (StateGraph 미사용)
    
    **호환성 유지용**
    
    **New Version:** /api/v2/langgraph/analyze-cry 사용 권장
    - ✅ StateGraph 사용
    - ✅ 조건부 엣지
    - ✅ 완벽한 추적
    """
    temp_file = None
    try:
        if not LEGACY_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="Legacy workflow not available"
            )
        
        print(f"\n{'='*60}")
        print(f"⚠️ Legacy 워크플로우 시작 (순차 파이프라인)")
        print(f"{'='*60}")
        
        # 파일 저장
        upload_dir = Path("uploads") / user_id / infant_id
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_path = upload_dir / f"cry_{timestamp}.wav"
        temp_file = file_path
        
        with file_path.open("wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        
        # 레거시 워크플로우 실행
        result = await run_legacy_workflow(
            audio_file_path=str(file_path),
            infant_id=infant_id,
            user_id=user_id
        )
        
        return JSONResponse(content={
            "success": result["success"],
            "analysis": {
                "cry_type": result.get("cry_type"),
                "confidence": result.get("confidence"),
                "timestamp": result.get("timestamp")
            },
            "advice": result.get("advice"),
            "music": result.get("music"),
            "notification": {
                "sent": result.get("notification_sent", False)
            },
            "workflow": {
                "actions_taken": result.get("actions_taken", []),
                "error": result.get("error")
            },
            "legacy_info": {
                "engine": "sequential_pipeline",
                "recommendation": "Use /api/v2/langgraph/analyze-cry for StateGraph"
            }
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ====================================================================
# 나머지 엔드포인트 (기존 유지)
# ====================================================================

@router.post("/classify-only")
async def classify_cry_only(
    audio_file: UploadFile = File(...),
    infant_id: str = Form(...)
):
    """🔍 울음 분류만 수행"""
    temp_path = None
    try:
        classification_agent, _, _, _ = get_agents()
        
        temp_dir = Path("temp")
        temp_dir.mkdir(exist_ok=True)
        temp_path = temp_dir / f"{infant_id}_{datetime.now().timestamp()}.wav"
        
        with temp_path.open("wb") as buffer:
            content = await audio_file.read()
            buffer.write(content)
        
        result = await classification_agent.classify(str(temp_path))
        
        return JSONResponse(content={
            "success": True,
            "cry_type": result["cry_type"],
            "confidence": result["confidence"],
            "category_kr": result["category_kr"],
            "features": result["features"]
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


@router.post("/get-advice")
async def get_advice_only(
    cry_type: str = Form(...),
    confidence: float = Form(...),
    infant_age_months: int = Form(None)
):
    """💡 육아 조언만 생성"""
    try:
        _, advice_agent, _, _ = get_agents()
        
        result = await advice_agent.generate_advice(
            cry_type=cry_type,
            confidence=confidence,
            infant_age_months=infant_age_months
        )
        
        return JSONResponse(content={
            "success": True,
            "advice": result["advice"],
            "urgency_level": result["urgency_level"],
            "quick_actions": result["recommended_actions"]
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/workflow-status")
async def get_workflow_status():
    """📊 워크플로우 상태 확인"""
    return {
        "legacy_available": LEGACY_AVAILABLE,
        "langgraph_available": LANGGRAPH_AVAILABLE,
        "agents_available": AGENTS_AVAILABLE,
        "recommended_endpoint": "/api/v2/langgraph/analyze-cry" if LANGGRAPH_AVAILABLE else "/api/v2/analyze-cry",
        "versions": {
            "v1_legacy": {
                "endpoint": "/api/v2/analyze-cry",
                "engine": "sequential_pipeline",
                "available": LEGACY_AVAILABLE
            },
            "v2_langgraph": {
                "endpoint": "/api/v2/langgraph/analyze-cry",
                "engine": "StateGraph",
                "available": LANGGRAPH_AVAILABLE,
                "features": [
                    "conditional_edges",
                    "automatic_state_management",
                    "workflow_visualization",
                    "perfect_tracking"
                ]
            }
        },
        "agents": {
            "classification": "CryClassificationAgent",
            "advice": "ParentingAdviceAgent (GPT-4)",
            "music": "MusicRecommendationAgent",
            "notification": "NotificationAgent"
        }
    }


@router.get("/test")
async def test_system():
    """🧪 시스템 테스트"""
    try:
        classification_agent, advice_agent, music_agent, notification_agent = get_agents()
        
        return {
            "success": True,
            "message": "All systems operational",
            "langgraph_available": LANGGRAPH_AVAILABLE,
            "legacy_available": LEGACY_AVAILABLE,
            "agents": {
                "classification": str(type(classification_agent)),
                "advice": str(type(advice_agent)),
                "music": str(type(music_agent)),
                "notification": str(type(notification_agent))
            },
            "recommendation": "Use /api/v2/langgraph/analyze-cry for best results" if LANGGRAPH_AVAILABLE else "Install langgraph: pip install langgraph"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


if __name__ == "__main__":
    print("\n" + "="*60)
    print("📡 LangGraph Routes v2.0")
    print("="*60)
    print("\n🔥 NEW - Real LangGraph (StateGraph):")
    print("  POST /api/v2/langgraph/analyze-cry")
    print("  GET  /api/v2/langgraph/workflow-diagram")
    print("\n⚠️ LEGACY - Sequential Pipeline:")
    print("  POST /api/v2/analyze-cry")
    print("\n✅ Individual Agents:")
    print("  POST /api/v2/classify-only")
    print("  POST /api/v2/get-advice")
    print("\n✅ System:")
    print("  GET  /api/v2/workflow-status")
    print("  GET  /api/v2/test")
    print("\n" + "="*60 + "\n")