// src/MusicPlayer.js
import React, { useRef, useEffect } from 'react';

function MusicPlayer({ cryType, onClose }) {
  const audioRef = useRef(null);

  const musicMap = {
    tired: {
      file: '/music/lullaby-tired.mp3', // ✅ .mp3로 변경
      title: '자장가 - 아기 수면 음악',
      emoji: '😴',
    },
    emotional: {
      file: '/music/lullaby-emotional.mp3', // ✅ .mp3로 변경
      title: '자장가 - 어쿠스틱 기타',
      emoji: '🤗',
    },
  };

  const music = musicMap[cryType];

  useEffect(() => {
    if (audioRef.current && music) {
      // 자동 재생 시도
      audioRef.current.play().catch(err => {
        console.log('자동 재생 실패 (사용자 상호작용 필요):', err);
      });
    }

    return () => {
      // 컴포넌트 언마운트 시 음악 정지
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
  }, [music]);

  if (!music) {
    return null;
  }

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.player} onClick={(e) => e.stopPropagation()}>
        <button style={styles.closeButton} onClick={onClose}>
          ✕
        </button>

        <div style={styles.playerContent}>
          <div style={styles.musicIcon}>{music.emoji}</div>
          <h3 style={styles.musicTitle}>{music.title}</h3>

          <div style={styles.audioContainer}>
            <audio
              ref={audioRef}
              src={music.file}
              loop
              controls
              style={styles.audioPlayer}
            >
              브라우저가 오디오를 지원하지 않습니다.
            </audio>
          </div>

          <div style={styles.hint}>
            💡 음악을 들려주면 아기를 진정시키는데 도움이 됩니다
          </div>

          <div style={styles.controls}>
            <button 
              style={styles.controlButton} 
              onClick={handlePlayPause}
            >
              재생/일시정지
            </button>
            <button 
              style={{...styles.controlButton, backgroundColor: '#666'}} 
              onClick={onClose}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  player: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '40px',
    width: '90%',
    maxWidth: '600px',
    position: 'relative',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  closeButton: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: 'none',
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s',
  },
  playerContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
  },
  musicIcon: {
    fontSize: '64px',
  },
  musicTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#333',
    textAlign: 'center',
  },
  audioContainer: {
    width: '100%',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  audioPlayer: {
    width: '100%',
    outline: 'none',
  },
  hint: {
    fontSize: '13px',
    color: '#666',
    textAlign: 'center',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    width: '100%',
  },
  controls: {
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
  },
  controlButton: {
    padding: '12px 32px',
    backgroundColor: '#9c27b0',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default MusicPlayer;