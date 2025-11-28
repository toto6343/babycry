// src/RegisterPage.js (React Router 버전)
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from './api';

function RegisterPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    passwordConfirm: '',
    phone: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

    // 비밀번호 확인
    if (formData.password !== formData.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    // 비밀번호 길이 확인
    if (formData.password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      const registerData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || undefined,
      };

      console.log('📤 회원가입 요청 시작');
      console.log('📦 요청 데이터:', {
        ...registerData,
        password: '***숨김***'
      });

      const response = await authAPI.register(registerData);
      
      console.log('✅ 회원가입 성공:', response.data);
      setSuccess(true);
      
      // 2초 후 로그인 페이지로 이동
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (err) {
      console.error('❌ 회원가입 에러 발생');
      console.error('전체 에러 객체:', err);
      
      if (err.response) {
        // 서버가 응답했지만 오류 상태 코드 반환
        console.error('📛 서버 응답 오류');
        console.error('  상태 코드:', err.response.status);
        console.error('  응답 데이터:', err.response.data);
        console.error('  응답 헤더:', err.response.headers);
        
        setError(
          err.response.data?.error || 
          err.response.data?.message ||
          `서버 오류 (${err.response.status}): 회원가입에 실패했습니다.`
        );
      } else if (err.request) {
        // 요청은 보냈지만 응답을 받지 못함
        console.error('📡 서버 무응답');
        console.error('  요청 정보:', err.request);
        console.error('  백엔드 URL:', 'http://localhost:4000/api/auth/register');
        
        setError(
          '서버에 연결할 수 없습니다. ' +
          'Node 백엔드가 http://localhost:4000 에서 실행 중인지 확인해주세요.'
        );
      } else {
        // 요청 설정 중 오류 발생
        console.error('⚙️ 요청 설정 오류');
        console.error('  에러 메시지:', err.message);
        
        setError('요청 중 오류가 발생했습니다: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successContainer}>
            <div style={styles.successIcon}>✅</div>
            <h2 style={styles.successTitle}>회원가입 성공!</h2>
            <p style={styles.successText}>
              로그인 페이지로 이동합니다...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.logo}>👶 BabyCry</h1>
          <p style={styles.subtitle}>회원가입</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>이름 *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="홍길동"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>이메일 *</label>
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
            <label style={styles.label}>비밀번호 *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="최소 6자 이상"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>비밀번호 확인 *</label>
            <input
              type="password"
              name="passwordConfirm"
              value={formData.passwordConfirm}
              onChange={handleChange}
              placeholder="비밀번호를 다시 입력하세요"
              required
              style={styles.input}
              disabled={loading}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>전화번호 (선택)</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="010-1234-5678"
              style={styles.input}
              disabled={loading}
            />
            <span style={styles.hint}>
              알림을 받으려면 전화번호를 입력하세요
            </span>
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
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <div style={styles.footer}>
          <span style={styles.footerText}>이미 계정이 있으신가요?</span>
          <Link
            to="/login"
            style={{
              ...styles.linkButton,
              textDecoration: 'none',
              pointerEvents: loading ? 'none' : 'auto',
              opacity: loading ? 0.6 : 1,
            }}
          >
            로그인
          </Link>
        </div>

        {/* 디버깅 정보 (개발 중에만 표시) */}
        <div style={styles.debugInfo}>
          <small style={{ color: '#999' }}>
            백엔드: http://localhost:4000/api/auth/register
          </small>
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
    maxWidth: '450px',
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
    fontSize: '16px',
    fontWeight: '600',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
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
  hint: {
    fontSize: '12px',
    color: '#999',
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
  successContainer: {
    textAlign: 'center',
    padding: '40px 20px',
  },
  successIcon: {
    fontSize: '64px',
    marginBottom: '20px',
  },
  successTitle: {
    fontSize: '24px',
    color: '#2e7d32',
    margin: '0 0 12px 0',
  },
  successText: {
    fontSize: '14px',
    color: '#666',
    margin: 0,
  },
  debugInfo: {
    marginTop: '16px',
    padding: '8px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    textAlign: 'center',
  },
};

export default RegisterPage;