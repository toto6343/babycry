// src/components/Textreport.js (Recharts 적용)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const TextReport = ({ infantId, startDate, endDate }) => {
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTextReport();
  }, [infantId, startDate, endDate]);

  const fetchTextReport = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('🤖 AI 텍스트 리포트 요청 시작');
      console.log('📋 infantId:', infantId);
      console.log('📋 startDate:', startDate);
      console.log('📋 endDate:', endDate);

      const response = await axios.get(
        `/api/reports/text/${infantId}`,
        {
          params: { startDate, endDate },
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      console.log('✅ AI 텍스트 리포트 응답:', response.data);
      setReportData(response.data);
    } catch (err) {
      console.error('❌ 텍스트 리포트 조회 실패:', err);
      setError('리포트를 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 텍스트를 섹션별로 파싱
  const parseReportText = (text) => {
    if (!text) return [];
    const sectionPattern = /\[([^\]]+)\]/g;
    const sections = [];
    const matches = [];
    let match;

    while ((match = sectionPattern.exec(text)) !== null) {
      matches.push({ title: match[1], index: match.index });
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];
      const endIndex = next ? next.index : text.length;
      const content = text.substring(current.index + current.title.length + 2, endIndex).trim();
      
      sections.push({ title: current.title, content });
    }

    return sections;
  };

  // 섹션 아이콘
  const getSectionIcon = (title) => {
    if (title.includes('요약')) return '📊';
    if (title.includes('패턴')) return '📈';
    if (title.includes('해석') || title.includes('상태')) return '🔍';
    if (title.includes('예측')) return '🔮';
    if (title.includes('추천') || title.includes('행동')) return '💡';
    return '📝';
  };

  // 차트 데이터 준비 (예시 - 실제 데이터로 교체 필요)
  const prepareChartData = () => {
    if (!reportData) return { dailyData: [], categoryData: [], severityData: [] };

    // 1. 일별 울음 횟수 (예시)
    const dailyData = [
      { date: '월', count: 8, avgDuration: 5.2 },
      { date: '화', count: 6, avgDuration: 4.8 },
      { date: '수', count: 10, avgDuration: 6.1 },
      { date: '목', count: 7, avgDuration: 5.5 },
      { date: '금', count: 9, avgDuration: 5.8 },
      { date: '토', count: 5, avgDuration: 4.5 },
      { date: '일', count: 4, avgDuration: 4.2 },
    ];

    // 2. 카테고리별 분포 (예시)
    const categoryData = [
      { name: '배고픔', value: 35, color: '#667eea' },
      { name: '졸림', value: 25, color: '#764ba2' },
      { name: '불편함', value: 20, color: '#f093fb' },
      { name: '통증', value: 15, color: '#4facfe' },
      { name: '기타', value: 5, color: '#43e97b' },
    ];

    // 3. 심각도별 분포 (예시)
    const severityData = [
      { name: '낮음', value: 40 },
      { name: '중간', value: 45 },
      { name: '높음', value: 15 },
    ];

    return { dailyData, categoryData, severityData };
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>AI가 상세 리포트를 생성하고 있습니다...</p>
          <p style={styles.loadingSubtext}>데이터 분석 중 (최대 30초 소요)</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>⚠️ {error}</p>
          <button onClick={fetchTextReport} style={styles.retryButton}>
            🔄 다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!reportData || !reportData.reportText) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>
          <p>⚠️ 리포트 데이터가 없습니다.</p>
          <button onClick={fetchTextReport} style={styles.retryButton}>
            🔄 다시 시도
          </button>
        </div>
      </div>
    );
  }

  const sections = parseReportText(reportData.reportText);
  const { dailyData, categoryData, severityData } = prepareChartData();

  return (
    <div style={styles.container}>
      <div style={styles.wrapper}>
        {/* 커버 페이지 */}
        <div style={styles.coverPage}>
          <div style={styles.coverBadge}>BabyCry Analysis Report</div>
          <h1 style={styles.coverTitle}>
            아기 울음 분석<br/>상세 리포트
          </h1>
          <p style={styles.coverPeriod}>{reportData.period}</p>
          <div style={styles.coverMeta}>
            <div>
              <div style={styles.metaLabel}>분석 영아</div>
              <div style={styles.metaValue}>ID {reportData.infantId}</div>
            </div>
            <div>
              <div style={styles.metaLabel}>생성 일시</div>
              <div style={styles.metaValue}>
                {new Date(reportData.generatedAt).toLocaleString('ko-KR')}
              </div>
            </div>
          </div>
        </div>

        {/* 핵심 지표 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>📊 핵심 지표 요약</h2>
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>😢</div>
              <div>
                <div style={styles.kpiLabel}>총 울음 횟수</div>
                <div style={styles.kpiValue}>{reportData.summaryData.totalEvents} 회</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>⏱️</div>
              <div>
                <div style={styles.kpiLabel}>평균 울음 시간</div>
                <div style={styles.kpiValue}>{reportData.summaryData.avgDurationFormatted}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>📈</div>
              <div>
                <div style={styles.kpiLabel}>총 울음 시간</div>
                <div style={styles.kpiValue}>{reportData.summaryData.totalDurationFormatted}</div>
              </div>
            </div>
            <div style={styles.kpiCard}>
              <div style={styles.kpiIcon}>⚠️</div>
              <div>
                <div style={styles.kpiLabel}>최대 심각도</div>
                <div style={styles.kpiValue}>
                  {reportData.summaryData.maxSeverity === 'High' ? '높음' :
                   reportData.summaryData.maxSeverity === 'Medium' ? '중간' : '낮음'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 차트 섹션 1: 일별 울음 추이 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <span style={styles.sectionIcon}>📈</span>
            일별 울음 추이
          </h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={dailyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" style={{ fontSize: '16px' }} />
              <YAxis style={{ fontSize: '16px' }} />
              <Tooltip contentStyle={{ fontSize: '16px' }} />
              <Legend wrapperStyle={{ fontSize: '16px' }} />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#667eea" 
                strokeWidth={3}
                name="울음 횟수"
                dot={{ r: 5 }}
              />
              <Line 
                type="monotone" 
                dataKey="avgDuration" 
                stroke="#764ba2" 
                strokeWidth={3}
                name="평균 지속시간(분)"
                dot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 차트 섹션 2: 카테고리별 분포 */}
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>
            <span style={styles.sectionIcon}>🥧</span>
            울음 원인 분포
          </h2>
          <div style={styles.chartRow}>
            <ResponsiveContainer width="50%" height={350}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: '16px' }} />
              </PieChart>
            </ResponsiveContainer>
            
            <ResponsiveContainer width="50%" height={350}>
              <BarChart data={severityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" style={{ fontSize: '16px' }} />
                <YAxis style={{ fontSize: '16px' }} />
                <Tooltip contentStyle={{ fontSize: '16px' }} />
                <Legend wrapperStyle={{ fontSize: '16px' }} />
                <Bar dataKey="value" fill="#667eea" name="발생 횟수" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI 분석 보고서 */}
        {sections.map((section, index) => (
          <div key={index} style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <span style={styles.sectionIcon}>{getSectionIcon(section.title)}</span>
              {section.title}
            </h2>
            <div style={styles.sectionContent}>
              {section.content.split('\n').map((paragraph, pIndex) => (
                paragraph.trim() && (
                  <p key={pIndex} style={styles.paragraph}>
                    {paragraph}
                  </p>
                )
              ))}
            </div>
          </div>
        ))}

        {/* 보호자 조치 */}
        {reportData.summaryData.topActions && reportData.summaryData.topActions.length > 0 && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>👨‍👩‍👧 보호자 조치 분석</h2>
            <div style={styles.actionsGrid}>
              {reportData.summaryData.topActions.map((action, idx) => (
                <div key={idx} style={styles.actionCard}>
                  <div style={styles.actionRank}>#{idx + 1}</div>
                  <div style={styles.actionContent}>
                    <div style={styles.actionName}>{action.label}</div>
                    <div style={styles.actionStats}>
                      <span>실행 횟수: {action.count}회</span>
                      <span>효과도: {(action.avgEffectiveness * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div style={styles.footer}>
          <div style={styles.footerLogo}>BabyCry</div>
          <p>본 리포트는 AI 기반 울음 분석 시스템을 통해 자동 생성되었습니다.</p>
          <p style={styles.disclaimer}>
            ⚠️ 이 리포트는 참고용이며, 의학적 진단을 대체할 수 없습니다.
          </p>
        </div>

        {/* 액션 버튼 */}
        <div style={styles.actions}>
          <button onClick={fetchTextReport} style={styles.refreshButton}>
            🔄 리포트 새로고침
          </button>
          <button onClick={() => window.print()} style={styles.printButton}>
            🖨️ 인쇄하기
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
  },
  loading: {
    textAlign: 'center',
    padding: '80px 20px',
    backgroundColor: 'white',
    borderRadius: '16px',
  },
  spinner: {
    width: '60px',
    height: '60px',
    margin: '0 auto 24px',
    border: '5px solid #f3f3f3',
    borderTop: '5px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingSubtext: {
    fontSize: '16px',
    color: '#999',
    marginTop: '8px',
  },
  error: {
    padding: '32px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '16px',
    textAlign: 'center',
    fontSize: '18px',
  },
  retryButton: {
    marginTop: '16px',
    padding: '12px 24px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: '600',
  },
  wrapper: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  },
  coverPage: {
    padding: '80px 40px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderRadius: '16px',
    color: 'white',
    marginBottom: '40px',
  },
  coverBadge: {
    display: 'inline-block',
    padding: '8px 20px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '20px',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '32px',
  },
  coverTitle: {
    fontSize: '56px',
    fontWeight: '800',
    lineHeight: '1.2',
    marginBottom: '24px',
  },
  coverPeriod: {
    fontSize: '26px',
    marginBottom: '40px',
  },
  coverMeta: {
    display: 'flex',
    gap: '40px',
  },
  metaLabel: {
    fontSize: '16px',
    opacity: 0.8,
    marginBottom: '4px',
  },
  metaValue: {
    fontSize: '20px',
    fontWeight: '700',
  },
  section: {
    marginBottom: '40px',
    padding: '32px',
    backgroundColor: '#f9f9f9',
    borderRadius: '12px',
  },
  sectionTitle: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  sectionIcon: {
    fontSize: '36px',
  },
  sectionContent: {
    lineHeight: '1.9',
  },
  paragraph: {
    fontSize: '25px',
    color: '#333',
    marginBottom: '18px',
  },
  chartRow: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  kpiCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '24px',
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  kpiIcon: {
    fontSize: '48px',
  },
  kpiLabel: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '8px',
  },
  kpiValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#667eea',
  },
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: '20px',
  },
  actionCard: {
    display: 'flex',
    gap: '16px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '12px',
  },
  actionRank: {
    width: '44px',
    height: '44px',
    backgroundColor: '#667eea',
    color: 'white',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: '800',
    flexShrink: 0,
  },
  actionContent: {
    flex: 1,
  },
  actionName: {
    fontSize: '20px',
    fontWeight: '700',
    marginBottom: '8px',
  },
  actionStats: {
    fontSize: '16px',
    color: '#666',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  footer: {
    marginTop: '60px',
    padding: '32px',
    backgroundColor: '#f5f5f5',
    borderRadius: '12px',
    textAlign: 'center',
    fontSize: '15px',
  },
  footerLogo: {
    fontSize: '32px',
    fontWeight: '800',
    color: '#667eea',
    marginBottom: '16px',
  },
  disclaimer: {
    fontSize: '14px',
    color: '#666',
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#fff3cd',
    borderRadius: '8px',
  },
  actions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginTop: '32px',
  },
  refreshButton: {
    padding: '14px 28px',
    fontSize: '18px',
    fontWeight: '600',
    backgroundColor: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  printButton: {
    padding: '14px 28px',
    fontSize: '18px',
    fontWeight: '600',
    backgroundColor: '#4caf50',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

// 스피너 애니메이션
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default TextReport;