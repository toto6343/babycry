// src/ReportPage.js
import React, { useState, useEffect } from 'react';
import { reportAPI } from './api';
import { useAuth } from './AuthContext';

function ReportPage() {
  const { selectedInfant } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [expandedReport, setExpandedReport] = useState(null);

  useEffect(() => {
    loadReports();
  }, [selectedInfant]);

  const loadReports = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await reportAPI.getAll(selectedInfant.infantId);
      setReports(response.data || []);
    } catch (err) {
      console.error('Error loading reports:', err);
      setError('보고서를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = async () => {
    if (!window.confirm('새로운 보고서를 생성하시겠습니까?')) return;

    try {
      setGenerating(true);
      setError('');
      await reportAPI.generate(selectedInfant.infantId);
      
      // 보고서 생성 후 목록 새로고침
      await loadReports();
      
      alert('✅ 보고서가 성공적으로 생성되었습니다!');
    } catch (err) {
      console.error('Error generating report:', err);
      setError('보고서 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📝 AI 자동 보고서</h1>
          <p style={styles.subtitle}>
            {selectedInfant.name}의 울음 패턴과 육아 인사이트를 분석한 보고서
          </p>
        </div>
        <button
          onClick={handleGenerateReport}
          disabled={generating}
          style={{
            ...styles.generateButton,
            opacity: generating ? 0.6 : 1,
            cursor: generating ? 'not-allowed' : 'pointer',
          }}
        >
          {generating ? (
            <>
              <span style={styles.buttonSpinner}></span>
              생성 중...
            </>
          ) : (
            '🤖 새 보고서 생성'
          )}
        </button>
      </div>

      {error && (
        <div style={styles.error}>
          ⚠️ {error}
          <button onClick={loadReports} style={styles.retryButton}>
            다시 시도
          </button>
        </div>
      )}

      {reports.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📄</div>
          <h3>아직 생성된 보고서가 없습니다</h3>
          <p>위의 '새 보고서 생성' 버튼을 클릭하여 첫 보고서를 만들어보세요</p>
          <div style={styles.emptyHint}>
            <strong>💡 보고서에는 다음 내용이 포함됩니다:</strong>
            <ul style={styles.hintList}>
              <li>울음 패턴 분석</li>
              <li>주요 울음 원인 통계</li>
              <li>조치 효과 분석</li>
              <li>육아 개선 제안</li>
            </ul>
          </div>
        </div>
      ) : (
        <div style={styles.reportsGrid}>
          {reports.map((report) => (
            <ReportCard
              key={report.reportId}
              report={report}
              expanded={expandedReport === report.reportId}
              onToggle={() => 
                setExpandedReport(
                  expandedReport === report.reportId ? null : report.reportId
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 보고서 카드 컴포넌트
function ReportCard({ report, expanded, onToggle }) {
  return (
    <div style={styles.reportCard}>
      {/* 보고서 헤더 */}
      <div style={styles.reportHeader} onClick={onToggle}>
        <div style={styles.reportHeaderLeft}>
          <div style={styles.reportIcon}>📊</div>
          <div style={styles.reportInfo}>
            <div style={styles.reportTitle}>
              {new Date(report.createdAt).toLocaleDateString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })} 보고서
            </div>
            <div style={styles.reportDate}>
              생성: {new Date(report.createdAt).toLocaleString('ko-KR')}
            </div>
          </div>
        </div>
        <button style={styles.expandButton}>
          {expanded ? '▲ 접기' : '▼ 펼치기'}
        </button>
      </div>

      {/* 보고서 내용 */}
      {expanded && (
        <div style={styles.reportContent}>
          <div style={styles.reportSummary}>
            {report.summary || report.content || '보고서 내용이 없습니다.'}
          </div>

          {/* 보고서 메타 정보 */}
          {report.metadata && (
            <div style={styles.metadata}>
              <h4 style={styles.metadataTitle}>📈 주요 지표</h4>
              <div style={styles.metadataGrid}>
                {Object.entries(report.metadata).map(([key, value]) => (
                  <div key={key} style={styles.metadataItem}>
                    <span style={styles.metadataKey}>{formatMetadataKey(key)}:</span>
                    <span style={styles.metadataValue}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 메타데이터 키 포맷팅
function formatMetadataKey(key) {
  const keyMap = {
    totalEvents: '전체 이벤트',
    avgConfidence: '평균 신뢰도',
    mostCommonCry: '가장 많은 울음',
    successRate: '조치 성공률',
  };
  return keyMap[key] || key;
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    gap: '20px',
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
  generateButton: {
    padding: '14px 24px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
  buttonSpinner: {
    width: '16px',
    height: '16px',
    border: '2px solid #ffffff',
    borderTop: '2px solid transparent',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
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
    marginBottom: '24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  retryButton: {
    padding: '8px 16px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '80px 40px',
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  },
  emptyIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  emptyHint: {
    marginTop: '32px',
    padding: '24px',
    backgroundColor: '#e3f2fd',
    borderRadius: '12px',
    textAlign: 'left',
  },
  hintList: {
    margin: '12px 0 0 0',
    paddingLeft: '20px',
  },
  reportsGrid: {
    display: 'grid',
    gap: '20px',
  },
  reportCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
  },
  reportHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  reportHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  reportIcon: {
    fontSize: '40px',
  },
  reportInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  reportTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
  },
  reportDate: {
    fontSize: '14px',
    color: '#999',
  },
  expandButton: {
    padding: '8px 16px',
    backgroundColor: '#f5f5f5',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#666',
    transition: 'background-color 0.2s',
  },
  reportContent: {
    padding: '0 24px 24px 24px',
    borderTop: '1px solid #f0f0f0',
  },
  reportSummary: {
    padding: '24px 0',
    fontSize: '15px',
    lineHeight: '1.8',
    color: '#333',
    whiteSpace: 'pre-wrap',
  },
  metadata: {
    padding: '20px',
    backgroundColor: '#f9f9f9',
    borderRadius: '12px',
  },
  metadataTitle: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    color: '#333',
  },
  metadataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
  },
  metadataItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  metadataKey: {
    fontSize: '13px',
    color: '#666',
  },
  metadataValue: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1976d2',
  },
};

export default ReportPage;