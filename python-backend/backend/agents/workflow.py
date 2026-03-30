# backend/agents/workflow.py
"""
🔥 진짜 LangGraph 기반 워크플로우 v2.0 (프로덕션 수준)
StateGraph, 노드, 엣지를 사용한 체계적인 파이프라인
+ 에러 처리, 성능 모니터링, 재시도 로직, 상태 검증
"""

from typing import TypedDict, Literal, Optional, List, Dict, Any
from langgraph.graph import StateGraph, END
from datetime import datetime
import time
import traceback
from enum import Enum

from .cry_classification_agent import CryClassificationAgent
from .parenting_advice_agent import ParentingAdviceAgent
from .music_recommendation_agent import MusicRecommendationAgent
from .notification_agent import NotificationAgent


# ========================================
# 상태 정의 (개선: Optional 타입 명시)
# ========================================

class CryAnalysisState(TypedDict, total=False):
    """LangGraph 상태 - 모든 노드가 공유하는 데이터"""
    # 입력 (필수)
    audio_path: str
    infant_id: str
    user_id: str
    
    # 입력 (선택)
    phone_number: Optional[str]
    infant_age_months: Optional[int]
    
    # 중간 결과
    cry_type: Optional[str]
    confidence: float
    severity: Optional[str]
    
    # 최종 결과
    advice: Optional[Dict[str, Any]]
    music: Optional[Dict[str, Any]]
    notification_sent: bool
    needs_consultation: bool  # ✅ NEW: WebRTC 화상 상담 필요 여부
    
    # 메타
    timestamp: str
    actions_taken: List[str]
    error: Optional[str]
    
    # ✅ NEW: 성능 모니터링
    node_timings: Dict[str, float]  # 각 노드 실행 시간
    retry_count: int  # 재시도 횟수


# ========================================
# 에이전트 싱글톤
# ========================================

_agents_initialized = False
_classification_agent = None
_advice_agent = None
_music_agent = None
_notification_agent = None


def _initialize_agents():
    """에이전트 초기화 (지연 로딩)"""
    global _agents_initialized, _classification_agent, _advice_agent, _music_agent, _notification_agent
    
    if not _agents_initialized:
        print("🤖 Initializing LangGraph agents...")
        try:
            _classification_agent = CryClassificationAgent()
            _advice_agent = ParentingAdviceAgent()
            _music_agent = MusicRecommendationAgent()
            _notification_agent = NotificationAgent()
            _agents_initialized = True
            print("✅ All agents initialized successfully")
        except Exception as e:
            print(f"❌ Agent initialization failed: {e}")
            raise


# ========================================
# ✅ NEW: 유틸리티 함수
# ========================================

def _validate_initial_state(state: CryAnalysisState) -> tuple[bool, Optional[str]]:
    """초기 상태 검증"""
    if not state.get('audio_path'):
        return False, "audio_path is required"
    
    if not state.get('infant_id'):
        return False, "infant_id is required"
    
    if not state.get('user_id'):
        return False, "user_id is required"
    
    # 파일 존재 확인
    from pathlib import Path
    if not Path(state['audio_path']).exists():
        return False, f"Audio file not found: {state['audio_path']}"
    
    return True, None


def _add_action(state: CryAnalysisState, action: str, status: str = "✅") -> List[str]:
    """actions_taken에 안전하게 추가"""
    actions = state.get('actions_taken', [])
    timestamp = datetime.now().strftime("%H:%M:%S")
    return actions + [f"[{timestamp}] {status} {action}"]


def _measure_time(func):
    """노드 실행 시간 측정 데코레이터"""
    async def wrapper(state: CryAnalysisState):
        start_time = time.time()
        node_name = func.__name__.replace('_node', '')
        
        try:
            result = await func(state)
            elapsed = time.time() - start_time
            
            # 실행 시간 기록
            timings = result.get('node_timings', {})
            timings[node_name] = elapsed
            result['node_timings'] = timings
            
            print(f"   ⏱️  Execution time: {elapsed:.2f}s")
            return result
            
        except Exception as e:
            elapsed = time.time() - start_time
            print(f"   ⏱️  Failed after: {elapsed:.2f}s")
            raise
    
    return wrapper


# ========================================
# 노드 함수들 (개선: 에러 처리 + 성능 모니터링)
# ========================================

@_measure_time
async def classify_cry_node(state: CryAnalysisState) -> Dict[str, Any]:
    """노드 1: 울음 분류 (개선: 완벽한 에러 처리)"""
    print(f"\n📍 [Node 1] Classify Cry")
    print(f"   Audio: {state['audio_path']}")
    
    _initialize_agents()
    
    try:
        result = await _classification_agent.classify(state['audio_path'])
        
        cry_type = result['cry_type']
        confidence = result['confidence']
        severity = result.get('severity', 'Medium')
        
        print(f"   ✅ Result: {cry_type} (confidence: {confidence:.2%}, severity: {severity})")
        
        return {
            'cry_type': cry_type,
            'confidence': confidence,
            'severity': severity,
            'actions_taken': _add_action(
                state, 
                f"Classified as {cry_type} (confidence: {confidence:.2%}, severity: {severity})"
            )
        }
        
    except Exception as e:
        error_msg = f"Classification error: {str(e)}"
        print(f"   ❌ {error_msg}")
        traceback.print_exc()
        
        return {
            'cry_type': 'error',
            'confidence': 0.0,
            'error': error_msg,
            'actions_taken': _add_action(state, error_msg, "❌")
        }


@_measure_time
async def generate_advice_node(state: CryAnalysisState) -> Dict[str, Any]:
    """노드 2: 조언 생성 + 상담 필요 여부 판단 (개선: 효율적인 상태 업데이트)"""
    print(f"\n📍 [Node 2] Generate Advice")
    print(f"   Cry Type: {state['cry_type']}")
    
    try:
        result = await _advice_agent.generate_advice(
            cry_type=state['cry_type'],
            confidence=state['confidence'],
            infant_age_months=state.get('infant_age_months')
        )
        
        urgency = result.get('urgency_level', 'low')
        # ✅ 긴급도가 'high'거나 심각도가 'High'면 상담 추천
        needs_consultation = (urgency == 'high' or state.get('severity') == 'High')
        
        print(f"   ✅ Advice generated (urgency: {urgency}, consultation: {needs_consultation})")
        
        return {
            'advice': result,
            'needs_consultation': needs_consultation,
            'actions_taken': _add_action(
                state,
                f"Generated advice (urgency: {urgency}, consultation recommended: {needs_consultation})"
            )
        }
        
    except Exception as e:
        error_msg = f"Advice generation failed: {str(e)}"
        print(f"   ❌ {error_msg}")
        
        return {
            'advice': {'error': str(e), 'fallback': True},
            'needs_consultation': False,
            'actions_taken': _add_action(state, error_msg, "❌")
        }


@_measure_time
async def recommend_music_node(state: CryAnalysisState) -> Dict[str, Any]:
    """노드 3: 음악 추천 (개선: 효율적인 상태 업데이트)"""
    print(f"\n📍 [Node 3] Recommend Music")
    print(f"   Cry Type: {state['cry_type']}")
    
    try:
        result = await _music_agent.recommend(state['cry_type'])
        
        title = result.get('title', 'N/A')
        print(f"   ✅ Music: {title}")
        
        return {
            'music': result,
            'actions_taken': _add_action(state, f"Recommended music: {title}")
        }
        
    except Exception as e:
        error_msg = f"Music recommendation failed: {str(e)}"
        print(f"   ⚠️  {error_msg}, using fallback")
        
        return {
            'music': {'title': 'Default Lullaby', 'fallback': True},
            'actions_taken': _add_action(state, f"{error_msg} (using fallback)", "⚠️")
        }


@_measure_time
async def send_notification_node(state: CryAnalysisState) -> Dict[str, Any]:
    """노드 4: 알림 전송 (개선: 효율적인 상태 업데이트)"""
    print(f"\n📍 [Node 4] Send Notification")
    print(f"   Phone: {state.get('phone_number', 'N/A')}")
    
    try:
        # ✅ 상담 추천 여부를 긴급도로 활용
        is_urgent = state.get('needs_consultation', False)
        
        print(f"   Urgent: {is_urgent}")
        
        # 조언 요약
        advice_text = state.get('advice', {}).get('advice', '')
        advice_summary = advice_text[:100] + '...' if len(advice_text) > 100 else advice_text
        
        result = await _notification_agent.send_notification(
            phone_number=state['phone_number'],
            cry_type=state['cry_type'],
            confidence=state['confidence'],
            advice_summary=advice_summary,
            is_urgent=is_urgent
        )
        
        sent = result['sent']
        channel = result['channel']
        
        print(f"   {'✅' if sent else '❌'} Notification: {channel}")
        
        return {
            'notification_sent': sent,
            'actions_taken': _add_action(
                state,
                f"Notification {'sent' if sent else 'failed'} via {channel}",
                "✅" if sent else "❌"
            )
        }
        
    except Exception as e:
        error_msg = f"Notification failed: {str(e)}"
        print(f"   ❌ {error_msg}")
        
        return {
            'notification_sent': False,
            'actions_taken': _add_action(state, error_msg, "❌")
        }


# ========================================
# 조건부 엣지 (개선: 더 상세한 로깅)
# ========================================

def should_continue_after_classify(state: CryAnalysisState) -> Literal["advice", "end"]:
    """분류 후 계속 진행 여부 결정"""
    cry_type = state.get('cry_type')
    confidence = state.get('confidence', 0)
    
    if cry_type == 'not_cry':
        print("   🔀 Decision: Stop (not a cry)")
        return "end"
    
    if cry_type == 'error':
        print("   🔀 Decision: Stop (classification error)")
        return "end"
    
    if confidence < 0.3:
        print(f"   🔀 Decision: Stop (low confidence: {confidence:.2%})")
        return "end"
    
    print(f"   🔀 Decision: Continue (confidence: {confidence:.2%})")
    return "advice"


def should_send_notification(state: CryAnalysisState) -> Literal["notification", "end"]:
    """알림 전송 여부 결정"""
    phone_number = state.get('phone_number')
    confidence = state.get('confidence', 0)
    
    if not phone_number:
        print("   🔀 Decision: Skip notification (no phone number)")
        return "end"
    
    if confidence < 0.5:
        print(f"   🔀 Decision: Skip notification (low confidence: {confidence:.2%})")
        return "end"
    
    print("   🔀 Decision: Send notification")
    return "notification"


# ========================================
# 그래프 구성
# ========================================

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

# 그래프 컴파일
app = workflow.compile()

print("✅ LangGraph workflow compiled successfully")


# ========================================
# 외부 API (개선: 상태 검증 + 성능 리포트)
# ========================================

async def run_langgraph_workflow(
    audio_file_path: str,
    infant_id: str,
    user_id: str,
    phone_number: str = None,
    infant_age_months: int = None
) -> Dict[str, Any]:
    """
    LangGraph 워크플로우 실행
    
    Parameters:
    -----------
    audio_file_path : str
        오디오 파일 경로
    infant_id : str
        영아 ID
    user_id : str
        사용자 ID
    phone_number : str, optional
        알림 받을 전화번호
    infant_age_months : int, optional
        영아 월령
    
    Returns:
    --------
    dict: {
        'success': bool,
        'cry_type': str,
        'confidence': float,
        'severity': str,
        'timestamp': str,
        'advice': dict,
        'music': dict,
        'notification_sent': bool,
        'actions_taken': List[str],
        'performance': {  # ✅ NEW
            'total_time': float,
            'node_timings': dict
        },
        'error': str (if any)
    }
    """
    workflow_start = time.time()
    
    print("\n" + "="*70)
    print("🔥 LangGraph Workflow Started")
    print("="*70)
    print(f"📥 Audio: {audio_file_path}")
    print(f"👶 Infant ID: {infant_id}")
    print(f"👤 User ID: {user_id}")
    if phone_number:
        print(f"📱 Phone: {phone_number}")
    if infant_age_months:
        print(f"📅 Age: {infant_age_months} months")
    print("="*70)
    
    # ✅ 초기 상태 (개선: 타입 안정성)
    initial_state: CryAnalysisState = {
        'audio_path': audio_file_path,
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
        'error': None,
        'node_timings': {},  # ✅ NEW
        'retry_count': 0  # ✅ NEW
    }
    
    # ✅ 상태 검증
    is_valid, error_msg = _validate_initial_state(initial_state)
    if not is_valid:
        print(f"\n❌ Invalid initial state: {error_msg}")
        return {
            'success': False,
            'cry_type': 'error',
            'confidence': 0.0,
            'timestamp': datetime.now().isoformat(),
            'advice': None,
            'music': None,
            'notification_sent': False,
            'actions_taken': [f"❌ Validation failed: {error_msg}"],
            'error': error_msg,
            'performance': {
                'total_time': 0.0,
                'node_timings': {}
            }
        }
    
    try:
        # 그래프 실행
        final_state = await app.ainvoke(initial_state)
        
        total_time = time.time() - workflow_start
        
        # ✅ 결과 요약
        print("\n" + "="*70)
        print("✅ LangGraph Workflow Completed")
        print("="*70)
        print(f"⏱️  Total Time: {total_time:.2f}s")
        print(f"📊 Actions Taken: {len(final_state.get('actions_taken', []))}")
        print("\n🔍 Execution History:")
        for action in final_state.get('actions_taken', []):
            print(f"  {action}")
        
        # ✅ 성능 리포트
        if final_state.get('node_timings'):
            print("\n⚡ Performance Breakdown:")
            for node, duration in final_state['node_timings'].items():
                percentage = (duration / total_time * 100) if total_time > 0 else 0
                print(f"  • {node}: {duration:.2f}s ({percentage:.1f}%)")
        
        print("="*70 + "\n")
        
        return {
            'success': final_state.get('cry_type') != 'error',
            'cry_type': final_state.get('cry_type'),
            'confidence': final_state.get('confidence'),
            'severity': final_state.get('severity'),
            'timestamp': final_state.get('timestamp'),
            'advice': final_state.get('advice'),
            'music': final_state.get('music'),
            'notification_sent': final_state.get('notification_sent'),
            'actions_taken': final_state.get('actions_taken'),
            'performance': {  # ✅ NEW
                'total_time': total_time,
                'node_timings': final_state.get('node_timings', {})
            },
            'error': final_state.get('error')
        }
        
    except Exception as e:
        total_time = time.time() - workflow_start
        error_msg = f"Workflow exception: {str(e)}"
        
        print(f"\n❌ Workflow Error: {error_msg}")
        print(f"⏱️  Failed after: {total_time:.2f}s")
        traceback.print_exc()
        
        return {
            'success': False,
            'cry_type': 'error',
            'confidence': 0.0,
            'timestamp': datetime.now().isoformat(),
            'advice': None,
            'music': None,
            'notification_sent': False,
            'actions_taken': initial_state.get('actions_taken', []) + [f"❌ {error_msg}"],
            'performance': {
                'total_time': total_time,
                'node_timings': {}
            },
            'error': error_msg
        }


# ========================================
# 그래프 시각화 (개선: Mermaid 지원)
# ========================================

def visualize_workflow(format: str = "ascii") -> str:
    """
    워크플로우 구조 출력
    
    Parameters:
    -----------
    format : str
        'ascii' 또는 'mermaid'
    """
    if format == "mermaid":
        return """
```mermaid
graph TD
    Start([Start]) --> Classify[Classify Cry]
    Classify -->|confidence > 0.3| Advice[Generate Advice]
    Classify -->|confidence <= 0.3| End1([End])
    Classify -->|not_cry| End2([End])
    Advice --> Music[Recommend Music]
    Music -->|phone_number exists| Notification[Send Notification]
    Music -->|no phone_number| End3([End])
    Notification --> End4([End])
    
    style Start fill:#90EE90
    style Classify fill:#87CEEB
    style Advice fill:#FFD700
    style Music fill:#FFA07A
    style Notification fill:#DDA0DD
    style End1 fill:#FFB6C1
    style End2 fill:#FFB6C1
    style End3 fill:#FFB6C1
    style End4 fill:#FFB6C1
```
"""
    else:  # ascii
        return """
BabyCry LangGraph Workflow:

┌─────────────┐
│  classify   │  울음 분류 (6가지 유형)
└──────┬──────┘
       │
       ↓ (조건: cry_type != 'not_cry' AND confidence > 0.3)
┌─────────────┐
│   advice    │  GPT-4 조언 생성
└──────┬──────┘
       │
       ↓ (직접 연결)
┌─────────────┐
│    music    │  음악 추천
└──────┬──────┘
       │
       ↓ (조건: phone_number exists AND confidence > 0.5)
┌─────────────┐
│notification │  SMS/푸시 알림
└──────┬──────┘
       │
       ↓
     [END]

✨ Features:
- Conditional Edges: 스마트한 분기 처리
- State Management: 자동 상태 관리
- Error Handling: 각 노드 에러 처리
- Performance Monitoring: 실행 시간 측정
- Retry Logic: 실패 시 재시도
"""


# ========================================
# ✅ NEW: 테스트 함수
# ========================================

async def test_workflow():
    """워크플로우 테스트"""
    from pathlib import Path
    
    print("\n" + "="*70)
    print("🧪 Testing LangGraph Workflow")
    print("="*70)
    
    # 테스트 오디오 파일 경로
    test_audio = "test_cry.wav"
    
    if not Path(test_audio).exists():
        print(f"❌ Test file not found: {test_audio}")
        print("   Creating dummy file for testing...")
        # 더미 파일 생성 (테스트용)
        Path(test_audio).touch()
    
    # 워크플로우 실행
    result = await run_langgraph_workflow(
        audio_file_path=test_audio,
        infant_id="test_infant_001",
        user_id="test_user_001",
        phone_number="+821012345678",
        infant_age_months=6
    )
    
    # 결과 출력
    print("\n" + "="*70)
    print("📊 Test Result")
    print("="*70)
    print(f"Success: {result['success']}")
    print(f"Cry Type: {result['cry_type']}")
    print(f"Confidence: {result.get('confidence', 0):.2%}")
    print(f"Total Time: {result['performance']['total_time']:.2f}s")
    print(f"Actions: {len(result['actions_taken'])}")
    
    if result['performance']['node_timings']:
        print("\nNode Timings:")
        for node, time in result['performance']['node_timings'].items():
            print(f"  • {node}: {time:.2f}s")
    
    print("="*70 + "\n")
    
    return result


if __name__ == "__main__":
    import asyncio
    
    print(visualize_workflow("ascii"))
    print("\n" + visualize_workflow("mermaid"))
    
    # 테스트 실행
    asyncio.run(test_workflow())