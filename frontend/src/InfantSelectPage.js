// src/InfantSelectPage.js (key 수정 버전)
import React, { useState, useEffect } from 'react';
import { infantAPI } from './api';
import { useAuth } from './AuthContext';
import { useNavigate } from 'react-router-dom';

function InfantSelectPage() {
  const { selectInfant } = useAuth();
  const navigate = useNavigate();
  const [infants, setInfants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    loadInfants();
  }, []);

  const loadInfants = async () => {
    try {
      setLoading(true);
      const response = await infantAPI.getAll();
      
      // 🔍 API 응답 완전 분석
      console.log('=== API 응답 분석 시작 ===');
      console.log('1️⃣ response.data 타입:', typeof response.data);
      console.log('2️⃣ response.data:', response.data);
      console.log('3️⃣ JSON.stringify:', JSON.stringify(response.data, null, 2));
      
      if (response.data.infants) {
        console.log('4️⃣ infants 배열 길이:', response.data.infants.length);
        console.log('5️⃣ 첫 번째 infant 원본:', response.data.infants[0]);
        console.log('6️⃣ 첫 번째 infant 키 목록:', Object.keys(response.data.infants[0]));
        console.log('7️⃣ 첫 번째 infant JSON:', JSON.stringify(response.data.infants[0], null, 2));
      }
      console.log('=== API 응답 분석 끝 ===');

      // API 응답이 { infants: [...] } 형태라고 가정
      const infantList = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data.infants)
        ? response.data.infants
        : [];

      setInfants(infantList);

      if (infantList.length === 0) {
        setShowAddForm(true);
      }
    } catch (err) {
      console.error('Error loading infants:', err);
      setError('아기 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectInfant = (infant) => {
    console.log('✅ 선택된 아기 상세 정보:');
    console.log('  - infantId:', infant.infantId);
    console.log('  - name:', infant.name);
    console.log('  - birthDate:', infant.birthDate);
    console.log('  - gender:', infant.gender);
    console.log('  - 전체 객체:', JSON.stringify(infant, null, 2));
    
    // ✅ 명시적으로 infantId 필드를 포함하여 저장
    const infantData = {
      infantId: infant.infantId || infant.id,
      name: infant.name,
      birthDate: infant.birthDate,
      gender: infant.gender,
    };
    
    console.log('💾 저장할 데이터:', JSON.stringify(infantData, null, 2));
    selectInfant(infantData);
    
    // 대시보드로 이동
    navigate('/dashboard');
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={styles.spinner}></div>
          <p>로딩 중...</p>
        </div>
      </div>
    );
  }

  if (showAddForm) {
    return (
      <InfantRegisterForm
        onSuccess={(newInfant) => {
          console.log('✅ 등록된 아기:', newInfant);
          
          // ✅ 명시적으로 infantId 필드를 포함하여 저장
          selectInfant({
            infantId: newInfant.infantId || newInfant.id,
            name: newInfant.name,
            birthDate: newInfant.birthDate,
            gender: newInfant.gender,
          });
          
          navigate('/dashboard');
        }}
        onCancel={() => {
          setShowAddForm(false);
        }}
        showCancel={infants.length > 0}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>👶 아기를 선택해주세요</h1>
          <p style={styles.subtitle}>
            울음을 분석할 아기를 선택하거나 새로 등록하세요
          </p>
        </div>

        {error && <div style={styles.error}>⚠️ {error}</div>}

        <div style={styles.infantGrid}>
          {Array.isArray(infants) &&
            infants.map((infant, index) => (
              <InfantCard
                key={infant.infantId || infant.id || `infant-${index}`}
                infant={infant}
                onSelect={handleSelectInfant}
              />
            ))}

          {/* 아기 추가 카드 */}
          <div style={styles.addCard} onClick={() => setShowAddForm(true)}>
            <div style={styles.addIcon}>➕</div>
            <div style={styles.addText}>새 아기 등록</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 아기 카드 컴포넌트
function InfantCard({ infant, onSelect }) {
  const calculateAge = (birthDate) => {
    const birth = new Date(birthDate);
    const now = new Date();
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 +
      (now.getMonth() - birth.getMonth());

    if (months < 12) {
      return `${months}개월`;
    } else {
      const years = Math.floor(months / 12);
      const remainMonths = months % 12;
      return remainMonths > 0
        ? `${years}세 ${remainMonths}개월`
        : `${years}세`;
    }
  };

  return (
    <div style={styles.infantCard} onClick={() => onSelect(infant)}>
      <div style={styles.infantIcon}>
        {infant.gender === 'M' ? '👦' : '👧'}
      </div>
      <div style={styles.infantInfo}>
        <div style={styles.infantName}>{infant.name}</div>
        <div style={styles.infantAge}>{calculateAge(infant.birthDate)}</div>
      </div>
    </div>
  );
}

// 아기 등록 폼 컴포넌트
function InfantRegisterForm({ onSuccess, onCancel, showCancel }) {
  const [formData, setFormData] = useState({
    name: '',
    birthDate: '',
    gender: 'M',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await infantAPI.create(formData);
      console.log('✅ 아기 등록 API 응답:', response.data);
      onSuccess(response.data);
    } catch (err) {
      console.error('❌ Error creating infant:', err);
      setError(
        err.response?.data?.error ||
          '아기 등록에 실패했습니다. 다시 시도해주세요.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>👶 아기 등록</h1>
          <p style={styles.subtitle}>새로운 아기의 정보를 입력해주세요</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>이름 *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="아기 이름"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>생년월일 *</label>
            <input
              type="date"
              name="birthDate"
              value={formData.birthDate}
              onChange={handleChange}
              required
              style={styles.input}
              disabled={loading}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>성별 *</label>
            <div style={styles.genderButtons}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: 'M' })}
                style={{
                  ...styles.genderButton,
                  ...(formData.gender === 'M'
                    ? styles.genderButtonActive
                    : {}),
                }}
                disabled={loading}
              >
                👦 남아
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, gender: 'F' })}
                style={{
                  ...styles.genderButton,
                  ...(formData.gender === 'F'
                    ? styles.genderButtonActive
                    : {}),
                }}
                disabled={loading}
              >
                👧 여아
              </button>
            </div>
          </div>

          {error && <div style={styles.error}>⚠️ {error}</div>}

          <div style={styles.buttonGroup}>
            {showCancel && (
              <button
                type="button"
                onClick={onCancel}
                style={styles.cancelButton}
                disabled={loading}
              >
                취소
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitButton,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '등록 중...' : '등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// 스타일
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f8',
    padding: '20px',
  },
  loadingCard: {
    backgroundColor: 'white',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #1976d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '600px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  title: {
    fontSize: '28px',
    margin: '0 0 12px 0',
    color: '#333',
  },
  subtitle: {
    margin: 0,
    color: '#666',
    fontSize: '14px',
  },
  error: {
    padding: '12px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '8px',
    fontSize: '14px',
    border: '1px solid #ef9a9a',
    marginBottom: '20px',
  },
  infantGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
    gap: '16px',
  },
  infantCard: {
    padding: '24px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
    backgroundColor: 'white',
  },
  infantIcon: {
    fontSize: '48px',
    marginBottom: '12px',
  },
  infantInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  infantName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#333',
  },
  infantAge: {
    fontSize: '14px',
    color: '#666',
  },
  addCard: {
    padding: '24px',
    border: '2px dashed #bdbdbd',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center',
    backgroundColor: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '160px',
  },
  addIcon: {
    fontSize: '48px',
    color: '#757575',
    marginBottom: '8px',
  },
  addText: {
    fontSize: '14px',
    color: '#757575',
    fontWeight: '600',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333',
  },
  input: {
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    outline: 'none',
  },
  genderButtons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  genderButton: {
    padding: '16px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  genderButtonActive: {
    borderColor: '#1976d2',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  cancelButton: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#f5f5f5',
    color: '#666',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  submitButton: {
    flex: 1,
    padding: '14px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

// CSS 애니메이션
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
document.head.appendChild(styleSheet);

export default InfantSelectPage;