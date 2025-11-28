// src/App.js
import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import InfantSelectPage from './InfantSelectPage';
import HomePage from './HomePage'; // ✅ 추가
import CryUploadPage from './CryUploadPage';
import DashboardPage from './DashboardPage';
import ReportPage from './ReportPage';
import ChatbotPage from './ChatbotPage';
import './App.css';

// 보호된 라우트 컴포넌트
function ProtectedRoute({ children }) {
  const { isAuthenticated, hasSelectedInfant } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasSelectedInfant) {
    return <Navigate to="/infant-select" replace />;
  }

  return children;
}

// 인증된 사용자는 접근 불가한 라우트
function PublicOnlyRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/home" replace />; // ✅ /upload → /home으로 변경
  }

  return children;
}

// 아기 선택 전용 라우트
function InfantSelectRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // 아기가 선택되어 있어도 이 페이지 접근 허용
  return children;
}

// 레이아웃 컴포넌트
function Layout({ children }) {
  const { user, selectedInfant, logout } = useAuth();
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* 헤더 */}
      <header style={{
        padding: '16px 24px',
        backgroundColor: '#fff',
        borderBottom: '2px solid #e0e0e0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, color: '#333', fontSize: '24px' }}>👶 BabyCry</h2>
          <span style={{ 
            backgroundColor: '#e3f2fd', 
            padding: '4px 12px', 
            borderRadius: '12px',
            fontSize: '14px',
            color: '#1976d2'
          }}>
            {selectedInfant.name}
          </span>
        </div>

        <nav style={{ display: 'flex', gap: '8px' }}>
          {/* ✅ Home 탭 추가 */}
          <NavLink to="/home" active={location.pathname === '/home'}>
            🏠 홈
          </NavLink>
          <NavLink to="/upload" active={location.pathname === '/upload'}>
            📤 울음 업로드
          </NavLink>
          <NavLink to="/dashboard" active={location.pathname === '/dashboard'}>
            📊 대시보드
          </NavLink>
          <NavLink to="/report" active={location.pathname === '/report'}>
            📝 보고서
          </NavLink>
          <NavLink to="/chatbot" active={location.pathname === '/chatbot'}>
            💬 육아 상담
          </NavLink>
        </nav>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {user.name}님
          </span>
          <button
            onClick={logout}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* 메인 컨텐츠 */}
      <main style={{ padding: '24px' }}>
        {children}
      </main>
    </div>
  );
}

// 네비게이션 링크 컴포넌트
function NavLink({ to, active, children }) {
  return (
    <Link
      to={to}
      style={{
        padding: '10px 20px',
        backgroundColor: active ? '#1976d2' : 'transparent',
        color: active ? 'white' : '#333',
        border: active ? 'none' : '1px solid #ddd',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: active ? 'bold' : 'normal',
        textDecoration: 'none',
        transition: 'all 0.2s',
        display: 'inline-block'
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.backgroundColor = '#f5f5f5';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.backgroundColor = 'transparent';
        }
      }}
    >
      {children}
    </Link>
  );
}

function AppContent() {
  return (
    <Routes>
      {/* 공개 라우트 */}
      <Route 
        path="/login" 
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        } 
      />
      <Route 
        path="/register" 
        element={
          <PublicOnlyRoute>
            <RegisterPage />
          </PublicOnlyRoute>
        } 
      />

      {/* 아기 선택 라우트 */}
      <Route 
        path="/infant-select" 
        element={
          <InfantSelectRoute>
            <InfantSelectPage />
          </InfantSelectRoute>
        } 
      />

      {/* ✅ Home 라우트 추가 */}
      <Route 
        path="/home" 
        element={
          <ProtectedRoute>
            <Layout>
              <HomePage />
            </Layout>
          </ProtectedRoute>
        } 
      />

      {/* 보호된 라우트 (레이아웃 포함) */}
      <Route 
        path="/upload" 
        element={
          <ProtectedRoute>
            <Layout>
              <CryUploadPage />
            </Layout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/report" 
        element={
          <ProtectedRoute>
            <Layout>
              <ReportPage />
            </Layout>
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/chatbot" 
        element={
          <ProtectedRoute>
            <Layout>
              <ChatbotPage />
            </Layout>
          </ProtectedRoute>
        } 
      />

      {/* ✅ 기본 리다이렉트를 /home으로 변경 */}
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;