import React from 'react';

const CryChart = ({ data }) => {
  // 데이터 가공 (유형별 카운트)
  const stats = data.reduce((acc, curr) => {
    acc[curr.cry_type] = (acc[curr.cry_type] || 0) + 1;
    return acc;
  }, {});

  const labels = {
    hungry: '배고픔',
    tired: '졸림',
    belly_pain: '배앓이',
    discomfort: '불편함',
    burping: '트림',
    emotional: '감정적'
  };

  const colors = {
    hungry: '#42a5f5',
    tired: '#9575cd',
    belly_pain: '#ef5350',
    discomfort: '#ffb74d',
    burping: '#81c784',
    emotional: '#f06292'
  };

  const total = data.length;

  return (
    <div style={styles.chartContainer}>
      <h3 style={styles.chartTitle}>📊 울음 원인 분석 (최근 7일)</h3>
      <div style={styles.barList}>
        {Object.entries(stats).map(([type, count]) => (
          <div key={type} style={styles.barItem}>
            <div style={styles.barLabel}>
              <span>{labels[type] || type}</span>
              <span>{Math.round((count / total) * 100)}% ({count}회)</span>
            </div>
            <div style={styles.barTrack}>
              <div style={{
                ...styles.barFill,
                width: `${(count / total) * 100}%`,
                backgroundColor: colors[type] || '#ccc'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  chartContainer: {
    padding: '24px',
    backgroundColor: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
    marginBottom: '24px'
  },
  chartTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#333',
    marginBottom: '20px'
  },
  barList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  barItem: {
    width: '100%'
  },
  barLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#666',
    marginBottom: '6px',
    fontWeight: '500'
  },
  barTrack: {
    height: '10px',
    backgroundColor: '#f0f0f0',
    borderRadius: '5px',
    overflow: 'hidden'
  },
  barFill: {
    height: '100%',
    borderRadius: '5px',
    transition: 'width 1s ease-in-out'
  }
};

export default CryChart;
