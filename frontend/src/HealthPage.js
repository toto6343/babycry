import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from './AuthContext';

const HealthPage = () => {
  const { selectedInfant } = useAuth();
  const [growthData, setGrowthData] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [newGrowth, setNewGrowth] = useState({ height: '', weight: '', head_circum: '' });

  // ✅ 비전 AI 상태
  const [visionFile, setVisionFile] = useState(null);
  const [visionType, setVisionType] = useState('diaper');
  const [visionResult, setVisionResult] = useState(null);
  const [visionLoading, setVisionLoading] = useState(false);

  useEffect(() => {
    if (selectedInfant?.infantId) {
      fetchHealthData();
    }
  }, [selectedInfant]);

  const fetchHealthData = async () => {
    try {
      const gRes = await axios.get(`/api/health/growth/${selectedInfant.infantId}`);
      const vRes = await axios.get(`/api/health/vaccination/${selectedInfant.infantId}`);
      setGrowthData(gRes.data.data);
      setVaccinations(vRes.data.data);
    } catch (err) {
      console.error('Health data load failed:', err);
    }
  };

  const handleAddGrowth = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`/api/health/growth/${selectedInfant.infantId}`, {
        ...newGrowth,
        measured_date: new Date().toISOString().split('T')[0]
      });
      alert('성장 기록이 추가되었습니다.');
      setNewGrowth({ height: '', weight: '', head_circum: '' });
      fetchHealthData();
      
      // ✅ 뱃지 체크
      axios.post('/api/badges/check', { eventType: 'health_check' }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      }).then(bRes => {
        if (bRes.data.newlyEarned) alert('🎉 [성장 기록가] 뱃지를 획득했습니다!');
      });

    } catch (err) {
      alert('저장 실패: ' + err.message);
    }
  };

  // ✅ 비전 AI 업로드 처리
  const handleVisionUpload = async (e) => {
    e.preventDefault();
    if (!visionFile) return alert('이미지를 선택해주세요.');
    
    setVisionLoading(true);
    setVisionResult(null);

    const formData = new FormData();
    formData.append('image', visionFile);
    formData.append('analysisType', visionType);

    try {
      const res = await axios.post(`/api/vision/analyze/${selectedInfant.infantId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setVisionResult(res.data);
      
      // ✅ 뱃지 체크
      axios.post('/api/badges/check', { eventType: 'health_check' }, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      }).then(bRes => {
        if (bRes.data.newlyEarned) alert('🎉 새로운 뱃지를 획득했습니다!');
      });

    } catch (err) {
      alert('분석 실패: ' + (err.response?.data?.message || err.message));
    } finally {
      setVisionLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🩺 {selectedInfant?.name}의 건강 관리</h1>

      {/* ✅ 멀티모달 AI 분석 섹션 추가 */}
      <div style={{...styles.card, marginBottom: '30px', border: '2px solid #667eea'}}>
        <h3 style={{color: '#667eea', marginTop: 0}}>📷 AI 피부/기저귀 상태 분석</h3>
        <p style={{fontSize: '14px', color: '#666', marginBottom: '15px'}}>
          아기의 기저귀나 피부(태열/발진) 사진을 올리면 AI 전문의가 분석해 드립니다.
        </p>
        <form onSubmit={handleVisionUpload} style={styles.form}>
          <div style={{display: 'flex', gap: '10px'}}>
            <select 
              value={visionType} 
              onChange={e => setVisionType(e.target.value)}
              style={{...styles.input, flex: 1}}
            >
              <option value="diaper">기저귀 (대변 색상/형태)</option>
              <option value="skin">피부 (태열, 발진, 아토피 등)</option>
            </select>
            <input 
              type="file" 
              accept="image/*" 
              onChange={e => setVisionFile(e.target.files[0])}
              style={{...styles.input, flex: 2}}
            />
            <button type="submit" style={styles.button} disabled={visionLoading}>
              {visionLoading ? '분석 중...' : '분석하기'}
            </button>
          </div>
        </form>

        {visionResult && (
          <div style={{marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '8px', borderLeft: `5px solid ${visionResult.severity === 'High' ? '#f44336' : '#4caf50'}`}}>
            <h4 style={{margin: '0 0 10px 0', color: '#333'}}>🤖 AI 전문의 소견</h4>
            <p style={{margin: 0, lineHeight: '1.6', color: '#444'}}>{visionResult.opinion}</p>
            <div style={{marginTop: '10px', fontSize: '13px', fontWeight: 'bold', color: visionResult.severity === 'High' ? '#f44336' : '#4caf50'}}>
              심각도: {visionResult.severity} {visionResult.severity === 'High' && '(의사 상담 권장)'}
            </div>
          </div>
        )}
      </div>

      <div style={styles.grid}>
        {/* 성장 기록 폼 */}
        <div style={styles.card}>
          <h3>📏 오늘 성장 기록하기</h3>
          <form onSubmit={handleAddGrowth} style={styles.form}>
            <input 
              type="number" step="0.1" placeholder="키 (cm)" 
              value={newGrowth.height} onChange={e => setNewGrowth({...newGrowth, height: e.target.value})}
              style={styles.input} required
            />
            <input 
              type="number" step="0.1" placeholder="몸무게 (kg)" 
              value={newGrowth.weight} onChange={e => setNewGrowth({...newGrowth, weight: e.target.value})}
              style={styles.input} required
            />
            <button type="submit" style={styles.button}>기록 저장</button>
          </form>
        </div>

        {/* 예방접종 목록 */}
        <div style={styles.card}>
          <h3>💉 예방접종 일정</h3>
          <div style={styles.vaccineList}>
            {vaccinations.map(v => (
              <div key={v.vaccine_id} style={styles.vaccineItem}>
                <span>{v.vaccine_name} ({v.dose_number}차)</span>
                <span style={{color: v.is_completed === 1 ? 'green' : 'red'}}>
                  {v.is_completed === 1 ? '✅ 접종완료' : '🗓️ 예정'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 성장 트렌드 (간단한 목록형) */}
      <div style={styles.card}>
        <h3>📈 성장 히스토리</h3>
        <table style={styles.table}>
          <thead>
            <tr><th>날짜</th><th>키</th><th>몸무게</th></tr>
          </thead>
          <tbody>
            {growthData.map((g, i) => (
              <tr key={i}>
                <td>{new Date(g.MEASURED_DATE).toLocaleDateString()}</td>
                <td>{g.HEIGHT} cm</td>
                <td>{g.WEIGHT} kg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const styles = {
  container: { padding: '20px', maxWidth: '1000px', margin: '0 auto' },
  title: { color: '#333', marginBottom: '30px' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' },
  card: { background: 'white', padding: '24px', borderRadius: '16px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' },
  form: { display: 'flex', flexDirection: 'column', gap: '10px' },
  input: { padding: '12px', border: '1px solid #ddd', borderRadius: '8px' },
  button: { padding: '12px', background: '#667eea', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  vaccineList: { display: 'flex', flexDirection: 'column', gap: '12px' },
  vaccineItem: { display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee' },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: '10px' }
};

export default HealthPage;
