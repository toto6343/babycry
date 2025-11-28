// src/HomePage.js
import React from 'react';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

function HomePage() {
  const { selectedInfant, user } = useAuth();
  const navigate = useNavigate();

  const features = [
    {
      icon: '🎤',
      title: '울음 분석',
      description: '아기의 울음 소리를 녹음하고 AI가 원인을 분석합니다',
      color: '#1976d2',
      path: '/upload',
    },
    {
      icon: '📊',
      title: '대시보드',
      description: '울음 이벤트와 조치 기록을 한눈에 확인하세요',
      color: '#388e3c',
      path: '/dashboard',
    },
    {
      icon: '📝',
      title: 'AI 보고서',
      description: '주간/월간 울음 패턴 분석 보고서를 자동 생성합니다',
      color: '#f57c00',
      path: '/reports',
    },
    {
      icon: '💬',
      title: '육아 상담',
      description: 'AI 챗봇과 육아 고민을 상담하세요',
      color: '#7b1fa2',
      path: '/chatbot',
    },
  ];

  const quickStats = [
    {
      icon: '👶',
      label: '등록된 아기',
      value: selectedInfant ? selectedInfant.name : '선택 필요',
      color: '#e91e63',
    },
    {
      icon: '🎯',
      label: '분석 정확도',
      value: '95%+',
      color: '#00bcd4',
    },
    {
      icon: '🤖',
      label: 'AI 모델',
      description: 'GPT-4 기반',
      color: '#673ab7',
    },
    {
      icon: '🎵',
      label: '진정 음악',
      description: '자동 재생',
      color: '#009688',
    },
  ];

  return (
    <div style={styles.container}>
      {/* 환영 섹션 */}
      <div style={styles.welcomeSection}>
        <div style={styles.welcomeContent}>
          <h1 style={styles.welcomeTitle}>
            안녕하세요, {user?.name || '보호자'}님! 👋
          </h1>
          <p style={styles.welcomeSubtitle}>
            {selectedInfant 
              ? `${selectedInfant.name}의 울음을 분석하고 최적의 육아 조언을 받아보세요`
              : '아기를 선택하고 울음 분석을 시작해보세요'}
          </p>
        </div>
        <div style={styles.welcomeIllustration}>
          <div style={styles.illustrationEmoji}>👶🍼</div>
        </div>
      </div>

      {/* 빠른 통계 */}
      <div style={styles.statsGrid}>
        {quickStats.map((stat, index) => (
          <div key={index} style={{
            ...styles.statCard,
            borderLeft: `4px solid ${stat.color}`,
          }}>
            <div style={styles.statIcon}>{stat.icon}</div>
            <div style={styles.statContent}>
              <div style={styles.statLabel}>{stat.label}</div>
              {stat.value && (
                <div style={{...styles.statValue, color: stat.color}}>
                  {stat.value}
                </div>
              )}
              {stat.description && (
                <div style={styles.statDescription}>{stat.description}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 주요 기능 */}
      <div style={styles.featuresSection}>
        <h2 style={styles.sectionTitle}>🎯 주요 기능</h2>
        <div style={styles.featuresGrid}>
          {features.map((feature, index) => (
            <div
              key={index}
              style={styles.featureCard}
              onClick={() => navigate(feature.path)}
            >
              <div style={{
                ...styles.featureIcon,
                backgroundColor: feature.color + '20',
              }}>
                <span style={{fontSize: '48px'}}>{feature.icon}</span>
              </div>
              <h3 style={styles.featureTitle}>{feature.title}</h3>
              <p style={styles.featureDescription}>{feature.description}</p>
              <button style={{
                ...styles.featureButton,
                backgroundColor: feature.color,
              }}>
                시작하기 →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 사용 방법 */}
      <div style={styles.howToSection}>
        <h2 style={styles.sectionTitle}>📖 사용 방법</h2>
        <div style={styles.stepsContainer}>
          <div style={styles.step}>
            <div style={styles.stepNumber}>1</div>
            <div style={styles.stepContent}>
              <h3 style={styles.stepTitle}>울음 녹음</h3>
              <p style={styles.stepDescription}>
                아기가 울 때 '울음 분석' 탭에서 녹음하세요
              </p>
            </div>
          </div>
          
          <div style={styles.stepArrow}>→</div>
          
          <div style={styles.step}>
            <div style={styles.stepNumber}>2</div>
            <div style={styles.stepContent}>
              <h3 style={styles.stepTitle}>AI 분석</h3>
              <p style={styles.stepDescription}>
                AI가 울음 원인을 자동으로 분석합니다
              </p>
            </div>
          </div>
          
          <div style={styles.stepArrow}>→</div>
          
          <div style={styles.step}>
            <div style={styles.stepNumber}>3</div>
            <div style={styles.stepContent}>
              <h3 style={styles.stepTitle}>조치 실행</h3>
              <p style={styles.stepDescription}>
                AI 추천 조치를 따라 아기를 돌보세요
              </p>
            </div>
          </div>
          
          <div style={styles.stepArrow}>→</div>
          
          <div style={styles.step}>
            <div style={styles.stepNumber}>4</div>
            <div style={styles.stepContent}>
              <h3 style={styles.stepTitle}>기록 & 분석</h3>
              <p style={styles.stepDescription}>
                결과를 기록하고 패턴을 분석하세요
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 팁 섹션 */}
      <div style={styles.tipsSection}>
        <h2 style={styles.sectionTitle}>💡 유용한 팁</h2>
        <div style={styles.tipsGrid}>
          <div style={styles.tipCard}>
            <div style={styles.tipIcon}>🎤</div>
            <h4 style={styles.tipTitle}>녹음 품질</h4>
            <p style={styles.tipText}>
              조용한 환경에서 아기와 가까운 거리에서 녹음하면 더 정확한 분석이 가능합니다.
            </p>
          </div>
          
          <div style={styles.tipCard}>
            <div style={styles.tipIcon}>📊</div>
            <h4 style={styles.tipTitle}>패턴 분석</h4>
            <p style={styles.tipText}>
              일주일 이상 꾸준히 기록하면 아기의 울음 패턴을 파악할 수 있습니다.
            </p>
          </div>
          
          <div style={styles.tipCard}>
            <div style={styles.tipIcon}>🎵</div>
            <h4 style={styles.tipTitle}>진정 음악</h4>
            <p style={styles.tipText}>
              졸림/감정적 울음일 때 자동으로 제공되는 자장가를 활용해보세요.
            </p>
          </div>
          
          <div style={styles.tipCard}>
            <div style={styles.tipIcon}>💬</div>
            <h4 style={styles.tipTitle}>육아 상담</h4>
            <p style={styles.tipText}>
              궁금한 점이 있다면 언제든 AI 챗봇에게 물어보세요.
            </p>
          </div>
        </div>
      </div>

      {/* CTA 섹션 */}
      {selectedInfant && (
        <div style={styles.ctaSection}>
          <div style={styles.ctaContent}>
            <h2 style={styles.ctaTitle}>지금 바로 시작해보세요!</h2>
            <p style={styles.ctaSubtitle}>
              {selectedInfant.name}의 울음을 분석하고 최적의 케어를 제공하세요
            </p>
            <button
              style={styles.ctaButton}
              onClick={() => navigate('/upload')}
            >
              🎤 울음 분석 시작하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  welcomeSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '48px',
    marginBottom: '32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  welcomeContent: {
    flex: 1,
  },
  welcomeTitle: {
    fontSize: '36px',
    margin: '0 0 16px 0',
    color: 'white',
  },
  welcomeSubtitle: {
    fontSize: '18px',
    margin: 0,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: '1.6',
  },
  welcomeIllustration: {
    marginLeft: '32px',
  },
  illustrationEmoji: {
    fontSize: '120px',
    textAlign: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginBottom: '48px',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  statIcon: {
    fontSize: '40px',
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: '700',
  },
  statDescription: {
    fontSize: '14px',
    color: '#999',
  },
  featuresSection: {
    marginBottom: '48px',
  },
  sectionTitle: {
    fontSize: '28px',
    margin: '0 0 24px 0',
    color: '#333',
  },
  featuresGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '24px',
  },
  featureCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '32px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  featureIcon: {
    width: '100px',
    height: '100px',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 20px',
  },
  featureTitle: {
    fontSize: '20px',
    margin: '0 0 12px 0',
    color: '#333',
  },
  featureDescription: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  featureButton: {
    width: '100%',
    padding: '12px 24px',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  howToSection: {
    marginBottom: '48px',
  },
  stepsContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  step: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  stepNumber: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    backgroundColor: '#1976d2',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '16px',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: '18px',
    margin: '0 0 8px 0',
    color: '#333',
  },
  stepDescription: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
    lineHeight: '1.5',
  },
  stepArrow: {
    fontSize: '32px',
    color: '#1976d2',
    margin: '0 20px',
  },
  tipsSection: {
    marginBottom: '48px',
  },
  tipsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
  },
  tipCard: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  tipIcon: {
    fontSize: '40px',
    marginBottom: '12px',
  },
  tipTitle: {
    fontSize: '16px',
    margin: '0 0 8px 0',
    color: '#333',
  },
  tipText: {
    fontSize: '14px',
    color: '#666',
    lineHeight: '1.6',
    margin: 0,
  },
  ctaSection: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  ctaContent: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  ctaTitle: {
    fontSize: '32px',
    margin: '0 0 16px 0',
    color: 'white',
  },
  ctaSubtitle: {
    fontSize: '18px',
    margin: '0 0 32px 0',
    color: 'rgba(255,255,255,0.9)',
  },
  ctaButton: {
    padding: '16px 48px',
    backgroundColor: 'white',
    color: '#667eea',
    border: 'none',
    borderRadius: '12px',
    fontSize: '18px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
    transition: 'transform 0.2s',
  },
};

export default HomePage;