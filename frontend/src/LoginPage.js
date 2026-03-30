// src/LoginPage.js - 역할(ROLE) 기반 리다이렉트 지원
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from './api';
import { useAuth } from './AuthContext';

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('📤 로그인 요청 시작');
      console.log('📧 이메일:', formData.email);

      const response = await authAPI.login(formData);
      
      console.log('✅ 로그인 성공:', response.data);
      const { token, guardian, doctorInfo } = response.data;
      
      // ✅ localStorage에 역할 정보 저장
      localStorage.setItem('token', token);
      localStorage.setItem('userId', guardian.guardianId);
      localStorage.setItem('username', guardian.name);
      localStorage.setItem('email', guardian.email);
      localStorage.setItem('role', guardian.role);  // ✅ 역할 저장
      
      // 의사 정보가 있으면 저장
      if (doctorInfo) {
        localStorage.setItem('doctorId', doctorInfo.DOCTOR_ID);
        localStorage.setItem('specialty', doctorInfo.SPECIALTY);
        console.log(`👨‍⚕️ 의사 로그인: ${doctorInfo.DOCTOR_NAME} (${doctorInfo.SPECIALTY})`);
      }
      
      login(guardian, token);
      
      // ✅ 역할에 따라 다른 페이지로 이동
      console.log(`🚀 역할: ${guardian.role}`);
      
      if (guardian.role === 'doctor') {
        console.log('→ 의사 대시보드로 이동');
        navigate('/doctor-dashboard');
      } else if (guardian.role === 'admin') {
        console.log('→ 관리자 대시보드로 이동');
        navigate('/admin-dashboard');
      } else {
        console.log('→ 아기 선택 페이지로 이동');
        navigate('/infant-select');
      }
      
    } catch (err) {
      console.error('❌ 로그인 에러 발생');
      console.error('전체 에러:', err);
      
      if (err.response) {
        console.error('📛 서버 응답 오류');
        console.error('  상태 코드:', err.response.status);
        console.error('  응답 데이터:', err.response.data);
        
        if (err.response.status === 401) {
          setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        } else {
          setError(
            err.response.data?.error || 
            `서버 오류 (${err.response.status})`
          );
        }
      } else if (err.request) {
        console.error('📡 서버 무응답');
        setError('서버에 연결할 수 없습니다. 백엔드가 실행 중인지 확인해주세요.');
      } else {
        console.error('⚙️ 요청 설정 오류');
        setError('요청 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.logo}>👶 BabyCry</h1>
          <p style={styles.subtitle}>아기 울음 분석 & 화상 상담 시스템</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>이메일</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="example@email.com"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>비밀번호</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="비밀번호를 입력하세요"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          {error && (
            <div style={styles.error}>
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        {/* ✅ 테스트 계정 안내 */}
        <div style={styles.testAccountsBox}>
          <p style={styles.testAccountsTitle}>💡 테스트 계정</p>
          <div style={styles.testAccountItem}>
            <strong>환자:</strong> chulsoo@example.com / 1234
          </div>
          <div style={styles.testAccountItem}>
            <strong>의사:</strong> doctor1@hospital.com / 1234
          </div>
        </div>

        <div style={styles.footer}>
          <span style={styles.footerText}>계정이 없으신가요?</span>
          <Link
            to="/register"
            style={{
              ...styles.linkButton,
              textDecoration: 'none',
              pointerEvents: loading ? 'none' : 'auto',
              opacity: loading ? 0.6 : 1,
            }}
          >
            회원가입
          </Link>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f4f8',
    padding: '20px',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    padding: '40px',
    width: '100%',
    maxWidth: '400px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '32px',
  },
  logo: {
    fontSize: '36px',
    margin: '0 0 8px 0',
    color: '#1976d2',
  },
  subtitle: {
    margin: 0,
    color: '#666',
    fontSize: '14px',
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
    transition: 'border-color 0.2s',
    outline: 'none',
  },
  button: {
    padding: '14px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    marginTop: '8px',
  },
  error: {
    padding: '12px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '8px',
    fontSize: '14px',
    border: '1px solid #ef9a9a',
  },
  // ✅ 테스트 계정 박스 스타일
  testAccountsBox: {
    marginTop: '20px',
    padding: '15px',
    backgroundColor: '#e3f2fd',
    borderRadius: '8px',
    border: '1px solid #90caf9',
  },
  testAccountsTitle: {
    margin: '0 0 10px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#1565c0',
  },
  testAccountItem: {
    fontSize: '12px',
    color: '#333',
    marginBottom: '5px',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '8px',
  },
  footerText: {
    fontSize: '14px',
    color: '#666',
  },
  linkButton: {
    color: '#1976d2',
    fontSize: '14px',
    fontWeight: '600',
    padding: '4px',
  },
};

export default LoginPage;