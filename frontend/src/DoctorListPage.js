// DoctorListPage.js - 권한 체크 추가 버전
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from './AuthContext';
import { checkMediaPermissions, requestMediaPermissions, getBrowserPermissionGuide } from './utils/mediaPermissions';
import './DoctorListPage.css';

const DoctorListPage = () => {
  const navigate = useNavigate();
  const { selectedInfant: authSelectedInfant } = useAuth();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInfantId, setSelectedInfantId] = useState('');
  const [infants, setInfants] = useState([]);

  // ... (rest of states)
  
  // 🆕 권한 체크 관련 상태
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState(null);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [pendingDoctorId, setPendingDoctorId] = useState(null);

  const fetchDoctors = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:4000/api/videocall/doctors/available', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setDoctors(response.data.doctors);
      }
    } catch (error) {
      console.error('의사 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInfants = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:4000/api/infants', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.infants && response.data.infants.length > 0) {
        const infantsData = response.data.infants;
        setInfants(infantsData);
        
        if (!authSelectedInfant?.infantId) {
          const firstId = infantsData[0].INFANT_ID || infantsData[0].infant_id;
          setSelectedInfantId(firstId);
        }
      }
    } catch (error) {
      console.error('유아 목록 조회 실패:', error);
    }
  }, [authSelectedInfant]);

  useEffect(() => {
    fetchDoctors();
    fetchInfants();
  }, [fetchDoctors, fetchInfants]);

  // AuthContext에서 선택된 아기가 바뀌면 로컬 상태도 업데이트
  useEffect(() => {
    if (authSelectedInfant?.infantId) {
      setSelectedInfantId(authSelectedInfant.infantId);
    }
  }, [authSelectedInfant]);

  // 🆕 화상 통화 시작 - 권한 체크 포함
  const handleStartCall = async (doctorId) => {
    if (!selectedInfantId) {
      alert('상담할 아기를 선택해주세요.');
      return;
    }

    setIsCheckingPermission(true);
    setShowPermissionModal(true);
    setPendingDoctorId(doctorId);

    // 1단계: 미디어 권한 체크
    const result = await checkMediaPermissions();
    
    // 에러 정보가 없는데 권한도 없는 경우 기본 에러 생성 (장치 상태 확인 불가 방지)
    if (!result.hasPermission && !result.error) {
      result.error = {
        type: 'prompt',
        message: '카메라와 마이크 사용 권한 확인이 필요합니다.'
      };
    }
    
    setPermissionStatus(result);
    setIsCheckingPermission(false);

    // 2단계: 권한이 이미 있으면 바로 이동
    if (result.hasPermission) {
      await createSessionAndNavigate(doctorId);
      setShowPermissionModal(false);
    }
  };

  // 🆕 권한 요청 처리
  const handleRequestPermission = async () => {
    setIsCheckingPermission(true);
    
    const result = await requestMediaPermissions();
    
    if (result.success) {
      if (result.stream) {
        result.stream.getTracks().forEach(track => track.stop());
      }
      
      await createSessionAndNavigate(pendingDoctorId);
      setShowPermissionModal(false);
    } else {
      setPermissionStatus({
        hasPermission: false,
        hasCamera: false,
        hasMicrophone: false,
        error: result.error
      });
    }
    
    setIsCheckingPermission(false);
  };

  const createSessionAndNavigate = async (doctorId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:4000/api/videocall/sessions',
        {
          doctorId,
          infantId: selectedInfantId,
          scheduledTime: new Date().toISOString()
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      if (response.data.success) {
        navigate(`/video-call/${response.data.sessionId}`, {
          state: { doctorId, infantId: selectedInfantId }
        });
      }
    } catch (error) {
      console.error('세션 생성 실패:', error);
      alert('화상 통화 시작에 실패했습니다.');
      setShowPermissionModal(false);
    }
  };

  const getSpecialtyBadgeColor = (specialty) => {
    switch(specialty) {
      case '소아과': return '#4CAF50';
      case '신생아과': return '#2196F3';
      case '소아청소년과': return '#FF9800';
      default: return '#9E9E9E';
    }
  };

  if (loading) {
    return (
      <div className="doctor-list-page">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>의사 목록을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="doctor-list-page">
      <div className="doctor-list-container">
        <header className="page-header">
          <h1>💊 소아과 전문의 화상 상담</h1>
          <p className="subtitle">전문의와 실시간으로 상담하세요</p>
        </header>

        {infants.length > 0 && (
          <div className="infant-selector">
            <label>상담 대상 아기:</label>
            <select 
              value={selectedInfantId} 
              onChange={(e) => setSelectedInfantId(e.target.value)}
            >
              {infants.map((infant, index) => {
                const id = infant.INFANT_ID || infant.infant_id || `infant-${index}`;
                const name = infant.INFANT_NAME || infant.name || infant.NAME || '알 수 없음';
                return (
                  <option key={id} value={id}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        <div className="doctors-grid">
          {doctors.map((doctor, index) => {
            const id = doctor.DOCTOR_ID || doctor.doctor_id || `doctor-${index}`;
            return (
              <div key={id} className="doctor-card">
                <div className="doctor-header">
                  <div className="doctor-avatar">
                    {doctor.PROFILE_IMAGE ? (
                      <img src={doctor.PROFILE_IMAGE} alt={doctor.DOCTOR_NAME} />
                    ) : (
                      <div className="avatar-placeholder">
                        👨‍⚕️
                      </div>
                    )}
                  </div>
                  <div className="doctor-info">
                    <h3>{doctor.DOCTOR_NAME || '의사 성함'}</h3>
                    <div 
                      className="specialty-badge"
                      style={{ backgroundColor: getSpecialtyBadgeColor(doctor.SPECIALTY) }}
                    >
                      {doctor.SPECIALTY || '일반의'}
                    </div>
                  </div>
                </div>

                <div className="doctor-details">
                  <div className="detail-row">
                    <span className="label">경력:</span>
                    <span className="value">{doctor.EXPERIENCE_YEARS || 0}년</span>
                  </div>
                  <div className="detail-row">
                    <span className="label">평점:</span>
                    <span className="value">
                      ⭐ {Number(doctor.RATING || 5).toFixed(1)}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="label">면허번호:</span>
                    <span className="value license">{doctor.LICENSE_NUMBER || '미등록'}</span>
                  </div>
                  <div className="status-badge available">
                    🟢 상담 가능
                  </div>
                </div>

                <button 
                  className="start-call-button"
                  onClick={() => handleStartCall(id)}
                >
                  📹 화상 상담 시작
                </button>
              </div>
            );
          })}
        </div>

        {doctors.length === 0 && (
          <div className="no-doctors">
            <p>😔 현재 상담 가능한 의사가 없습니다.</p>
            <p className="sub-text">나중에 다시 시도해주세요.</p>
          </div>
        )}
      </div>

      {/* 🆕 권한 체크 모달 */}
      {showPermissionModal && (
        <div className="permission-modal-overlay">
          <div className="permission-modal">
            <div className="modal-content">
              {isCheckingPermission ? (
                // 체크 중
                <div className="modal-content-inner checking">
                  <div className="spinner"></div>
                  <h2>권한 확인 중...</h2>
                  <p>카메라와 마이크를 확인하고 있습니다.</p>
                </div>
              ) : permissionStatus?.hasPermission ? (
                // 권한 있음 - 세션 생성 중
                <div className="modal-content-inner success">
                  <div className="success-icon">✅</div>
                  <h2>권한 확인 완료</h2>
                  <p>화상 상담을 시작합니다...</p>
                </div>
              ) : permissionStatus?.error ? (
                // 권한 없음 또는 에러
                <div className="modal-content-inner error">
                  <div className="error-icon">
                    {permissionStatus.error.type === 'denied' ? '⚠️' : '❌'}
                  </div>
                  <h2>권한이 필요합니다</h2>
                  <p className="error-message">{permissionStatus.error.message}</p>

                  <div className="help-section">
                    <h3>📋 해결 방법:</h3>
                    <div className="guide-box">
                      <p>{getBrowserPermissionGuide()}</p>
                    </div>
                    <ol>
                      <li>위 안내에 따라 브라우저 설정을 변경하세요</li>
                      <li>페이지를 새로고침하세요</li>
                      <li>다시 화상 상담을 시도하세요</li>
                    </ol>
                  </div>

                  <div className="modal-actions">
                    {permissionStatus.error.type === 'prompt' && (
                      <button 
                        className="btn-primary"
                        onClick={handleRequestPermission}
                      >
                        📹 권한 허용하기
                      </button>
                    )}
                    {(permissionStatus.error.type === 'denied' || permissionStatus.error.type === 'no-devices') && (
                      <button 
                        className="btn-retry"
                        onClick={handleRequestPermission}
                      >
                        🔄 다시 시도
                      </button>
                    )}
                    <button 
                      className="btn-cancel"
                      onClick={() => setShowPermissionModal(false)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                // 예외 케이스 처리 (기본 상태)
                <div className="modal-content-inner">
                  <div className="error-icon">❔</div>
                  <h2>장치 상태 확인 불가</h2>
                  <p>카메라 또는 마이크 상태를 확인할 수 없습니다.</p>
                  <div className="modal-actions">
                    <button 
                      className="btn-retry"
                      onClick={handleStartCall.bind(null, pendingDoctorId)}
                    >
                      🔄 다시 시도
                    </button>
                    <button 
                      className="btn-cancel"
                      onClick={() => setShowPermissionModal(false)}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DoctorListPage;