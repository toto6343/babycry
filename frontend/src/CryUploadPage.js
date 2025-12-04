// src/CryUploadPage.js (울음 타입 텍스트 설명 + 오디오 미리듣기 + 마이크 녹음 기능 + WAV 변환 + 정규화)
import React, { useState, useRef, useEffect } from 'react';
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
  
  // ✅ 오디오 재생 관련 state
  const [audioUrl, setAudioUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef(null);

  // ✅ 녹음 관련 state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordedChunks, setRecordedChunks] = useState([]);
  const [recordMode, setRecordMode] = useState(false);
  const recordingIntervalRef = useRef(null);

  // ✅ WebM을 WAV로 변환하는 함수
  const audioBufferToWav = (buffer) => {
    const length = buffer.length * buffer.numberOfChannels * 2 + 44;
    const arrayBuffer = new ArrayBuffer(length);
    const view = new DataView(arrayBuffer);
    const channels = [];
    let offset = 0;
    let pos = 0;

    const setUint16 = (data) => {
      view.setUint16(pos, data, true);
      pos += 2;
    };
    const setUint32 = (data) => {
      view.setUint32(pos, data, true);
      pos += 4;
    };

    // RIFF identifier
    setUint32(0x46464952);
    // file length
    setUint32(length - 8);
    // RIFF type
    setUint32(0x45564157);
    // format chunk identifier
    setUint32(0x20746d66);
    // format chunk length
    setUint32(16);
    // sample format (raw)
    setUint16(1);
    // channel count
    setUint16(buffer.numberOfChannels);
    // sample rate
    setUint32(buffer.sampleRate);
    // byte rate
    setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels);
    // block align
    setUint16(buffer.numberOfChannels * 2);
    // bits per sample
    setUint16(16);
    // data chunk identifier
    setUint32(0x61746164);
    // data chunk length
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }

    while (pos < length) {
      for (let i = 0; i < buffer.numberOfChannels; i++) {
        let sample = Math.max(-1, Math.min(1, channels[i][offset]));
        sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        view.setInt16(pos, sample, true);
        pos += 2;
      }
      offset++;
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };

  const convertToWav = async (blob) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const wavBlob = audioBufferToWav(audioBuffer);
    return wavBlob;
  };

  // ✅ 마이크 권한 요청 및 녹음 시작 (정규화된 설정)
  const startRecording = async () => {
    try {
      // ✅ 수정: 신호 처리 비활성화, 샘플레이트 22050으로 통일
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: false,      // ✅ 변경: 에코 제거 비활성화
          noiseSuppression: false,       // ✅ 변경: 노이즈 제거 비활성화
          autoGainControl: false,        // ✅ 추가: 자동 게인 제어 비활성화
          sampleRate: 22050,             // ✅ 변경: 모델과 동일한 샘플레이트
        } 
      });

      // ✅ 수정: 비트레이트 명시
      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
        audioBitsPerSecond: 128000,      // ✅ 추가: 비트레이트 명시
      });

      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        
        try {
          console.log('🔄 WebM을 WAV로 변환 중...');
          const wavBlob = await convertToWav(blob);
          
          const audioFile = new File([wavBlob], `recording_${Date.now()}.wav`, {
            type: 'audio/wav',
          });

          console.log('✅ WAV 변환 성공:', audioFile.name, audioFile.size);
          setFile(audioFile);
          
          const url = URL.createObjectURL(wavBlob);
          setAudioUrl(url);
        } catch (convertError) {
          console.error('❌ WAV 변환 오류:', convertError);
          
          console.log('⚠️ WebM 형식 그대로 사용');
          const audioFile = new File([blob], `recording_${Date.now()}.webm`, {
            type: 'audio/webm',
          });

          setFile(audioFile);
          
          const url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);
      setRecordedChunks(chunks);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error('❌ 마이크 권한 오류:', err);
      if (err.name === 'NotAllowedError') {
        setError('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
      } else if (err.name === 'NotFoundError') {
        setError('마이크를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.');
      } else {
        setError('녹음을 시작할 수 없습니다: ' + err.message);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      if (mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
      
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    
    setIsRecording(false);
    setRecordingTime(0);
    setRecordedChunks([]);
    
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
      }
      cleanupAudio();
    };
  }, [mediaRecorder]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const validTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(wav|mp3)$/i)) {
        setError('WAV 또는 MP3 파일만 업로드 가능합니다.');
        setFile(null);
        cleanupAudio();
        return;
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('파일 크기는 10MB 이하여야 합니다.');
        setFile(null);
        cleanupAudio();
        return;
      }

      setFile(selectedFile);
      setError('');
      setResult(null);
      
      const url = URL.createObjectURL(selectedFile);
      setAudioUrl(url);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  };

  const cleanupAudio = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

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

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

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

      const infantId = parseInt(selectedInfant.infantId);
      const guardianId = parseInt(user.guardianId);

      console.log('📤 업로드 정보:', {
        infantId,
        guardianId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });

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
      
      setFile(null);
      cleanupAudio();
    } catch (err) {
      console.error('❌ Upload error:', err);
      
      let errorMessage = '업로드에 실패했습니다. 다시 시도해주세요.';
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        
        if (Array.isArray(detail)) {
          errorMessage = detail.map(e => e.msg).join(', ');
        } 
        else if (typeof detail === 'string') {
          errorMessage = detail;
        }
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
      belly_pain: '😭',
      discomfort: '😣',
      burping: '🤱',
      cold_hot: '🌡️',
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
      belly_pain: '배앓이',
      discomfort: '불편함',
      burping: '트림 필요',
      cold_hot: '온도 불편',
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
      belly_pain: '아기가 배앓이를 겪고 있습니다. 배를 부드럽게 마사지하고, 증상이 심하면 소아과 상담을 권장합니다.',
      discomfort: '아기가 불편함을 느끼고 있습니다. 전반적인 상태를 확인해주세요.',
      burping: '아기가 트림이 필요합니다. 등을 두드려 트림을 시켜주세요.',
      cold_hot: '아기가 온도로 인한 불편함을 느끼고 있습니다. 실내 온도와 옷을 확인해주세요.',
    };
    return descriptionMap[cryType] || '아기의 울음 원인을 파악하고 적절한 조치를 취해주세요.';
  };

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
      belly_pain: [
        '배를 시계방향으로 부드럽게 마사지',
        '따뜻한 수건 배에 대주기',
        '세워서 안아주기',
        '증상이 심하면 소아과 상담'
      ],
      discomfort: [
        '전반적인 불편 요소 점검',
        '자세 바꿔주기',
        '안아서 달래주기'
      ],
      burping: [
        '등을 두드려 트림 시키기',
        '세워서 안아주기',
        '배 마사지'
      ],
      cold_hot: [
        '체온 및 실내온도 확인 (20-22°C)',
        '옷 두께 조절하기'
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
          {selectedInfant.name}의 울음 소리를 녹음하거나 업로드하세요
        </p>
      </div>

      <div style={styles.uploadCard}>
        <div style={styles.modeSelector}>
          <button
            style={{
              ...styles.modeButton,
              ...(!recordMode ? styles.modeButtonActive : {})
            }}
            onClick={() => {
              if (isRecording) {
                cancelRecording();
              }
              setRecordMode(false);
              setError('');
            }}
            disabled={uploading || isRecording}
          >
            🎵 파일 업로드
          </button>
          <button
            style={{
              ...styles.modeButton,
              ...(recordMode ? styles.modeButtonActive : {})
            }}
            onClick={() => {
              setRecordMode(true);
              setFile(null);
              cleanupAudio();
              setError('');
            }}
            disabled={uploading || isRecording}
          >
            🎙️ 직접 녹음
          </button>
        </div>

        {recordMode && (
          <>
            {!isRecording && !file && (
              <div style={styles.recordingArea}>
                <div style={styles.recordIcon}>🎙️</div>
                <div style={styles.recordPrompt}>
                  버튼을 눌러 아기 울음소리 녹음을 시작하세요
                </div>
                <button
                  onClick={startRecording}
                  style={styles.startRecordButton}
                  disabled={uploading}
                >
                  🔴 녹음 시작
                </button>
                <div style={styles.recordHint}>
                  최소 3초 이상 녹음하는 것을 권장합니다
                </div>
              </div>
            )}

            {isRecording && (
              <div style={styles.recordingActive}>
                <div style={styles.recordingIndicator}>
                  <span style={styles.recordingDot}></span>
                  녹음 중...
                </div>
                <div style={styles.recordingTimer}>
                  {formatTime(recordingTime)}
                </div>
                <div style={styles.recordingControls}>
                  <button
                    onClick={stopRecording}
                    style={styles.stopRecordButton}
                  >
                    ⏹️ 녹음 완료
                  </button>
                  <button
                    onClick={cancelRecording}
                    style={styles.cancelRecordButton}
                  >
                    ❌ 취소
                  </button>
                </div>
                <div style={styles.recordingWave}>
                  🎵 🎵 🎵 🎵 🎵
                </div>
              </div>
            )}
          </>
        )}

        {!recordMode && (
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
        )}

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
              <button
                onClick={togglePlayPause}
                style={styles.playButton}
                disabled={uploading}
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>

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

        {error && (
          <div style={styles.error}>
            ⚠️ {error}
          </div>
        )}

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

      {result && (
        <div style={styles.resultCard}>
          <div style={styles.resultHeader}>
            <h2 style={styles.resultTitle}>✅ 분석 완료</h2>
          </div>

          <div style={styles.resultContent}>
            <div style={styles.resultMain}>
              <div style={styles.resultEmoji}>
                {getCryTypeEmoji(result.prediction)}
              </div>
              <div style={styles.resultType}>
                {getCryTypeLabel(result.prediction)}
              </div>
              <div style={styles.resultDescription}>
                {getCryTypeDescription(result.prediction)}
              </div>
            </div>

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

            {/* ✅ 디버그 정보 추가 */}
            {result.probabilities && (
              <div style={styles.debugInfo}>
                <div style={styles.debugHeader}>🔍 디버그 정보</div>
                <div style={styles.debugContent}>
                  <div style={styles.debugItem}>
                    <span style={styles.debugLabel}>모델 버전:</span>
                    <span style={styles.debugValue}>{result.model_version || 'v15.1'}</span>
                  </div>
                  <div style={styles.debugItem}>
                    <span style={styles.debugLabel}>분석 단계:</span>
                    <span style={styles.debugValue}>{result.probabilities.stage || result.stage || 'unknown'}</span>
                  </div>
                  <div style={styles.debugItem}>
                    <span style={styles.debugLabel}>확률 분포:</span>
                    <pre style={styles.debugPre}>
                      {JSON.stringify(result.probabilities, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            )}

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
  modeSelector: {
    display: 'flex',
    gap: '8px',
    marginBottom: '24px',
    padding: '4px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
  },
  modeButton: {
    flex: 1,
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    color: '#666',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeButtonActive: {
    backgroundColor: 'white',
    color: '#1976d2',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  recordingArea: {
    padding: '60px 20px',
    textAlign: 'center',
    backgroundColor: '#fafafa',
    borderRadius: '12px',
    border: '2px dashed #ccc',
    marginBottom: '24px',
  },
  recordIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
  recordPrompt: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '24px',
  },
  startRecordButton: {
    padding: '16px 32px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '24px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginBottom: '16px',
  },
  recordHint: {
    fontSize: '14px',
    color: '#999',
  },
  recordingActive: {
    padding: '40px 20px',
    textAlign: 'center',
    backgroundColor: '#fff3e0',
    borderRadius: '12px',
    border: '2px solid #ff9800',
    marginBottom: '24px',
  },
  recordingIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '18px',
    fontWeight: '600',
    color: '#f44336',
    marginBottom: '16px',
  },
  recordingDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    backgroundColor: '#f44336',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  recordingTimer: {
    fontSize: '48px',
    fontWeight: '700',
    color: '#333',
    marginBottom: '24px',
    fontFamily: 'monospace',
  },
  recordingControls: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '24px',
  },
  stopRecordButton: {
    padding: '12px 24px',
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  cancelRecordButton: {
    padding: '12px 24px',
    backgroundColor: '#757575',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  recordingWave: {
    fontSize: '24px',
    animation: 'wave 1s ease-in-out infinite',
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
  // ✅ 디버그 정보 스타일 추가
  debugInfo: {
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
    border: '1px solid #ddd',
  },
  debugHeader: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#666',
    marginBottom: '12px',
  },
  debugContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  debugItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  debugLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#888',
  },
  debugValue: {
    fontSize: '14px',
    color: '#333',
  },
  debugPre: {
    fontSize: '12px',
    color: '#333',
    backgroundColor: 'white',
    padding: '12px',
    borderRadius: '6px',
    overflow: 'auto',
    maxHeight: '200px',
    fontFamily: 'monospace',
    margin: 0,
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
