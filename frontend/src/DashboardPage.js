// src/DashboardPage.js (전체 코드 - 자동재생 한 번만 수정)
import React, { useState, useEffect, useRef } from 'react';
import { dashboardAPI, actionAPI } from './api';
import axios from 'axios'; // ✅ 추가
import { useAuth } from './AuthContext';
import MusicPlayer from './MusicPlayer';

function DashboardPage() {
  console.log('🚀🚀🚀 DashboardPage 컴포넌트 렌더링됨! 🚀🚀🚀');
  
  const { selectedInfant } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [showMusicPlayer, setShowMusicPlayer] = useState(false);
  const [currentMusicType, setCurrentMusicType] = useState(null);
  const [badges, setBadges] = useState([]); // ✅ 추가
  
  // ✅ 자동재생을 한 번만 하도록 추적
  const hasAutoPlayedRef = useRef(false);

  // ✅ 디버깅: selectedInfant 확인
  useEffect(() => {
    console.log('🔍 [Dashboard] selectedInfant:', selectedInfant);
  }, [selectedInfant]);

  // ✅ 디버깅: events 확인
  useEffect(() => {
    console.log('🔍 [Dashboard] events:', events);
    console.log('🔍 [Dashboard] events.length:', events.length);
  }, [events]);

  useEffect(() => {
    if (selectedInfant?.infantId) {
      console.log('✅ [Dashboard] infantId 확인됨, loadDashboard 호출');
      loadDashboard();
    } else {
      console.log('⚠️ [Dashboard] infantId 없음:', selectedInfant);
    }
  }, [selectedInfant?.infantId]);

  // ✅ 자동재생 로직 - 한 번만 실행
  useEffect(() => {
    if (events.length === 0) {
      console.log('ℹ️ [Dashboard] events가 비어있음, 자동재생 건너뜀');
      return;
    }
    
    // 이미 자동재생을 시도했다면 건너뜀
    if (hasAutoPlayedRef.current) {
      console.log('ℹ️ [Dashboard] 이미 자동재생 시도함, 건너뜀');
      return;
    }
    
    const musicPlayableEvent = events.find(
      e => e.isResolved !== 1 && ['tired', 'emotional'].includes(e.cryType)
    );
    
    console.log('🔍 [Dashboard] 음악 재생 가능한 이벤트:', musicPlayableEvent);
    
    if (musicPlayableEvent) {
      const timer = setTimeout(() => {
        console.log('🎵 [Dashboard] 음악 자동재생 시작 (한 번만)');
        setCurrentMusicType(musicPlayableEvent.cryType);
        setShowMusicPlayer(true);
        hasAutoPlayedRef.current = true; // 자동재생 완료 표시
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [events]); // showMusicPlayer 의존성 제거!

  const loadDashboard = async () => {
    console.log('📡 [Dashboard] loadDashboard 시작');
    
    if (!selectedInfant?.infantId) {
      console.log('❌ [Dashboard] infantId 없음');
      setError('아기 정보를 선택해주세요.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      
      console.log('📤 [Dashboard] API 호출 시작, infantId:', selectedInfant.infantId);
      const response = await dashboardAPI.getEvents(selectedInfant.infantId);
      
      console.log('📥 [Dashboard] API 응답 전체:', response);
      console.log('📥 [Dashboard] response.data:', response.data);
      console.log('📥 [Dashboard] response.data.events:', response.data.events);
      
      const eventsData = response.data.events || [];
      console.log('✅ [Dashboard] 설정할 events:', eventsData);
      
      setEvents(eventsData);

      // ✅ 뱃지 로드
      try {
        const badgeRes = await axios.get('/api/badges', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (badgeRes.data.success) {
          setBadges(badgeRes.data.badges);
        }
      } catch (bErr) {
        console.error('뱃지 로드 실패:', bErr);
      }
    } catch (err) {
      console.error('❌ [Dashboard] API 오류:', err);
      console.error('❌ [Dashboard] err.response:', err.response);
      console.error('❌ [Dashboard] err.response?.data:', err.response?.data);
      console.error('❌ [Dashboard] err.response?.status:', err.response?.status);
      
      let errorMessage = '대시보드를 불러오는데 실패했습니다.';
      
      if (err.response) {
        const status = err.response.status;
        const detail = err.response.data?.detail || err.response.data?.message;
        
        if (status === 404) {
          errorMessage = '데이터를 찾을 수 없습니다. 울음 분석을 먼저 진행해주세요.';
        } else if (status === 401) {
          errorMessage = '인증이 필요합니다. 다시 로그인해주세요.';
        } else if (status === 500) {
          errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
        } else if (detail) {
          errorMessage = `${errorMessage} (${detail})`;
        }
      } else if (err.request) {
        errorMessage = '서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.';
      } else {
        errorMessage = `오류: ${err.message}`;
      }
      
      console.log('❌ [Dashboard] 최종 에러 메시지:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log('🏁 [Dashboard] loadDashboard 완료');
    }
  };

  const handleActionSaved = () => {
    console.log('💾 [Dashboard] 조치 저장됨, 새로고침');
    loadDashboard();
  };

  const handlePlayMusic = (cryType) => {
    console.log('🎵 [Dashboard] 음악 재생 요청:', cryType);
    setCurrentMusicType(cryType);
    setShowMusicPlayer(true);
  };

  const handleCloseMusicPlayer = () => {
    console.log('🎵 [Dashboard] 음악 플레이어 닫기');
    setShowMusicPlayer(false);
  };

  const getCryTypeLabel = (cryType) => {
    const labelMap = {
      hungry: '배고픔',
      tired: '졸림',
      uncomfortable: '불편함',
      pain: '통증',
      emotional: '감정적',
    };
    return labelMap[cryType] || cryType;
  };

  const getMostCommonCryType = (eventsList) => {
    if (!eventsList || eventsList.length === 0) return '-';
    
    const counts = {};
    eventsList.forEach(e => {
      if (e.cryType) {
        counts[e.cryType] = (counts[e.cryType] || 0) + 1;
      }
    });
    
    const entries = Object.entries(counts);
    if (entries.length === 0) return '-';
    
    const max = entries.reduce((a, b) => (a[1] > b[1] ? a : b));
    return getCryTypeLabel(max[0]);
  };

  const stats = {
    totalEvents: events.length,
    resolvedEvents: events.filter(e => e.isResolved === 1).length,
    avgConfidence: events.length > 0 
      ? (events.reduce((sum, e) => sum + (e.confidence || 0), 0) / events.length * 100).toFixed(0)
      : 0,
    mostCommonType: getMostCommonCryType(events),
  };

  // ✅ 2단계 고도화: 원더위크(Wonder Weeks) 계산 로직
  const calculateWonderWeek = (birthDateString) => {
    if (!birthDateString) return null;
    
    const birthDate = new Date(birthDateString);
    const today = new Date();
    const diffTime = Math.abs(today - birthDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(diffDays / 7);
    
    // 주요 원더위크 주차 (5, 8, 12, 19, 26, 37, 46, 55, 64, 75)
    const wonderWeeks = [5, 8, 12, 19, 26, 37, 46, 55, 64, 75];
    const currentWonderWeek = wonderWeeks.find(w => Math.abs(w - weeks) <= 1);
    
    if (currentWonderWeek) {
      return {
        isWonderWeek: true,
        week: currentWonderWeek,
        message: `현재 생후 ${weeks}주차로, 제 ${wonderWeeks.indexOf(currentWonderWeek) + 1}의 도약기(원더위크) 기간일 수 있습니다. 이유 없이 보채거나 울 수 있으니 더 많이 안아주세요.`
      };
    }
    return { isWonderWeek: false, week: weeks };
  };

  const wonderWeekInfo = calculateWonderWeek(selectedInfant?.birthDate);

  console.log('🔍 [Dashboard] 렌더링 상태:', { loading, error, eventsCount: events.length, stats });

  if (loading) {
    console.log('⏳ [Dashboard] 로딩 중 표시');
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('❌ [Dashboard] 에러 표시:', error);
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          ⚠️ {error}
          <button onClick={loadDashboard} style={styles.retryButton}>
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  console.log('✅ [Dashboard] 정상 렌더링, events.length:', events.length);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>📊 울음 이벤트 대시보드</h1>
        <p style={styles.subtitle}>
          {selectedInfant?.name || '아기'}의 울음 분석 결과와 조치 기록
        </p>
      </div>

      {/* ✅ 원더위크 알림 배너 */}
      {wonderWeekInfo?.isWonderWeek && (
        <div style={{
          backgroundColor: '#e3f2fd', 
          padding: '16px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          borderLeft: '5px solid #1976d2',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{fontSize: '24px'}}>🌧️</span>
          <div>
            <h4 style={{margin: '0 0 4px 0', color: '#1565c0'}}>원더위크 주의 주간</h4>
            <p style={{margin: 0, fontSize: '14px', color: '#333'}}>
              {wonderWeekInfo.message}
            </p>
          </div>
        </div>
      )}

      {/* ✅ 뱃지 갤러리 UI 추가 */}
      {badges.length > 0 && (
        <div style={styles.badgeContainer}>
          <h3 style={styles.badgeTitle}>🏆 나의 육아 뱃지</h3>
          <div style={styles.badgeList}>
            {badges.map(b => (
              <div 
                key={b.BADGE_ID} 
                style={{
                  ...styles.badgeItem, 
                  opacity: b.IS_EARNED ? 1 : 0.4,
                  filter: b.IS_EARNED ? 'none' : 'grayscale(100%)'
                }}
                title={b.DESCRIPTION}
              >
                <div style={styles.badgeIcon}>{b.ICON_URL}</div>
                <div style={styles.badgeName}>{b.BADGE_NAME}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ✅ 디버깅: 현재 상태 표시 */}
      <div style={{ 
        padding: '16px', 
        backgroundColor: '#e3f2fd', 
        borderRadius: '8px', 
        marginBottom: '24px',
        fontSize: '14px',
        fontFamily: 'monospace'
      }}>
        <div>🔍 디버그 정보:</div>
        <div>- infantId: {selectedInfant?.infantId || 'null'}</div>
        <div>- events.length: {events.length}</div>
        <div>- loading: {loading.toString()}</div>
        <div>- error: {error || 'null'}</div>
      </div>

      {events.length > 0 && (
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>📊</div>
            <div style={styles.statValue}>{stats.totalEvents}</div>
            <div style={styles.statLabel}>전체 이벤트</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>✅</div>
            <div style={styles.statValue}>{stats.resolvedEvents}</div>
            <div style={styles.statLabel}>해결됨</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🎯</div>
            <div style={styles.statValue}>{stats.avgConfidence}%</div>
            <div style={styles.statLabel}>평균 신뢰도</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statIcon}>🔥</div>
            <div style={styles.statValue}>{stats.mostCommonType}</div>
            <div style={styles.statLabel}>가장 많은 울음</div>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📭</div>
          <h3>아직 울음 이벤트가 없습니다</h3>
          <p>울음 업로드 페이지에서 아기의 울음을 분석해보세요</p>
          <button 
            onClick={loadDashboard} 
            style={{
              marginTop: '16px',
              padding: '12px 24px',
              backgroundColor: '#1976d2',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
            }}
          >
            🔄 새로고침
          </button>
        </div>
      ) : (
        <div style={styles.eventsGrid}>
          {events.map((event) => (
            <EventCard
              key={event.eventId}
              event={event}
              onActionSaved={handleActionSaved}
              onPlayMusic={handlePlayMusic}
            />
          ))}
        </div>
      )}

      {showMusicPlayer && currentMusicType && (
        <MusicPlayer
          cryType={currentMusicType}
          onClose={handleCloseMusicPlayer}
        />
      )}
    </div>
  );
}

// ✅ EventCard 컴포넌트
function EventCard({ event, onActionSaved, onPlayMusic }) {
  const [showActionForm, setShowActionForm] = useState(false);

  const canPlayMusic = ['tired', 'emotional'].includes(event.cryType);

  const getCryTypeEmoji = (cryType) => {
    const emojiMap = {
      hungry: '🍼',
      tired: '😴',
      uncomfortable: '😣',
      pain: '😭',
      emotional: '🤗',
    };
    return emojiMap[cryType] || '👶';
  };

  const getCryTypeLabel = (cryType) => {
    const labelMap = {
      hungry: '배고픔',
      tired: '졸림',
      uncomfortable: '불편함',
      pain: '통증',
      emotional: '감정적',
    };
    return labelMap[cryType] || cryType;
  };

  const getCryTypeDescription = (cryType) => {
    const descriptionMap = {
      hungry: '아기가 배고픔을 느끼고 있습니다. 마지막 수유 시간을 확인하고 분유나 모유를 제공해주세요.',
      tired: '아기가 피곤하고 졸려합니다. 조용하고 어두운 환경에서 재워주시고, 자장가를 들려주면 도움이 됩니다.',
      uncomfortable: '아기가 불편함을 느끼고 있습니다. 기저귀 상태, 옷의 착용감, 실내 온도를 확인해주세요.',
      pain: '아기가 통증을 느끼고 있을 수 있습니다. 배앓이, 가스, 또는 다른 불편함이 있는지 확인하고, 필요시 소아과 상담을 권장합니다.',
      emotional: '아기가 감정적으로 위로가 필요합니다. 안아주고 부드럽게 말을 걸어주거나, 진정 음악을 들려주세요.',
    };
    return descriptionMap[cryType] || '아기의 울음 원인을 파악하고 적절한 조치를 취해주세요.';
  };

  const getSeverityColor = (severity) => {
    const colorMap = {
      High: '#f44336',
      Medium: '#ff9800',
      Low: '#4caf50',
    };
    return colorMap[severity] || '#757575';
  };

  return (
    <div style={styles.eventCard}>
      <div style={styles.eventHeader}>
        <div style={styles.eventType}>
          <span style={styles.eventEmoji}>{getCryTypeEmoji(event.cryType)}</span>
          <span style={styles.eventTypeText}>{getCryTypeLabel(event.cryType)}</span>
        </div>
        <div style={styles.eventMeta}>
          <span style={{
            ...styles.severityBadge,
            backgroundColor: getSeverityColor(event.severity),
          }}>
            {event.severity}
          </span>
          <span style={styles.confidence}>
            신뢰도: {(event.confidence * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      <div style={styles.eventTime}>
        {new Date(event.eventTime).toLocaleString('ko-KR')}
      </div>

      <div style={styles.cryDescription}>
        {getCryTypeDescription(event.cryType)}
      </div>

      {canPlayMusic && (
        <div style={styles.musicSection}>
          <button
            onClick={() => onPlayMusic(event.cryType)}
            style={styles.musicButton}
          >
            🎵 진정 음악 재생
          </button>
        </div>
      )}

      {event.notification && (
        <div style={styles.recommendation}>
          <div style={styles.recommendationHeader}>
            <span style={styles.recommendationIcon}>💡</span>
            <span style={styles.recommendationTitle}>AI 추천 조치</span>
          </div>
          <div style={styles.recommendationText}>
            {event.notification.actionText}
          </div>
        </div>
      )}

      {event.actions && event.actions.length > 0 && (
        <div style={styles.actionsSection}>
          <div style={styles.actionsSectionHeader}>
            📝 보호자 조치 기록 ({event.actions.length})
          </div>
          {event.actions.map((action) => (
            <ActionItem
              key={action.actionId}
              action={action}
              eventId={event.eventId}
              onActionSaved={onActionSaved}
            />
          ))}
        </div>
      )}

      <div style={styles.cardFooter}>
        {!showActionForm ? (
          <button
            onClick={() => setShowActionForm(true)}
            style={styles.addActionButton}
          >
            ➕ 조치 기록 추가
          </button>
        ) : (
          <ActionForm
            eventId={event.eventId}
            onCancel={() => setShowActionForm(false)}
            onSaved={() => {
              setShowActionForm(false);
              onActionSaved();
            }}
          />
        )}
      </div>
    </div>
  );
}

// 조치 아이템 컴포넌트
function ActionItem({ action, eventId, onActionSaved }) {
  const [isEditing, setIsEditing] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('이 조치 기록을 삭제하시겠습니까?')) return;

    try {
      await actionAPI.delete(action.actionId);
      onActionSaved();
    } catch (err) {
      console.error('Error deleting action:', err);
      alert('조치 삭제에 실패했습니다.');
    }
  };

  const getResultEmoji = (result) => {
    const emojiMap = {
      success: '✅',
      partial: '⚠️',
      fail: '❌',
    };
    return emojiMap[result] || '📝';
  };

  const getResultLabel = (result) => {
    const labelMap = {
      success: '성공',
      partial: '부분 성공',
      fail: '실패',
    };
    return labelMap[result] || result;
  };

  if (isEditing) {
    return (
      <ActionForm
        eventId={eventId}
        existingAction={action}
        onCancel={() => setIsEditing(false)}
        onSaved={() => {
          setIsEditing(false);
          onActionSaved();
        }}
      />
    );
  }

  return (
    <div style={styles.actionItem}>
      <div style={styles.actionContent}>
        <div style={styles.actionHeader}>
          <span style={styles.actionResult}>
            {getResultEmoji(action.result)} {getResultLabel(action.result)}
          </span>
          <span style={styles.actionTime}>
            {new Date(action.executedAt).toLocaleString('ko-KR')}
          </span>
        </div>
        <div style={styles.actionDetail}>{action.actionDetail}</div>
      </div>
      <div style={styles.actionButtons}>
        <button
          onClick={() => setIsEditing(true)}
          style={styles.editButton}
        >
          ✏️
        </button>
        <button
          onClick={handleDelete}
          style={styles.deleteButton}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

// 조치 입력 폼 컴포넌트
function ActionForm({ eventId, existingAction, onCancel, onSaved }) {
  const { selectedInfant, user } = useAuth();
  const [formData, setFormData] = useState({
    actionDetail: existingAction?.actionDetail || '',
    result: existingAction?.result || 'success',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (existingAction) {
        await actionAPI.update(existingAction.actionId, formData);
      } else {
        await actionAPI.record({
          eventId,
          infantId: selectedInfant.infantId,
          guardianId: user.guardianId,
          actionDetail: formData.actionDetail,
          result: formData.result,
        });
      }
      onSaved();
    } catch (err) {
      console.error('Error saving action:', err);
      setError('조치 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.actionForm}>
      <textarea
        value={formData.actionDetail}
        onChange={(e) => setFormData({ ...formData, actionDetail: e.target.value })}
        placeholder="어떤 조치를 취했나요? (예: 분유를 먹였습니다)"
        required
        style={styles.textarea}
        disabled={loading}
        rows={3}
      />

      <div style={styles.resultSelector}>
        <label style={styles.resultLabel}>결과:</label>
        <select
          value={formData.result}
          onChange={(e) => setFormData({ ...formData, result: e.target.value })}
          style={styles.select}
          disabled={loading}
        >
          <option value="success">✅ 성공</option>
          <option value="partial">⚠️ 부분 성공</option>
          <option value="fail">❌ 실패</option>
        </select>
      </div>

      {error && <div style={styles.formError}>{error}</div>}

      <div style={styles.formButtons}>
        <button
          type="button"
          onClick={onCancel}
          style={styles.cancelButton}
          disabled={loading}
        >
          취소
        </button>
        <button
          type="submit"
          style={styles.saveButton}
          disabled={loading}
        >
          {loading ? '저장 중...' : existingAction ? '수정' : '저장'}
        </button>
      </div>
    </form>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '32px',
    margin: '0 0 8px 0',
    color: '#333',
  },
  subtitle: {
    margin: 0,
    color: '#666',
    fontSize: '16px',
  },
  loading: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '5px solid #f3f3f3',
    borderTop: '5px solid #1976d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px',
  },
  error: {
    padding: '20px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '12px',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: '16px',
    padding: '10px 20px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
    marginBottom: '32px',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
    transition: 'transform 0.2s',
  },
  statIcon: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  statValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#1976d2',
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '13px',
    color: '#666',
    fontWeight: '500',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  eventsGrid: {
    display: 'grid',
    gap: '24px',
  },
  eventCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    transition: 'box-shadow 0.2s',
  },
  eventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  eventType: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  eventEmoji: {
    fontSize: '32px',
  },
  eventTypeText: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#333',
  },
  eventMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  severityBadge: {
    padding: '6px 12px',
    borderRadius: '12px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
  },
  confidence: {
    fontSize: '14px',
    color: '#666',
  },
  eventTime: {
    fontSize: '14px',
    color: '#999',
    marginBottom: '12px',
  },
  cryDescription: {
    fontSize: '14px',
    color: '#555',
    lineHeight: '1.6',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    marginBottom: '16px',
    border: '1px solid #e0e0e0',
  },
  musicSection: {
    marginBottom: '16px',
    padding: '16px',
    backgroundColor: '#f3e5f5',
    borderRadius: '12px',
    border: '1px solid #ce93d8',
  },
  musicButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#9c27b0',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
    transition: 'background-color 0.2s',
  },
  recommendation: {
    backgroundColor: '#e3f2fd',
    padding: '16px',
    borderRadius: '12px',
    marginBottom: '16px',
    border: '1px solid #90caf9',
  },
  recommendationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  recommendationIcon: {
    fontSize: '20px',
  },
  recommendationTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1976d2',
  },
  recommendationText: {
    fontSize: '15px',
    color: '#333',
    lineHeight: '1.6',
  },
  actionsSection: {
    marginBottom: '16px',
  },
  actionsSectionHeader: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '12px',
  },
  actionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  actionContent: {
    flex: 1,
  },
  actionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '6px',
  },
  actionResult: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
  },
  actionTime: {
    fontSize: '12px',
    color: '#999',
  },
  actionDetail: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.5',
  },
  actionButtons: {
    display: 'flex',
    gap: '4px',
    marginLeft: '12px',
  },
  editButton: {
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  deleteButton: {
    padding: '6px 10px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  cardFooter: {
    borderTop: '1px solid #e0e0e0',
    paddingTop: '16px',
  },
  addActionButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  actionForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  textarea: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
  },
  resultSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  resultLabel: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  select: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  formError: {
    padding: '10px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '6px',
    fontSize: '13px',
  },
  formButtons: {
    display: 'flex',
    gap: '8px',
  },
  cancelButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#f5f5f5',
    color: '#666',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  saveButton: {
    flex: 1,
    padding: '10px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  // ✅ 뱃지 스타일
  badgeContainer: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  badgeTitle: {
    margin: '0 0 16px 0',
    fontSize: '18px',
    color: '#333',
  },
  badgeList: {
    display: 'flex',
    gap: '16px',
    overflowX: 'auto',
    paddingBottom: '10px',
  },
  badgeItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    minWidth: '80px',
    transition: 'transform 0.2s',
  },
  badgeIcon: {
    fontSize: '40px',
    background: '#f8f9fa',
    width: '60px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)',
  },
  badgeName: {
    fontSize: '12px',
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
};

export default DashboardPage;
