import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client'; // ✅ Socket.io 추가
import './DoctorDashboard.css';

function DoctorDashboard() {
  const navigate = useNavigate();
  const socketRef = useRef(null); // ✅ 소켓 참조
  
  // 세션 관련 상태
  const [activeSessions, setActiveSessions] = useState([]);
  const [completedSessions, setCompletedSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [doctorInfo, setDoctorInfo] = useState(null);

  // ✅ 실시간 호출 알림 상태
  const [incomingCall, setIncomingCall] = useState(null);

  // ✅ 가용성 토글
  const [isAvailable, setIsAvailable] = useState(true);

  // ✅ 권한 모달 상태
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('checking'); // 'checking', 'granted', 'denied'
  const [permissionError, setPermissionError] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    // 의사 권한 확인
    const role = localStorage.getItem('role');
    const userId = localStorage.getItem('userId');
    
    if (role !== 'doctor') {
      alert('의사 권한이 필요합니다.');
      navigate('/');
      return;
    }

    fetchDoctorInfo();
    fetchSessions();

    // ✅ Socket.io 연결 및 실시간 호출 수신 설정
    socketRef.current = io('http://localhost:4000', {
      reconnection: true,
      reconnectionAttempts: 5
    });

    socketRef.current.emit('register', userId);

    socketRef.current.on('call-incoming', (data) => {
      console.log('📱 실시간 호출 수신:', data);
      // 알림 사운드 재생 (선택)
      try {
        const audio = new Audio('/music/notification.mp3');
        audio.play().catch(() => {});
      } catch (e) {}
      
      setIncomingCall(data);
    });

    socketRef.current.on('call-cancelled', (data) => {
      if (incomingCall?.sessionId === data.sessionId) {
        setIncomingCall(null);
        alert('환자가 통화를 취소했습니다.');
      }
    });

    // 주기적 새로고침 (30초마다)
    const interval = setInterval(fetchSessions, 30000);
    
    return () => {
      clearInterval(interval);
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [navigate, incomingCall]);

  const fetchDoctorInfo = async () => {
    try {
      const name = localStorage.getItem('username');
      const specialty = localStorage.getItem('specialty');
      const doctorId = localStorage.getItem('doctorId');

      setDoctorInfo({ name, specialty, doctorId });

      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:4000/api/videocall/doctor/${doctorId}/availability`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setIsAvailable(response.data.isAvailable);
      }
    } catch (err) {
      console.error('❌ 의사 정보 조회 실패:', err);
    }
  };

  const fetchSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        'http://localhost:4000/api/videocall/doctor/sessions',
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        const sessions = response.data.sessions;
        const active = sessions.filter(
          s => s.STATUS === 'SCHEDULED' || s.STATUS === 'ACTIVE'
        );
        const completed = sessions.filter(
          s => s.STATUS === 'COMPLETED' || s.STATUS === 'CANCELLED'
        );

        setActiveSessions(active);
        setCompletedSessions(completed);
      }
    } catch (err) {
      console.error('❌ 세션 조회 실패:', err);
      setError('세션 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCall = () => {
    if (incomingCall) {
      handleJoinSession(incomingCall.sessionId);
      setIncomingCall(null);
    }
  };

  const handleRejectCall = () => {
    setIncomingCall(null);
    // 필요 시 백엔드에 거절 알림 전송 가능
  };

  // ✅ 가용성 토글 핸들러
  const handleAvailabilityToggle = async () => {
    try {
      const token = localStorage.getItem('token');
      const doctorId = localStorage.getItem('doctorId');
      const newAvailability = !isAvailable;

      const response = await axios.put(
        `http://localhost:4000/api/videocall/doctor/${doctorId}/availability`,
        { isAvailable: newAvailability },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setIsAvailable(newAvailability);
        console.log(`✅ 가용성 변경: ${newAvailability ? '가능' : '불가능'}`);
      }
    } catch (err) {
      console.error('❌ 가용성 변경 실패:', err);
      alert('가용성 변경에 실패했습니다.');
    }
  };

  // ✅ 권한 체크 및 세션 참가
  const handleJoinSession = async (sessionId) => {
    setSelectedSessionId(sessionId);
    setShowPermissionModal(true);
    setPermissionStatus('checking');
    setPermissionError(null);

    try {
      console.log('🎤 미디어 권한 확인 중...');

      // 미디어 장치 확인
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('이 브라우저는 화상 통화를 지원하지 않습니다.');
      }

      // 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ 미디어 권한 허용됨');

      // 스트림 중지 (실제 통화방에서 다시 시작)
      stream.getTracks().forEach(track => track.stop());

      setPermissionStatus('granted');

      // 2초 후 통화방 이동
      setTimeout(() => {
        setShowPermissionModal(false);
        navigate(`/video-call/${sessionId}`);
      }, 2000);

    } catch (error) {
      console.error('❌ 미디어 권한 거부:', error);

      let errorMessage = '카메라/마이크 접근 권한이 필요합니다.';
      let errorType = 'denied';

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = '카메라와 마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = '카메라 또는 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.';
        errorType = 'no-devices';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = '카메라 또는 마이크가 이미 다른 프로그램에서 사용 중입니다.';
        errorType = 'in-use';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setPermissionError({ type: errorType, message: errorMessage });
      setPermissionStatus('denied');
    }
  };

  const handleRetryPermission = () => {
    if (selectedSessionId) {
      handleJoinSession(selectedSessionId);
    }
  };

  const handleCancelPermission = () => {
    setShowPermissionModal(false);
    setSelectedSessionId(null);
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/');
  };

  const getStatusBadge = (status) => {
    const badges = {
      'SCHEDULED': { color: '#2196f3', text: '예약됨' },
      'ACTIVE': { color: '#4caf50', text: '진행중' },
      'COMPLETED': { color: '#9e9e9e', text: '완료' },
      'CANCELLED': { color: '#f44336', text: '취소' }
    };
    
    const badge = badges[status] || badges['SCHEDULED'];
    
    return (
      <span 
        className="status-badge"
        style={{ backgroundColor: badge.color }}
      >
        {badge.text}
      </span>
    );
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="doctor-dashboard">
        <div style={{ 
          textAlign: 'center', 
          padding: '100px 20px',
          color: 'white' 
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255,255,255,0.3)',
            borderTop: '4px solid white',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }}></div>
          <p style={{ fontSize: '18px' }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="doctor-dashboard">
      {/* ========== 대시보드 헤더 ========== */}
      <div className="dashboard-header">
        <div>
          <h1>👨‍⚕️ 의사 대시보드</h1>
          {doctorInfo && (
            <p style={{ margin: '8px 0 0 0', color: '#666', fontSize: '16px' }}>
              {doctorInfo.name} · {doctorInfo.specialty}
            </p>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          {/* ✅ 가용성 토글 */}
          <div className="availability-toggle">
            <label>
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={handleAvailabilityToggle}
              />
              <span className={isAvailable ? 'available' : 'unavailable'}>
                {isAvailable ? '🟢 진료 가능' : '🔴 진료 불가'}
              </span>
            </label>
          </div>

          <button 
            onClick={handleLogout}
            style={{
              padding: '10px 20px',
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            로그아웃
          </button>
        </div>
      </div>

      {/* ========== 활성 세션 ========== */}
      <div className="sessions-container">
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '25px'
        }}>
          <h2 style={{ margin: 0 }}>📅 예약된 상담 ({activeSessions.length})</h2>
          <button 
            onClick={fetchSessions}
            style={{
              padding: '10px 20px',
              background: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '10px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            🔄 새로고침
          </button>
        </div>

        {error && (
          <div style={{
            padding: '15px',
            background: '#fee',
            color: '#c62828',
            borderRadius: '10px',
            marginBottom: '20px',
            borderLeft: '4px solid #e74c3c'
          }}>
            ⚠️ {error}
          </div>
        )}

        {activeSessions.length === 0 ? (
          <div className="no-sessions">
            <p style={{ fontSize: '60px', margin: '0 0 20px 0' }}>📭</p>
            <p>예약된 상담이 없습니다.</p>
          </div>
        ) : (
          <div className="sessions-grid">
            {activeSessions.map((session) => (
              <div key={session.SESSION_ID} className="session-card">
                <div className="session-header">
                  <h3>👤 {session.GUARDIAN_NAME || '환자'}</h3>
                  {getStatusBadge(session.STATUS)}
                </div>

                <div className="session-details">
                  {session.INFANT_NAME && (
                    <p><strong>아기:</strong> 👶 {session.INFANT_NAME}</p>
                  )}
                  <p>
                    <strong>예약 시간:</strong><br/>
                    {formatDateTime(session.SCHEDULED_TIME)}
                  </p>
                  {session.START_TIME && (
                    <p>
                      <strong>시작 시간:</strong><br/>
                      {formatDateTime(session.START_TIME)}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => handleJoinSession(session.SESSION_ID)}
                  className="join-button"
                >
                  📹 상담 시작
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========== 완료된 세션 이력 ========== */}
      {completedSessions.length > 0 && (
        <div className="sessions-container" style={{ marginTop: '30px' }}>
          <h2>📊 완료된 상담 이력 ({completedSessions.length})</h2>
          
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>환자명</th>
                  <th>아기</th>
                  <th>예약 시간</th>
                  <th>통화 시간</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {completedSessions.map((session) => (
                  <tr key={session.SESSION_ID}>
                    <td>{session.GUARDIAN_NAME || '-'}</td>
                    <td>{session.INFANT_NAME || '-'}</td>
                    <td>{formatDateTime(session.SCHEDULED_TIME)}</td>
                    <td>
                      {session.DURATION_MINUTES 
                        ? `${session.DURATION_MINUTES}분` 
                        : '-'}
                    </td>
                    <td>{getStatusBadge(session.STATUS)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== 권한 체크 모달 ========== */}
      {showPermissionModal && (
        <div className="permission-modal-overlay">
          <div className="permission-modal">
            <div className="modal-content">
              {/* 체크 중 */}
              {permissionStatus === 'checking' && (
                <>
                  <div className="spinner"></div>
                  <h2>권한 확인 중</h2>
                  <p>카메라와 마이크 권한을 확인하고 있습니다...</p>
                </>
              )}

              {/* 성공 */}
              {permissionStatus === 'granted' && (
                <>
                  <div className="success-icon">✅</div>
                  <h2>권한 허용됨</h2>
                  <p>화상 상담방으로 이동합니다...</p>
                </>
              )}

              {/* 실패 */}
              {permissionStatus === 'denied' && (
                <>
                  <div className="error-icon">⚠️</div>
                  <h2>권한이 필요합니다</h2>
                  <div className="error-message">
                    {permissionError?.message}
                  </div>

                  <div className="help-section">
                    <h3>💡 해결 방법</h3>
                    
                    {permissionError?.type === 'denied' && (
                      <>
                        <div className="guide-box">
                          <p>브라우저 설정에서 카메라/마이크 권한을 허용해주세요.</p>
                        </div>
                        <ol>
                          <li>브라우저 주소창 좌측의 자물쇠 또는 카메라 아이콘 클릭</li>
                          <li>카메라와 마이크 권한을 '허용'으로 변경</li>
                          <li>페이지를 새로고침하거나 다시 시도</li>
                        </ol>
                      </>
                    )}

                    {permissionError?.type === 'no-devices' && (
                      <>
                        <div className="guide-box">
                          <p>카메라와 마이크가 연결되어 있는지 확인해주세요.</p>
                        </div>
                        <ul>
                          <li>카메라와 마이크가 컴퓨터에 연결되어 있나요?</li>
                          <li>장치 드라이버가 설치되어 있나요?</li>
                          <li>다른 프로그램에서 사용 중이지 않나요?</li>
                        </ul>
                      </>
                    )}

                    {permissionError?.type === 'in-use' && (
                      <>
                        <div className="guide-box">
                          <p>다른 프로그램에서 카메라를 사용 중입니다.</p>
                        </div>
                        <ul>
                          <li>Zoom, Teams 등 화상회의 프로그램을 종료하세요</li>
                          <li>브라우저의 다른 탭을 확인하세요</li>
                          <li>필요시 브라우저를 재시작하세요</li>
                        </ul>
                      </>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button 
                      onClick={handleRetryPermission}
                      className="btn-retry"
                    >
                      🔄 다시 시도
                    </button>
                    <button 
                      onClick={handleCancelPermission}
                      className="btn-cancel"
                    >
                      취소
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ========== 실시간 호출 알림 팝업 ========== */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-popup">
            <div className="call-icon">📱</div>
            <h2>새로운 상담 요청</h2>
            <div className="call-info">
              <p><strong>환자:</strong> {incomingCall.guardianName || '익명'}</p>
              <p><strong>아기:</strong> {incomingCall.infantName || '정보 없음'}</p>
            </div>
            <div className="call-actions">
              <button 
                onClick={handleRejectCall} 
                className="btn-reject"
              >
                거절
              </button>
              <button 
                onClick={handleAcceptCall} 
                className="btn-accept"
              >
                수락 (상담 시작)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DoctorDashboard;