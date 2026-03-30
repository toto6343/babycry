// DashboardPage.js에 추가할 버튼 코드

// 기존 import에 추가:
import { useNavigate } from 'react-router-dom';

// 컴포넌트 내부에 추가:
const navigate = useNavigate();

// JSX에 추가할 버튼:
<div className="dashboard-card video-call-card" onClick={() => navigate('/doctors')}>
  <div className="card-icon">📹</div>
  <h3>소아과 전문의 상담</h3>
  <p>실시간 화상 상담을 받아보세요</p>
  <div className="card-badge">NEW</div>
</div>

// CSS에 추가:
/*
.video-call-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  position: relative;
  overflow: hidden;
}

.video-call-card::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  animation: pulse-gradient 3s ease-in-out infinite;
}

@keyframes pulse-gradient {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.1); opacity: 0.8; }
}

.card-badge {
  position: absolute;
  top: 15px;
  right: 15px;
  background: #ff4757;
  color: white;
  padding: 5px 12px;
  border-radius: 15px;
  font-size: 0.75rem;
  font-weight: 700;
  animation: badge-bounce 2s ease-in-out infinite;
}

@keyframes badge-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}
*/