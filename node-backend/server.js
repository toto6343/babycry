// server.js - 개선 버전 (로깅, 에러 핸들링, DB 연동 강화)
import oracledb from 'oracledb';
import dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import { initPool } from './src/db/oracle.js';

dotenv.config();

async function initialize() {
  try {
    console.log('🚀 서버 초기화 시작...');
    
    // 1. Oracle 연결 풀 초기화
    console.log('🔌 Oracle 연결 풀 초기화 중...');
    await initPool();
    console.log('✅ Oracle 연결 풀 초기화 완료');
    
    // 2. Express app 동적 import
    console.log('📦 Express app 로딩 중...');
    const appModule = await import('./src/app.js');
    const app = appModule.default;
    console.log('✅ Express app 로딩 완료');
    
    // 3. HTTP 서버 생성
    const server = http.createServer(app);
    
    // 4. Socket.IO 설정
    const io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true
      },
      pingTimeout: 60000, // 60초
      pingInterval: 25000, // 25초
      transports: ['websocket', 'polling']
    });

    // ========================================
    // 5. Socket.IO 이벤트 처리
    // ========================================
    
    const rooms = new Map(); // roomId -> { users: [], doctorId, patientId, startTime }
    const userSockets = new Map(); // userId -> socketId
    const socketUsers = new Map(); // socketId -> userId

    // ✅ DB에 세션 상태 업데이트 헬퍼 함수
    const updateSessionInDB = async (sessionId, status, additionalData = {}) => {
      let connection;
      try {
        connection = await oracledb.getConnection();
        
        let query = 'UPDATE VIDEO_CALL_SESSIONS SET STATUS = :status';
        const params = { sessionId, status };

        if (status === 'ACTIVE') {
          query += ', START_TIME = SYSTIMESTAMP';
        } else if (status === 'COMPLETED') {
          query += `, END_TIME = SYSTIMESTAMP,
                     DURATION_MINUTES = ROUND(EXTRACT(DAY FROM (SYSTIMESTAMP - START_TIME)) * 24 * 60 + 
                     EXTRACT(HOUR FROM (SYSTIMESTAMP - START_TIME)) * 60 + 
                     EXTRACT(MINUTE FROM (SYSTIMESTAMP - START_TIME)))`;
        }

        query += ', UPDATED_AT = SYSTIMESTAMP WHERE SESSION_ID = :sessionId';

        await connection.execute(query, params, { autoCommit: true });
        console.log(`📝 DB 세션 상태 업데이트: ${sessionId} -> ${status}`);
        
      } catch (error) {
        console.error('❌ DB 세션 업데이트 실패:', error.message);
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (err) {
            console.error('Connection close error:', err);
          }
        }
      }
    };

    // ✅ 통화 품질 로그 저장 (선택사항)
    const saveCallQuality = async (sessionId, qualityData) => {
      let connection;
      try {
        connection = await oracledb.getConnection();
        
        // 별도 테이블이 있다면 여기에 저장
        // 현재는 로그만 출력
        console.log(`📊 통화 품질 [${sessionId}]:`, qualityData);
        
      } catch (error) {
        console.error('❌ 통화 품질 저장 실패:', error.message);
      } finally {
        if (connection) {
          try {
            await connection.close();
          } catch (err) {
            console.error('Connection close error:', err);
          }
        }
      }
    };

    io.on('connection', (socket) => {
      const connectionTime = new Date().toISOString();
      console.log('');
      console.log('='.repeat(60));
      console.log(`🔌 새로운 클라이언트 연결`);
      console.log(`   소켓 ID: ${socket.id}`);
      console.log(`   연결 시간: ${connectionTime}`);
      console.log(`   IP 주소: ${socket.handshake.address}`);
      console.log(`   전송 방식: ${socket.conn.transport.name}`);
      console.log('='.repeat(60));
      console.log('');

      // ========================================
      // 사용자 등록
      // ========================================
      socket.on('register', (userId) => {
        userSockets.set(userId, socket.id);
        socketUsers.set(socket.id, userId);
        socket.userId = userId;
        
        console.log('👤 사용자 등록');
        console.log(`   사용자 ID: ${userId}`);
        console.log(`   소켓 ID: ${socket.id}`);
        console.log(`   현재 온라인: ${userSockets.size}명`);
      });

      // ========================================
      // 화상 통화방 입장
      // ========================================
      socket.on('join-room', async ({ roomId, userId, role }) => {
        try {
          socket.join(roomId);
          
          if (!rooms.has(roomId)) {
            rooms.set(roomId, { 
              users: [], 
              doctorId: null, 
              patientId: null,
              startTime: new Date()
            });
          }
          
          const room = rooms.get(roomId);
          room.users.push({ socketId: socket.id, userId, role });
          
          if (role === 'doctor') {
            room.doctorId = userId;
          } else if (role === 'patient') {
            room.patientId = userId;
            
            // ✅ 환자가 입장했을 때, 해당 방의 의사가 아직 안 들어왔다면 의사에게 실시간 호출 알림 전송
            // 이 로직을 위해 세션 정보에서 doctorId를 가져와야 함 (여기서는 간단히 roomId 기반으로 처리)
            // 실제로는 DB에서 세션 정보를 조회하거나 client에서 doctorId를 같이 보내야 함
            console.log(`🔔 환자 ${userId}가 방 ${roomId}에 입장. 의사 호출 시도...`);
          }
          
          console.log('');
          console.log('🚪 화상 통화방 입장');
          console.log(`   방 ID: ${roomId}`);
          console.log(`   사용자 ID: ${userId}`);
          console.log(`   역할: ${role}`);
          console.log(`   방 인원: ${room.users.length}명`);
          console.log(`   의사: ${room.doctorId || '대기 중'}`);
          console.log(`   환자: ${room.patientId || '대기 중'}`);
          
          // ✅ DB에 세션 활성화 기록
          if (room.users.length === 1) {
            await updateSessionInDB(roomId, 'ACTIVE');
          }
          
          // 방에 있는 다른 사용자들 목록 전송
          const otherUsers = room.users.filter(u => u.socketId !== socket.id);
          socket.emit('other-users', otherUsers);
          
          if (otherUsers.length > 0) {
            console.log(`   👥 기존 사용자: ${otherUsers.length}명`);
          }
          
          // 기존 사용자들에게 새 사용자 알림
          socket.to(roomId).emit('user-joined', { 
            socketId: socket.id, 
            userId, 
            role 
          });

        } catch (error) {
          console.error('❌ 방 입장 처리 중 오류:', error);
          socket.emit('error', { message: '방 입장에 실패했습니다.' });
        }
      });

      // ========================================
      // WebRTC Offer
      // ========================================
      socket.on('offer', ({ offer, to }) => {
        console.log('📤 WebRTC Offer 전송');
        console.log(`   발신: ${socket.id}`);
        console.log(`   수신: ${to}`);
        console.log(`   SDP 타입: ${offer.type}`);
        
        io.to(to).emit('offer', { offer, from: socket.id });
      });

      // ========================================
      // WebRTC Answer
      // ========================================
      socket.on('answer', ({ answer, to }) => {
        console.log('📥 WebRTC Answer 전송');
        console.log(`   발신: ${socket.id}`);
        console.log(`   수신: ${to}`);
        console.log(`   SDP 타입: ${answer.type}`);
        
        io.to(to).emit('answer', { answer, from: socket.id });
      });

      // ========================================
      // ICE Candidate
      // ========================================
      socket.on('ice-candidate', ({ candidate, to }) => {
        if (candidate) {
          console.log(`❄️ ICE Candidate 전송: ${socket.id} -> ${to}`);
          io.to(to).emit('ice-candidate', { candidate, from: socket.id });
        }
      });

      // ========================================
      // 채팅 메시지
      // ========================================
      socket.on('chat-message', ({ roomId, message, userId, userName }) => {
        const timestamp = new Date().toISOString();
        
        console.log('💬 채팅 메시지');
        console.log(`   방: ${roomId}`);
        console.log(`   발신자: ${userName} (${userId})`);
        console.log(`   메시지: ${message}`);
        console.log(`   시간: ${timestamp}`);
        
        io.to(roomId).emit('chat-message', {
          message,
          userId,
          userName,
          timestamp
        });
      });

      // ========================================
      // 미디어 토글 (음소거, 비디오 끄기)
      // ========================================
      socket.on('toggle-media', ({ roomId, type, enabled }) => {
        console.log('🎛️ 미디어 토글');
        console.log(`   방: ${roomId}`);
        console.log(`   타입: ${type}`);
        console.log(`   상태: ${enabled ? 'ON' : 'OFF'}`);
        console.log(`   사용자: ${socket.id}`);
        
        socket.to(roomId).emit('peer-toggle-media', {
          socketId: socket.id,
          type,
          enabled
        });
      });

      // ========================================
      // 통화 종료
      // ========================================
      socket.on('end-call', async ({ roomId }) => {
        console.log('');
        console.log('📞 통화 종료 요청');
        console.log(`   방 ID: ${roomId}`);
        console.log(`   요청자: ${socket.id}`);
        
        socket.to(roomId).emit('call-ended', { socketId: socket.id });
        
        // ✅ DB에 세션 완료 기록
        await updateSessionInDB(roomId, 'COMPLETED');
        
        // 방 정보 제거
        if (rooms.has(roomId)) {
          const room = rooms.get(roomId);
          const duration = Math.floor((new Date() - room.startTime) / 1000);
          console.log(`   통화 시간: ${Math.floor(duration / 60)}분 ${duration % 60}초`);
          rooms.delete(roomId);
        }
      });

      // ========================================
      // 화상 통화방 퇴장
      // ========================================
      socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        socket.to(roomId).emit('user-disconnected', socket.id);
        
        console.log('👋 사용자 퇴장');
        console.log(`   방 ID: ${roomId}`);
        console.log(`   사용자: ${socket.id}`);
        
        // 방에서 사용자 제거
        if (rooms.has(roomId)) {
          const room = rooms.get(roomId);
          const userIndex = room.users.findIndex(u => u.socketId === socket.id);
          if (userIndex !== -1) {
            room.users.splice(userIndex, 1);
            console.log(`   남은 인원: ${room.users.length}명`);
          }
        }
      });

      // ========================================
      // 연결 해제
      // ========================================
      socket.on('disconnect', async (reason) => {
        const disconnectTime = new Date().toISOString();
        
        console.log('');
        console.log('='.repeat(60));
        console.log('❌ 클라이언트 연결 해제');
        console.log(`   소켓 ID: ${socket.id}`);
        console.log(`   사용자 ID: ${socket.userId || '미등록'}`);
        console.log(`   해제 사유: ${reason}`);
        console.log(`   시간: ${disconnectTime}`);
        
        // 사용자 맵에서 제거
        if (socket.userId) {
          userSockets.delete(socket.userId);
          console.log(`   사용자 맵에서 제거됨`);
        }
        socketUsers.delete(socket.id);
        
        // 모든 방에서 사용자 제거
        let roomsAffected = 0;
        for (const [roomId, room] of rooms.entries()) {
          const userIndex = room.users.findIndex(u => u.socketId === socket.id);
          if (userIndex !== -1) {
            roomsAffected++;
            room.users.splice(userIndex, 1);
            
            // 다른 사용자들에게 알림
            io.to(roomId).emit('user-left', { socketId: socket.id });
            
            console.log(`   방 ${roomId}에서 제거됨 (남은 인원: ${room.users.length}명)`);
            
            // ✅ 빈 방이면 DB에 세션 완료 기록
            if (room.users.length === 0) {
              await updateSessionInDB(roomId, 'COMPLETED');
              rooms.delete(roomId);
              console.log(`   🗑️ 빈 방 삭제: ${roomId}`);
            } else if (room.users.length === 1) {
              // 한 명만 남았으면 경고
              console.log(`   ⚠️ 방에 1명만 남음 - 상대방 대기 중`);
            }
          }
        }
        
        console.log(`   영향받은 방: ${roomsAffected}개`);
        console.log(`   현재 온라인: ${userSockets.size}명`);
        console.log(`   활성 방: ${rooms.size}개`);
        console.log('='.repeat(60));
        console.log('');
      });

      // ========================================
      // 통화 품질 모니터링
      // ========================================
      socket.on('call-quality', async (data) => {
        console.log('📊 통화 품질 정보 수신');
        console.log(`   세션: ${data.sessionId || 'N/A'}`);
        console.log(`   비디오 품질: ${data.videoQuality || 'N/A'}`);
        console.log(`   오디오 품질: ${data.audioQuality || 'N/A'}`);
        console.log(`   연결 안정성: ${data.connectionStable ? '안정' : '불안정'}`);
        
        // ✅ DB에 품질 데이터 저장 (선택사항)
        if (data.sessionId) {
          await saveCallQuality(data.sessionId, data);
        }
      });

      // ========================================
      // 에러 핸들링
      // ========================================
      socket.on('error', (error) => {
        console.error('❌ Socket 에러:', error);
      });

      // ========================================
      // 연결 유지 (Ping/Pong)
      // ========================================
      socket.on('ping', () => {
        socket.emit('pong');
      });
    });

    // ========================================
    // Socket.IO 전역 에러 핸들러
    // ========================================
    io.engine.on('connection_error', (err) => {
      console.error('❌ Socket.IO 연결 에러:', err);
    });

    console.log('');
    console.log('='.repeat(60));
    console.log('🌐 Socket.IO 서버 초기화 완료');
    console.log(`   전송 방식: websocket, polling`);
    console.log(`   Ping 타임아웃: 60초`);
    console.log(`   Ping 간격: 25초`);
    console.log('='.repeat(60));
    console.log('');

    // ========================================
    // 6. 서버 시작
    // ========================================
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log('');
      console.log('▓'.repeat(60));
      console.log('█'.repeat(60));
      console.log('');
      console.log('   ✅ BabyCry 백엔드 서버 시작 완료!');
      console.log('');
      console.log(`   📡 HTTP Server: http://localhost:${PORT}`);
      console.log(`   🔌 Socket.IO Server: ws://localhost:${PORT}`);
      console.log(`   🌐 CORS 허용: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
      console.log(`   🏥 환경: ${process.env.NODE_ENV || 'development'}`);
      console.log(`   🕐 시작 시간: ${new Date().toLocaleString('ko-KR')}`);
      console.log('');
      console.log('█'.repeat(60));
      console.log('▓'.repeat(60));
      console.log('');
      console.log('👀 서버 로그를 실시간으로 모니터링하고 있습니다...');
      console.log('');
    });

    // ========================================
    // 7. 우아한 종료 (Graceful Shutdown)
    // ========================================
    const gracefulShutdown = async (signal) => {
      console.log('');
      console.log('='.repeat(60));
      console.log(`📴 ${signal} 신호 수신 - 서버를 종료합니다...`);
      
      // Socket.IO 연결 종료
      io.close(() => {
        console.log('✅ Socket.IO 서버 종료 완료');
      });
      
      // HTTP 서버 종료
      server.close(async () => {
        console.log('✅ HTTP 서버 종료 완료');
        
        // Oracle 연결 풀 종료
        try {
          await oracledb.getPool().close(10);
          console.log('✅ Oracle 연결 풀 종료 완료');
        } catch (err) {
          console.error('❌ Oracle 연결 풀 종료 실패:', err);
        }
        
        console.log('='.repeat(60));
        console.log('👋 서버가 정상적으로 종료되었습니다.');
        console.log('');
        process.exit(0);
      });
      
      // 타임아웃 설정 (10초 후 강제 종료)
      setTimeout(() => {
        console.error('❌ 강제 종료: 타임아웃 초과');
        process.exit(1);
      }, 10000);
    };

    // 종료 시그널 핸들러 등록
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 예상치 못한 에러 핸들러
    process.on('uncaughtException', (error) => {
      console.error('');
      console.error('❌❌❌ 예상치 못한 에러 (uncaughtException) ❌❌❌');
      console.error('에러:', error);
      console.error('스택:', error.stack);
      console.error('');
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('');
      console.error('❌❌❌ 처리되지 않은 Promise 거부 (unhandledRejection) ❌❌❌');
      console.error('이유:', reason);
      console.error('Promise:', promise);
      console.error('');
    });

  } catch (err) {
    console.error('');
    console.error('❌❌❌ 서버 초기화 실패 ❌❌❌');
    console.error('에러:', err);
    console.error('상세 오류:', err.stack);
    console.error('');
    process.exit(1);
  }
}

// ========================================
// 서버 초기화 실행
// ========================================
console.log('');
console.log('🚀 BabyCry 서버 시작...');
console.log('');

await initialize();