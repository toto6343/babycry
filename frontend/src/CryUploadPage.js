// src/CryUploadPage.js (울음 타입 텍스트 설명 + 오디오 미리듣기 기능 추가)
import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { cryAPI } from './api';
import { useAuth } from './AuthContext';

function CryUploadPage() {
  const { selectedInfant, user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  
  // ✅ 오디오 재생 관련 state 추가
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // 파일 타입 검증
      const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(wav|mp3)$/i)) {
        setError('WAV 또는 MP3 파일만 업로드 가능합니다.');
        setFile(null);
        cleanupAudio();
        return;
      }

      // 파일 크기 검증 (10MB)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('파일 크기는 10MB 이하여야 합니다.');
        setFile(null);
        cleanupAudio();
        return;
      }

      setFile(selectedFile);
      setError('');
      setResult(null);
      
      // ✅ 오디오 미리듣기를 위한 URL 생성
      const url = URL.createObjectURL(selectedFile);
      setAudioUrl(url);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  // ✅ 오디오 정리 함수
  const cleanupAudio = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  // ✅ 재생/일시정지 토글
  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // ✅ 오디오 이벤트 핸들러
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // ✅ 진행바 클릭으로 재생 위치 변경
  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // ✅ 시간 포맷 함수 (초 → MM:SS)
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleUpload = async () => {
    if (!file) {
      setError('파일을 선택해주세요.');
      return;
    }

    // ✅ 검증 추가: selectedInfant와 user 확인
    if (!selectedInfant || !selectedInfant.infantId) {
      setError('아기 정보를 불러올 수 없습니다. 아기를 선택해주세요.');
      return;
    }

    if (!user || !user.guardianId) {
      setError('사용자 정보를 불러올 수 없습니다. 다시 로그인해주세요.');
      return;
    }

    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('audio', file);

      // ✅ infantId와 guardianId를 숫자로 변환하여 전달
      const infantId = parseInt(selectedInfant.infantId);
      const guardianId = parseInt(user.guardianId);

      // 디버깅용 로그
      console.log('📤 업로드 정보:', {
        infantId,
        guardianId,
        fileName: file.name,
        fileSize: file.size
      });

      // ✅ NaN 체크
      if (isNaN(infantId) || isNaN(guardianId)) {
        throw new Error(`잘못된 ID 값입니다. infantId: ${infantId}, guardianId: ${guardianId}`);
      }

      const response = await cryAPI.upload(
        formData,
        infantId,
        guardianId
      );
      
      console.log('✅ 업로드 성공:', response.data);
      setResult(response.data);
      
      // ✅ 업로드 성공 후 파일 및 오디오 초기화
      setFile(null);
      cleanupAudio();
    } catch (err) {
      console.error('❌ Upload error:', err);
      
      // 에러 메시지 처리
      let errorMessage = '업로드에 실패했습니다. 다시 시도해주세요.';
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        
        // detail이 배열인 경우 (FastAPI validation error)
        if (Array.isArray(detail)) {
          errorMessage = detail.map(e => e.msg).join(', ');
        } 
        // detail이 문자열인 경우
        else if (typeof detail === 'string') {
          errorMessage = detail;
        }
        // detail이 객체인 경우
        else if (typeof detail === 'object') {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

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

  // ✅ 울음 타입별 상세 설명 추가
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

  // ✅ 울음 타입별 추천 조치 추가
  const getCryTypeActions = (cryType) => {
    const actionsMap = {
      hungry: [
        '마지막 수유 시간 확인',
        '분유 또는 모유 준비',
        '편안한 자세로 수유하기',
        '트림시키기'
      ],
      tired: [
        '조용하고 어두운 환경 조성',
        '자장가 들려주기',
        '부드럽게 토닥이기',
        '포대기로 감싸주기'
      ],
      uncomfortable: [
        '기저귀 확인 및 교체',
        '옷의 착용감 점검',
        '실내 온도 조절 (20-22°C)',
        '목욕 후 피부 상태 확인'
      ],
      pain: [
        '배 마사지 (가스 배출)',
        '체온 측정',
        '증상 관찰 및 기록',
        '필요시 소아과 상담'
      ],
      emotional: [
        '아기 안아주기',
        '부드럽게 말 걸어주기',
        '진정 음악 재생',
        '스킨십 늘리기'
      ],
    };
    return actionsMap[cryType] || ['아기를 관찰하고 필요한 조치를 취해주세요.'];
  };

  const getSeverityColor = (severity) => {
    const colorMap = {
      High: '#f44336',
      Medium: '#ff9800',
      Low: '#4caf50',
    };
    return colorMap[severity] || '#757575';
  };

  // ✅ 아기 선택 안내 메시지
  if (!selectedInfant || !selectedInfant.infantId) {
    return (
      <div style={styles.container}>
        <div style={styles.warningCard}>
          <div style={styles.warningIcon}>⚠️</div>
          <h2 style={styles.warningTitle}>아기를 선택해주세요</h2>
          <p style={styles.warningText}>
            울음 소리를 분석하려면 먼저 아기를 선택해야 합니다.
          </p>
          <button 
            style={styles.selectButton}
            onClick={() => {
              console.log('🔄 아기 선택 페이지로 이동');
              localStorage.removeItem('selectedInfant');
              navigate('/infant-select', { replace: true });
            }}
          >
            아기 선택하러 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>📤 울음 소리 업로드</h1>
        <p style={styles.subtitle}>
          {selectedInfant.name}의 울음 소리를 녹음하여 업로드하세요
        </p>
      </div>

      <div style={styles.uploadCard}>
        {/* 파일 선택 영역 */}
        <div style={styles.uploadArea}>
          <label htmlFor="file-input" style={styles.fileLabel}>
            <div style={styles.fileLabelContent}>
              <div style={styles.uploadIcon}>🎵</div>
              <div style={styles.uploadText}>
                {file ? (
                  <>
                    <div style={styles.fileName}>{file.name}</div>
                    <div style={styles.fileSize}>
                      {(file.size / 1024).toFixed(2)} KB
                    </div>
                  </>
                ) : (
                  <>
                    <div style={styles.uploadPrompt}>
                      파일을 선택하거나 여기에 드래그하세요
                    </div>
                    <div style={styles.uploadHint}>
                      WAV 또는 MP3 파일, 최대 10MB
                    </div>
                  </>
                )}
              </div>
            </div>
          </label>
          <input
            id="file-input"
            type="file"
            accept="audio/wav,audio/mp3,audio/mpeg,.wav,.mp3"
            onChange={handleFileChange}
            style={styles.fileInput}
            disabled={uploading}
          />
        </div>

        {/* ✅ 오디오 플레이어 */}
        {audioUrl && (
          <div style={styles.audioPlayer}>
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
            />
            
            <div style={styles.playerHeader}>
              🎧 미리듣기
            </div>

            <div style={styles.playerControls}>
              {/* 재생/일시정지 버튼 */}
              <button
                onClick={togglePlayPause}
                style={styles.playButton}
                disabled={uploading}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

              {/* 진행바 */}
              <div style={styles.progressContainer}>
                <div
                  style={styles.progressBar}
                  onClick={handleSeek}
                >
                  <div
                    style={{
                      ...styles.progressFill,
                      width: duration ? `${(currentTime / duration) * 100}%` : '0%'
                    }}
                  />
                </div>
                <div style={styles.timeDisplay}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 에러 메시지 */}
        {error && (
          <div style={styles.error}>
            ⚠️ {error}
          </div>
        )}

        {/* 업로드 버튼 */}
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{
            ...styles.uploadButton,
            opacity: !file || uploading ? 0.5 : 1,
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? (
            <>
              <span style={styles.buttonSpinner}></span>
              분석 중...
            </>
          ) : (
            '🔍 울음 분석하기'
          )}
        </button>
      </div>

      {/* 분석 결과 */}
      {result && (
        <div style={styles.resultCard}>
          <div style={styles.resultHeader}>
            <h2 style={styles.resultTitle}>✅ 분석 완료</h2>
          </div>

          <div style={styles.resultContent}>
            {/* 울음 타입 */}
            <div style={styles.resultMain}>
              <div style={styles.resultEmoji}>
                {getCryTypeEmoji(result.prediction)}
              </div>
              <div style={styles.resultType}>
                {getCryTypeLabel(result.prediction)}
              </div>
              {/* ✅ 울음 타입 설명 추가 */}
              <div style={styles.resultDescription}>
                {getCryTypeDescription(result.prediction)}
              </div>
            </div>

            {/* 상세 정보 */}
            <div style={styles.resultDetails}>
              <div style={styles.resultDetail}>
                <span style={styles.detailLabel}>심각도:</span>
                <span style={{
                  ...styles.severityBadge,
                  backgroundColor: getSeverityColor(result.severity),
                }}>
                  {result.severity}
                </span>
              </div>

              <div style={styles.resultDetail}>
                <span style={styles.detailLabel}>신뢰도:</span>
                <div style={styles.confidenceBar}>
                  <div
                    style={{
                      ...styles.confidenceFill,
                      width: `${result.confidence * 100}%`,
                    }}
                  />
                  <span style={styles.confidenceText}>
                    {(result.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* ✅ 추천 조치 목록 추가 */}
            <div style={styles.recommendedActions}>
              <div style={styles.recommendedActionsHeader}>
                💡 추천 조치 사항
              </div>
              <ul style={styles.actionsList}>
                {getCryTypeActions(result.prediction).map((action, index) => (
                  <li key={index} style={styles.actionItem}>
                    {action}
                  </li>
                ))}
              </ul>
            </div>

            {/* 조치 안내 */}
            <div style={styles.actionGuide}>
              <div style={styles.actionGuideHeader}>
                📊 다음 단계
              </div>
              <div style={styles.actionGuideText}>
                대시보드에서 AI 추천 조치를 확인하고, 취한 조치를 기록해보세요.
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                style={styles.dashboardButton}
              >
                대시보드로 이동
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사용 팁 */}
      <div style={styles.tipsCard}>
        <h3 style={styles.tipsTitle}>📌 사용 팁</h3>
        <ul style={styles.tipsList}>
          <li style={styles.tipItem}>
            조용한 환경에서 녹음하면 더 정확한 분석이 가능합니다
          </li>
          <li style={styles.tipItem}>
            최소 3초 이상의 울음 소리를 녹음해주세요
          </li>
          <li style={styles.tipItem}>
            배경 소음이 적을수록 분석 정확도가 높아집니다
          </li>
          <li style={styles.tipItem}>
            분석 결과는 대시보드에서 확인하고 관리할 수 있습니다
          </li>
        </ul>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '800px',
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
  warningCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '64px 32px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
    marginTop: '100px',
  },
  warningIcon: {
    fontSize: '64px',
    marginBottom: '24px',
  },
  warningTitle: {
    fontSize: '24px',
    margin: '0 0 16px 0',
    color: '#333',
  },
  warningText: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '32px',
  },
  selectButton: {
    padding: '16px 32px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  uploadCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
  },
  uploadArea: {
    marginBottom: '24px',
  },
  fileLabel: {
    display: 'block',
    padding: '60px 20px',
    border: '3px dashed #ccc',
    borderRadius: '12px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fafafa',
  },
  fileLabelContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  uploadIcon: {
    fontSize: '48px',
  },
  uploadText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
  },
  fileSize: {
    fontSize: '14px',
    color: '#999',
  },
  uploadPrompt: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  uploadHint: {
    fontSize: '14px',
    color: '#999',
  },
  fileInput: {
    display: 'none',
  },
  // ✅ 오디오 플레이어 스타일
  audioPlayer: {
    marginBottom: '24px',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
    border: '1px solid #e0e0e0',
  },
  playerHeader: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '16px',
  },
  playerControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  playButton: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    backgroundColor: '#1976d2',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
    flexShrink: 0,
  },
  progressContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  progressBar: {
    height: '8px',
    backgroundColor: '#ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1976d2',
    borderRadius: '4px',
    transition: 'width 0.1s',
  },
  timeDisplay: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#666',
  },
  error: {
    padding: '16px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '8px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  uploadButton: {
    width: '100%',
    padding: '16px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '18px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },
  buttonSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  resultCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: '24px',
    border: '2px solid #4caf50',
  },
  resultHeader: {
    marginBottom: '24px',
  },
  resultTitle: {
    fontSize: '24px',
    margin: 0,
    color: '#4caf50',
  },
  resultContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  resultMain: {
    textAlign: 'center',
    padding: '24px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
  },
  resultEmoji: {
    fontSize: '64px',
    marginBottom: '12px',
  },
  resultType: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#333',
    marginBottom: '16px',
  },
  resultDescription: {
    fontSize: '15px',
    color: '#555',
    lineHeight: '1.7',
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
  },
  resultDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  resultDetail: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  detailLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#666',
    minWidth: '80px',
  },
  severityBadge: {
    padding: '8px 16px',
    borderRadius: '16px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
  },
  confidenceBar: {
    flex: 1,
    height: '32px',
    backgroundColor: '#e0e0e0',
    borderRadius: '16px',
    position: 'relative',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    transition: 'width 0.5s ease',
  },
  confidenceText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  recommendedActions: {
    padding: '20px',
    backgroundColor: '#fff3e0',
    borderRadius: '12px',
    border: '1px solid #ffb74d',
  },
  recommendedActionsHeader: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#f57c00',
    marginBottom: '12px',
  },
  actionsList: {
    margin: '0',
    paddingLeft: '20px',
  },
  actionItem: {
    fontSize: '14px',
    color: '#333',
    lineHeight: '2',
    marginBottom: '4px',
  },
  actionGuide: {
    padding: '20px',
    backgroundColor: '#e3f2fd',
    borderRadius: '12px',
    border: '1px solid #90caf9',
  },
  actionGuideHeader: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: '8px',
  },
  actionGuideText: {
    fontSize: '14px',
    color: '#333',
    lineHeight: '1.6',
    marginBottom: '16px',
  },
  dashboardButton: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  tipsCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  tipsTitle: {
    fontSize: '20px',
    margin: '0 0 16px 0',
    color: '#333',
  },
  tipsList: {
    margin: 0,
    paddingLeft: '20px',
  },
  tipItem: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.8',
    marginBottom: '8px',
  },
};

export default CryUploadPage;