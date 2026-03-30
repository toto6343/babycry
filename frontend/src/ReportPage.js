// src/ReportPage.js
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import axios from 'axios';
import TextReport from './components/Textreport';
import CryChart from './components/CryChart'; // ✅ 추가

function ReportPage() {
  const { selectedInfant } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  
  // ✅ 탭 상태 추가
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'aiReport'

  // ✅ 커뮤니티 통계 상태 추가
  const [communityStats, setCommunityStats] = useState(null);

  useEffect(() => {
    if (selectedInfant?.infantId && activeTab === 'summary') {
      fetchReport();
    }
  }, [selectedInfant]);

  const fetchReport = async () => {
    if (!selectedInfant?.infantId) {
      setError('아기를 선택해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      console.log('🔍 ===== Report 요청 시작 =====');
      console.log('📋 infantId:', selectedInfant.infantId);
      console.log('📋 infantName:', selectedInfant.name);
      console.log('📋 dateRange:', dateRange);
      console.log('📋 hasToken:', !!token);
      console.log('📋 요청 URL:', `/api/reports/summary/${selectedInfant.infantId}`);

      const response = await axios.get(`/api/reports/summary/${selectedInfant.infantId}`, {
        params: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate
        }
      });
      
      console.log('✅ ===== Report 응답 성공 =====');
      
      setReport(response.data);

      // ✅ 커뮤니티 데이터 로드
      try {
        const ageMonths = selectedInfant.ageMonths || 3; // 기본값
        const cRes = await axios.get(`/api/community/stats/${ageMonths}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (cRes.data.success) setCommunityStats(cRes.data.stats);
      } catch (cErr) {
        console.error('커뮤니티 통계 로드 실패', cErr);
      }

    } catch (err) {
      console.error('❌ ===== Report 요청 실패 =====');
      console.error('📋 에러 객체:', err);
      console.error('📋 응답 상태:', err.response?.status);
      console.error('📋 응답 데이터:', err.response?.data);
      
      if (err.response?.status === 401) {
        setError('인증이 만료되었습니다. 다시 로그인해주세요.');
      } else if (err.response?.status === 404) {
        setError('리포트 API를 찾을 수 없습니다. 서버를 확인해주세요.');
      } else if (err.response?.status === 500) {
        setError(`서버 오류: ${err.response?.data?.message || '알 수 없는 오류'}`);
      } else {
        setError('리포트를 불러오는데 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity) => {
    const icons = {
      success: '✅',
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌'
    };
    return icons[severity] || 'ℹ️';
  };

  const getSeverityColor = (severity) => {
    const colors = {
      success: '#e8f5e9',
      info: '#e3f2fd',
      warning: '#fff3e0',
      error: '#ffebee'
    };
    return colors[severity] || '#f5f5f5';
  };

  const getSeverityBorderColor = (severity) => {
    const colors = {
      success: '#4caf50',
      info: '#2196f3',
      warning: '#ff9800',
      error: '#f44336'
    };
    return colors[severity] || '#9e9e9e';
  };

  const getCryTypeEmoji = (cryType) => {
    const emojis = {
      belly_pain: '🤕',
      cold_hot: '🌡️',
      burping: '😮',
      discomfort: '😣',
      hungry: '🍼',
      tired: '😴',
      emotional: '🤗',
      needs_attention: '👋'
    };
    return emojis[cryType] || '👶';
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return '0초';
    
    if (seconds < 60) {
      return `${Math.round(seconds)}초`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return secs > 0 ? `${mins}분 ${secs}초` : `${mins}분`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return mins > 0 ? `${hours}시간 ${mins}분` : `${hours}시간`;
    }
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
    const labelMap = {
      hungry: '배고픔',
      tired: '졸림',
      uncomfortable: '불편함',
      pain: '통증',
      emotional: '감정적',
    };
    return labelMap[max[0]] || max[0];
  };

  if (!selectedInfant?.infantId) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📊</div>
          <h2 style={styles.emptyTitle}>아기를 선택해주세요</h2>
          <p style={styles.emptyText}>리포트를 보려면 먼저 아기를 선택해야 합니다.</p>
        </div>
      </div>
    );
  }

  const stats = report ? {
    totalEvents: report.summary.totalEvents,
    resolvedEvents: report.byCryType ? report.byCryType.reduce((sum, type) => sum + type.count, 0) : 0,
    avgConfidence: 85, // 임시값
    mostCommonType: report.byCryType && report.byCryType.length > 0 ? report.byCryType[0].label : '-',
  } : null;

  return (
    <div style={styles.container}>
      {/* 헤더 */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📊 울음 분석 리포트</h1>
          <p style={styles.subtitle}>{selectedInfant.name}의 울음 패턴 종합 분석 보고서</p>
        </div>
      </div>

      {/* ✅ 탭 네비게이션 */}
      <div style={styles.tabContainer}>
        <button
          onClick={() => setActiveTab('summary')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'summary' ? styles.tabButtonActive : {})
          }}
        >
          📈 요약 리포트
        </button>
        <button
          onClick={() => setActiveTab('aiReport')}
          style={{
            ...styles.tabButton,
            ...(activeTab === 'aiReport' ? styles.tabButtonActive : {})
          }}
        >
          🤖 AI 상세 보고서
        </button>
      </div>

      {/* 날짜 선택 */}
      <div style={styles.filterCard}>
        <div style={styles.dateInputGroup}>
          <div style={styles.dateInput}>
            <label style={styles.dateLabel}>📅 시작일</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              style={styles.dateField}
            />
          </div>
          <div style={styles.dateSeparator}>~</div>
          <div style={styles.dateInput}>
            <label style={styles.dateLabel}>📅 종료일</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              style={styles.dateField}
            />
          </div>
          <button 
            onClick={fetchReport} 
            style={styles.searchButton} 
            disabled={loading}
          >
            {loading ? '⏳ 조회 중...' : '🔍 리포트 생성'}
          </button>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && activeTab === 'summary' && (
        <div style={styles.errorBox}>
          ⚠️ {error}
        </div>
      )}

      {/* ✅ 탭별 콘텐츠 */}
      {activeTab === 'summary' ? (
        <>
          {/* 로딩 */}
          {loading && (
            <div style={styles.loadingBox}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>데이터를 분석하고 있습니다...</p>
            </div>
          )}

          {/* 리포트 내용 */}
          {!loading && report && (
            <>
              {/* 전체 요약 섹션 */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>📈 기간 요약</h2>
                  <p style={styles.sectionSubtitle}>전체 울음 통계 한눈에 보기</p>
                </div>
                <div style={styles.summaryGrid}>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>🔢</div>
                    <div style={styles.summaryContent}>
                      <div style={styles.summaryLabel}>총 울음 횟수</div>
                      <div style={styles.summaryValue}>{report.summary.totalEvents}<span style={styles.summaryUnit}>회</span></div>
                      <div style={styles.summaryDesc}>분석 기간 동안 발생한 전체 울음</div>
                    </div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>⏱️</div>
                    <div style={styles.summaryContent}>
                      <div style={styles.summaryLabel}>총 울음 시간</div>
                      <div style={styles.summaryValue}>{report.summary.totalDurationFormatted}</div>
                      <div style={styles.summaryDesc}>누적된 울음 지속 시간</div>
                    </div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>📊</div>
                    <div style={styles.summaryContent}>
                      <div style={styles.summaryLabel}>평균 울음 시간</div>
                      <div style={styles.summaryValue}>{report.summary.avgDurationFormatted}</div>
                      <div style={styles.summaryDesc}>한 번 울 때 평균 지속 시간</div>
                    </div>
                  </div>
                  <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>⏰</div>
                    <div style={styles.summaryContent}>
                      <div style={styles.summaryLabel}>최대 울음 시간</div>
                      <div style={styles.summaryValue}>{formatDuration(report.summary.maxDurationSeconds)}</div>
                      <div style={styles.summaryDesc}>가장 길게 분석된 울음</div>
                    </div>
                  </div>
                  </div>
                  </div>

                  {/* ✅ 데이터 시각화 섹션 추가 */}
                  {report.events && report.events.length > 0 && (
                  <CryChart data={report.events} />
                  )}

                  {/* ✅ 커뮤니티 통계 비교 섹션 추가 */}
                  {communityStats && (
                    <div style={styles.section}>
                      <div style={styles.sectionHeader}>
                        <h2 style={styles.sectionTitle}>🌍 나와 비슷한 부모들은?</h2>
                        <p style={styles.sectionSubtitle}>내 아기와 같은 월령({selectedInfant?.ageMonths || 3}개월) 또래들의 평균 데이터입니다.</p>
                      </div>
                      <div style={{display: 'flex', gap: '15px'}}>
                        {communityStats.map((stat, i) => (
                          <div key={i} style={{flex: 1, backgroundColor: '#f0f4f8', padding: '15px', borderRadius: '12px', textAlign: 'center'}}>
                            <div style={{fontSize: '30px', marginBottom: '10px'}}>{getCryTypeEmoji(stat.type)}</div>
                            <div style={{fontSize: '14px', color: '#555'}}>{stat.type}</div>
                            <div style={{fontSize: '22px', fontWeight: 'bold', color: '#1976d2'}}>{stat.percentage}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 시간대별 분석 섹션 */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>🍼 울음 유형별 분석</h2>
                  <p style={styles.sectionSubtitle}>어떤 이유로 가장 많이 울었을까요?</p>
                </div>
                <div style={styles.typeGrid}>
                  {report.byCryType.map((type, index) => (
                    <div key={index} style={styles.typeCard}>
                      <div style={styles.typeHeader}>
                        <span style={styles.typeEmoji}>{getCryTypeEmoji(type.cryType)}</span>
                        <div style={styles.typeHeaderText}>
                          <span style={styles.typeName}>{type.label}</span>
                          <span style={styles.typeCount}>{type.count}회 발생</span>
                        </div>
                      </div>
                      <div style={styles.typeStats}>
                        <div style={styles.typeStat}>
                          <span style={styles.typeStatLabel}>📊 전체 비율</span>
                          <span style={styles.typeStatValue}>{type.percentage}%</span>
                        </div>
                        <div style={styles.typeStat}>
                          <span style={styles.typeStatLabel}>⏱️ 평균 시간</span>
                          <span style={styles.typeStatValue}>{type.avgDurationFormatted}</span>
                        </div>
                      </div>
                      <div style={styles.typeBar}>
                        <div 
                          style={{
                            ...styles.typeBarFill,
                            width: `${type.percentage}%`,
                            backgroundColor: index === 0 ? '#f44336' : index === 1 ? '#ff9800' : '#4caf50'
                          }}
                        >
                          <span style={styles.typeBarLabel}>{type.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 시간대별 분석 */}
              <div style={styles.section}>
                <div style={styles.sectionHeader}>
                  <h2 style={styles.sectionTitle}>🕐 시간대별 울음 분포</h2>
                  <p style={styles.sectionSubtitle}>하루 중 어느 시간에 가장 많이 울었나요?</p>
                </div>
                <div style={styles.chartCard}>
                  <div style={styles.hourChart}>
                    {report.byHour.map((hour, index) => {
                      const maxCount = Math.max(...report.byHour.map(h => h.count));
                      const height = maxCount > 0 ? (hour.count / maxCount) * 100 : 0;
                      
                      return (
                        <div key={index} style={styles.hourBar}>
                          <div 
                            style={{
                              ...styles.hourBarFill,
                              height: `${height}%`,
                              backgroundColor: height > 70 ? '#f44336' : height > 40 ? '#ff9800' : '#4caf50'
                            }}
                            title={`${hour.hour}시: ${hour.count}회`}
                          >
                            {hour.count > 0 && (
                              <span style={styles.hourBarLabel}>{hour.count}</span>
                            )}
                          </div>
                          <div style={styles.hourLabel}>{hour.hour}시</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 심각도별 통계 */}
              {report.bySeverity && report.bySeverity.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <h2 style={styles.sectionTitle}>⚠️ 심각도별 분석</h2>
                    <p style={styles.sectionSubtitle}>울음의 긴급도를 분류했습니다</p>
                  </div>
                  <div style={styles.severityGrid}>
                    {report.bySeverity.map((sev, index) => (
                      <div key={index} style={styles.severityCard}>
                        <div style={styles.severityHeader}>
                          <span style={{
                            ...styles.severityBadge,
                            backgroundColor: 
                              sev.severity === 'High' ? '#f44336' :
                              sev.severity === 'Medium' ? '#ff9800' : '#4caf50'
                          }}>
                            {sev.severity === 'High' ? '🔴 높음' : 
                             sev.severity === 'Medium' ? '🟠 보통' : '🟢 낮음'}
                          </span>
                        </div>
                        <div style={styles.severityStats}>
                          <div style={styles.severityCount}>{sev.count}<span style={styles.severityUnit}>회</span></div>
                          <div style={styles.severityPercentage}>전체의 {sev.percentage}%</div>
                          <div style={styles.severityAvg}>평균 {formatDuration(sev.avgDurationSeconds)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 효과적인 조치 */}
              {report.topActions && report.topActions.length > 0 && (
                <div style={styles.section}>
                  <div style={styles.sectionHeader}>
                    <h2 style={styles.sectionTitle}>🎯 효과적인 조치 Top 5</h2>
                    <p style={styles.sectionSubtitle}>가장 자주 시도하고 효과적이었던 방법들</p>
                  </div>
                  <div style={styles.actionsTable}>
                    {report.topActions.map((action, index) => (
                      <div key={index} style={styles.actionRow}>
                        <div style={styles.actionRank}>
                          <div style={styles.rankNumber}>{index + 1}</div>
                          <div style={styles.rankLabel}>위</div>
                        </div>
                        <div style={styles.actionInfo}>
                          <div style={styles.actionName}>{action.label}</div>
                          <div style={styles.actionStats}>
                            <span style={styles.actionCount}>📊 {action.count}회 사용</span>
                            <span style={styles.actionDivider}>•</span>
                            <span style={styles.actionEffectiveness}>
                              ⭐ 효과도 {action.avgEffectiveness.toFixed(1)}/1.0
                            </span>
                          </div>
                        </div>
                        <div style={styles.actionScore}>
                          <div style={styles.scoreBar}>
                            <div 
                              style={{
                                ...styles.scoreBarFill,
                                width: `${(action.avgEffectiveness) * 100}%`
                              }}
                            ></div>
                          </div>
                          <div style={styles.scoreText}>{(action.avgEffectiveness * 100).toFixed(0)}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        // ✅ AI 상세 보고서 탭
        <TextReport
          infantId={selectedInfant.infantId}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
        />
      )}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '24px',
  },
  header: {
    marginBottom: '32px',
  },
  title: {
    fontSize: '48px',
    fontWeight: '800',
    margin: '0 0 12px 0',
    color: '#1a1a1a',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '22px',
    color: '#666',
    margin: 0,
    fontWeight: '500',
  },
  // ✅ 탭 스타일
  tabContainer: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
    borderBottom: '2px solid #e0e0e0',
    paddingBottom: '0',
  },
  tabButton: {
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: '600',
    backgroundColor: 'transparent',
    color: '#666',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '-2px',
  },
  tabButtonActive: {
    color: '#1976d2',
    borderBottomColor: '#1976d2',
    fontWeight: '700',
  },
  emptyState: {
    textAlign: 'center',
    padding: '120px 20px',
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  emptyIcon: {
    fontSize: '100px',
    marginBottom: '32px',
  },
  emptyTitle: {
    fontSize: '36px',
    margin: '0 0 20px 0',
    color: '#333',
    fontWeight: '700',
  },
  emptyText: {
    fontSize: '20px',
    color: '#666',
  },
  filterCard: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '32px',
    marginBottom: '32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  dateInputGroup: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '20px',
    flexWrap: 'wrap',
  },
  dateInput: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  dateLabel: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#333',
  },
  dateField: {
    padding: '14px 18px',
    fontSize: '18px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  dateSeparator: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#999',
    paddingBottom: '14px',
  },
  searchButton: {
    padding: '14px 40px',
    fontSize: '18px',
    fontWeight: '700',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)',
  },
  errorBox: {
    padding: '24px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '16px',
    fontSize: '18px',
    marginBottom: '32px',
    fontWeight: '600',
  },
  loadingBox: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: 'white',
    borderRadius: '20px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  spinner: {
    width: '60px',
    height: '60px',
    margin: '0 auto 24px',
    border: '5px solid #f3f3f3',
    borderTop: '5px solid #1976d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    fontSize: '22px',
    color: '#333',
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '20px',
    padding: '40px',
    marginBottom: '32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  sectionHeader: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '36px',
    fontWeight: '800',
    margin: '0 0 12px 0',
    color: '#1a1a1a',
  },
  sectionSubtitle: {
    fontSize: '18px',
    color: '#666',
    margin: 0,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  summaryCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '32px',
    backgroundColor: '#f8f9fa',
    borderRadius: '16px',
    border: '2px solid #e9ecef',
  },
  summaryIcon: {
    fontSize: '56px',
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '8px',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: '36px',
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: '4px',
  },
  summaryUnit: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#999',
    marginLeft: '4px',
  },
  summaryDesc: {
    fontSize: '14px',
    color: '#999',
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '24px',
  },
  typeCard: {
    padding: '32px',
    backgroundColor: '#fafafa',
    borderRadius: '16px',
    border: '2px solid #e0e0e0',
  },
  typeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
  },
  typeEmoji: {
    fontSize: '48px',
  },
  typeHeaderText: {
    flex: 1,
  },
  typeName: {
    display: 'block',
    fontSize: '26px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  typeCount: {
    display: 'block',
    fontSize: '16px',
    color: '#666',
    marginTop: '4px',
  },
  typeStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '20px',
  },
  typeStat: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  typeStatLabel: {
    fontSize: '17px',
    color: '#666',
    fontWeight: '600',
  },
  typeStatValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#1a1a1a',
  },
  typeBar: {
    height: '16px',
    backgroundColor: '#e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  typeBarFill: {
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: '8px',
  },
  typeBarLabel: {
    fontSize: '13px',
    fontWeight: '700',
    color: 'white',
  },
  chartCard: {
    padding: '32px',
    backgroundColor: '#fafafa',
    borderRadius: '16px',
  },
  hourChart: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '350px',
    gap: '6px',
  },
  hourBar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
  },
  hourBarFill: {
    width: '100%',
    borderRadius: '6px 6px 0 0',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '6px',
    marginTop: 'auto',
    minHeight: '24px',
  },
  hourBarLabel: {
    fontSize: '14px',
    fontWeight: '700',
    color: 'white',
  },
  hourLabel: {
    fontSize: '15px',
    color: '#666',
    marginTop: '10px',
    fontWeight: '600',
  },
  severityGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '24px',
  },
  severityCard: {
    padding: '32px',
    backgroundColor: '#fafafa',
    borderRadius: '16px',
    textAlign: 'center',
    border: '2px solid #e0e0e0',
  },
  severityHeader: {
    marginBottom: '20px',
  },
  severityBadge: {
    display: 'inline-block',
    padding: '12px 28px',
    borderRadius: '24px',
    color: 'white',
    fontSize: '18px',
    fontWeight: '700',
  },
  severityStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  severityCount: {
    fontSize: '42px',
    fontWeight: '800',
    color: '#1a1a1a',
  },
  severityUnit: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#999',
    marginLeft: '4px',
  },
  severityPercentage: {
    fontSize: '20px',
    color: '#666',
    fontWeight: '600',
  },
  severityAvg: {
    fontSize: '17px',
    color: '#999',
  },
  actionsTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  actionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    padding: '28px',
    backgroundColor: '#fafafa',
    borderRadius: '16px',
    border: '2px solid #e0e0e0',
  },
  actionRank: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: '#1976d2',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rankNumber: {
    fontSize: '28px',
    fontWeight: '800',
    lineHeight: '1',
  },
  rankLabel: {
    fontSize: '14px',
    fontWeight: '600',
  },
  actionInfo: {
    flex: 1,
  },
  actionName: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '8px',
  },
  actionStats: {
    fontSize: '17px',
    color: '#666',
  },
  actionCount: {
    marginRight: '8px',
  },
  actionDivider: {
    margin: '0 12px',
    color: '#ccc',
  },
  actionEffectiveness: {
    marginLeft: '8px',
  },
  actionScore: {
    width: '240px',
    flexShrink: 0,
  },
  scoreBar: {
    height: '28px',
    backgroundColor: '#e0e0e0',
    borderRadius: '14px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  scoreBarFill: {
    height: '100%',
    backgroundColor: '#4caf50',
  },
  scoreText: {
    fontSize: '16px',
    fontWeight: '700',
    color: '#666',
    textAlign: 'center',
  },
};

export default ReportPage;
