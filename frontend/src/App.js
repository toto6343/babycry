import React, { useEffect } from 'react';
import { Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import HomePage from './HomePage';
import DashboardPage from './DashboardPage';
import InfantSelectPage from './InfantSelectPage';
import CryUploadPage from './CryUploadPage';
import ReportPage from './ReportPage';
import DoctorListPage from './DoctorListPage';
import ChatbotPage from './ChatbotPage';
import VideoCallRoom from './VideoCallRoom';
import DoctorDashboard from './DoctorDashboard';
import HealthPage from './HealthPage';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div style={styles.loading}>로딩 중...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
};

const Navigation = () => {
  const { user, logout, selectedInfant } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <nav style={styles.nav}>
      <div style={styles.navContainer}>
        <Link to="/dashboard" style={styles.logo}>👶 BabyCry AI</Link>
        <div style={styles.menu}>
          <Link to="/dashboard" style={styles.menuItem}>대시보드</Link>
          <Link to="/upload" style={styles.menuItem}>울음 분석</Link>
          <Link to="/chatbot" style={styles.menuItem}>AI 챗봇</Link>
          <Link to="/doctors" style={styles.menuItem}>전문가 상담</Link>
          <Link to="/health" style={styles.menuItem}>건강 관리</Link>
          <Link to="/report" style={styles.menuItem}>분석 리포트</Link>
        </div>
        <div style={styles.userSection}>
          <span style={styles.userInfo}>
            {selectedInfant ? `👶 ${selectedInfant.name}` : '아기를 선택해주세요'}
          </span>
          <button onClick={() => navigate('/infant-select')} style={styles.switchBtn}>교체</button>
          <button onClick={logout} style={styles.logoutBtn}>로그아웃</button>
        </div>
      </div>
    </nav>
  );
};

const styles = {
  nav: {
    backgroundColor: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    padding: '0 20px',
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    position: 'sticky',
    top: 0,
    zIndex: 1000,
  },
  navContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#1976d2',
    textDecoration: 'none',
  },
  menu: {
    display: 'flex',
    gap: '20px',
  },
  menuItem: {
    textDecoration: 'none',
    color: '#555',
    fontWeight: '500',
    fontSize: '15px',
    transition: 'color 0.2s',
  },
  userSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  userInfo: {
    fontSize: '14px',
    color: '#666',
    fontWeight: '600',
  },
  switchBtn: {
    padding: '4px 8px',
    backgroundColor: '#f5f5f5',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  logoutBtn: {
    padding: '6px 12px',
    backgroundColor: '#ff5252',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '600',
  },
  mainContent: {
    padding: '20px',
    backgroundColor: '#f8f9fa',
    minHeight: 'calc(100vh - 60px)',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666',
  }
};

function AppContent() {
  const location = useLocation();
  const isAuthPage = ['/login', '/register'].includes(location.pathname);

  return (
    <>
      {!isAuthPage && <Navigation />}
      <main style={!isAuthPage ? styles.mainContent : {}}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/home" element={<HomePage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/infant-select" element={<ProtectedRoute><InfantSelectPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><CryUploadPage /></ProtectedRoute>} />
          <Route path="/report" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
          <Route path="/doctors" element={<ProtectedRoute><DoctorListPage /></ProtectedRoute>} />
          <Route path="/chatbot" element={<ProtectedRoute><ChatbotPage /></ProtectedRoute>} />
          <Route path="/video-call/:sessionId" element={<ProtectedRoute><VideoCallRoom /></ProtectedRoute>} />
          <Route path="/health" element={<ProtectedRoute><HealthPage /></ProtectedRoute>} />
          <Route path="/doctor-dashboard" element={<ProtectedRoute><DoctorDashboard /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </>
  );
}


function App() {
  useEffect(() => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }, []);

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
