// VideoCallRoom.js - 완전 개선 버전 (TURN, 재연결, 상태 모니터링 포함)
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import './VideoCallRoom.css';

const VideoCallRoom = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}'); // ✅ 사용자 정보
  const isDoctor = user?.role === 'doctor';

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteSocketIdRef = useRef(null); // 🆕 재연결용 원격 소켓 ID 저장
  const recognitionRef = useRef(null);

  // States
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sessionInfo, setSessionInfo] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('연결 중...');
  const [showChat, setShowChat] = useState(true);
  const [callDuration, setCallDuration] = useState(0);

  // 🆕 권한 관련 상태
  const [permissionStatus, setPermissionStatus] = useState('checking');
  const [permissionError, setPermissionError] = useState(null);
  const [mediaDevices, setMediaDevices] = useState({ hasCamera: false, hasMicrophone: false });
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  // 🆕 재연결 관련 상태
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // 🆕 원격 미디어 상태
  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteVideoOff, setRemoteVideoOff] = useState(false);

  // ✅ 의사용 AI 요약 리포트 관련 State 추가
  const [doctorSummary, setDoctorSummary] = useState(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [transcript, setTranscript] = useState(''); // ✅ 대화 텍스트 저장

  // ✅ STT(Speech-to-Text) 설정
  useEffect(() => {
    if (isConnected) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'ko-KR';
        recognition.onresult = (event) => {
          const last = event.results.length - 1;
          const text = event.results[last][0].transcript;
          setTranscript(prev => prev + text + '. ');
        };
        recognition.start();
        recognitionRef.current = recognition;
      }
    }
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [isConnected]);

  // ✅ AI 요약 불러오기 함수
  const fetchDoctorSummary = async () => {
    if (!isDoctor || !sessionId) return;
    setIsSummaryLoading(true);
    try {
      const response = await axios.get(`/api/reports/doctor-summary/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.data.success) {
        setDoctorSummary(response.data);
      }
    } catch (err) {
      console.error('AI 요약 로드 실패:', err);
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // ✅ 상담 시작 시 리포트 자동 로드
  useEffect(() => {
    if (isDoctor) {
      fetchDoctorSummary();
    }
  }, [isDoctor]);

  // ✅ ICE Servers (STUN + TURN 포함)
  const iceServers = {
    iceServers: [
      // Google Public STUN 서버
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      
      // ✅ TURN 서버 추가 (NAT 통과용)
      // 테스트용 공개 TURN 서버 (프로덕션에서는 자체 TURN 서버 사용 권장)
      {
        urls: 'turn:numb.viagenie.ca',
        credential: 'muazkh',
        username: 'webrtc@live.com'
      },
      // 또는 OpenRelay 무료 TURN 서버
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ],
    iceCandidatePoolSize: 10 // ICE 후보 풀 크기
  };

  useEffect(() => {
    checkMediaDevicesAndPermissions();
    
    return () => {
      cleanup();
    };
  }, [sessionId]);

  // 통화 시간 타이머
  useEffect(() => {
    let interval;
    if (isConnected) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isConnected]);

  // 🆕 미디어 장치 및 권한 확인
  const checkMediaDevicesAndPermissions = async () => {
    try {
      console.log('🔍 미디어 장치 및 권한 확인 시작...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setPermissionError({
          type: 'unsupported',
          message: '이 브라우저는 화상 통화를 지원하지 않습니다.'
        });
        setPermissionStatus('denied');
        return;
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === 'videoinput');
      const hasMicrophone = devices.some(device => device.kind === 'audioinput');

      setMediaDevices({ hasCamera, hasMicrophone });
      console.log('📹 미디어 장치:', { hasCamera, hasMicrophone });

      if (!hasCamera && !hasMicrophone) {
        setPermissionError({
          type: 'no-devices',
          message: '카메라와 마이크를 찾을 수 없습니다.'
        });
        setPermissionStatus('denied');
        return;
      }

      if (navigator.permissions && navigator.permissions.query) {
        try {
          const cameraPermission = await navigator.permissions.query({ name: 'camera' });
          const micPermission = await navigator.permissions.query({ name: 'microphone' });

          console.log('🔐 권한 상태:', {
            camera: cameraPermission.state,
            microphone: micPermission.state
          });

          if (cameraPermission.state === 'granted' && micPermission.state === 'granted') {
            console.log('✅ 권한이 이미 허용되어 있습니다. 스트림을 가져옵니다.');
            await requestMediaPermissions(); 
          } else if (cameraPermission.state === 'denied' || micPermission.state === 'denied') {
            setPermissionStatus('denied');
            setPermissionError({
              type: 'denied',
              message: '카메라 또는 마이크 권한이 거부되었습니다.'
            });
          } else {
            setPermissionStatus('prompt');
          }
        } catch (err) {
          console.log('⚠️ 권한 API 미지원, 직접 요청 필요');
          setPermissionStatus('prompt');
        }
      } else {
        setPermissionStatus('prompt');
      }

    } catch (error) {
      console.error('❌ 미디어 장치 확인 실패:', error);
      setPermissionError({
        type: 'error',
        message: '미디어 장치를 확인하는 중 오류가 발생했습니다.'
      });
      setPermissionStatus('denied');
    }
  };

  // 🆕 사용자에게 권한 요청
  const requestMediaPermissions = async () => {
    setIsRequestingPermission(true);
    setPermissionError(null);

    try {
      console.log('🎤 미디어 권한 요청 시작...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      console.log('✅ 미디어 권한 허용됨');

      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      setPermissionStatus('granted');
      setIsRequestingPermission(false);

      await initializeCall();

    } catch (error) {
      console.error('❌ 미디어 권한 거부 또는 오류:', error);
      setIsRequestingPermission(false);

      let errorMessage = '카메라/마이크 접근 권한이 필요합니다.';
      let errorType = 'denied';

      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMessage = '카메라와 마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 권한을 허용해주세요.';
        errorType = 'denied';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMessage = '카메라 또는 마이크를 찾을 수 없습니다. 장치가 연결되어 있는지 확인해주세요.';
        errorType = 'no-devices';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        errorMessage = '카메라 또는 마이크가 이미 다른 프로그램에서 사용 중입니다.';
        errorType = 'in-use';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = '요청한 카메라 설정을 지원하지 않습니다.';
        errorType = 'unsupported';
      } else if (error.name === 'TypeError') {
        errorMessage = '미디어 장치 설정이 올바르지 않습니다.';
        errorType = 'error';
      } else if (error.name === 'AbortError') {
        errorMessage = '미디어 접근이 중단되었습니다.';
        errorType = 'error';
      }

      setPermissionError({ type: errorType, message: errorMessage });
      setPermissionStatus('denied');
    }
  };

  const initializeCall = async () => {
    try {
      console.log('📞 통화 초기화 시작...');

      await fetchSessionInfo();

      // Socket.io 연결
      socketRef.current = io('http://localhost:4000', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });

      const userId = localStorage.getItem('userId');
      const userName = localStorage.getItem('username') || '사용자';
      const userRole = localStorage.getItem('role') || 'patient';  // ✅ 동적 역할

      console.log(`👤 사용자 역할: ${userRole}`);

      socketRef.current.emit('register', userId);
      socketRef.current.emit('join-room', {
        roomId: sessionId,
        userId,
        role: userRole  // ✅ 하드코딩 제거!
      });

      setConnectionStatus('대기 중...');

      // ✅ Socket 이벤트 리스너
      setupSocketListeners();

      await updateSessionStatus('ACTIVE');

    } catch (error) {
      console.error('❌ 통화 초기화 실패:', error);
      setConnectionStatus('오류 발생');
    }
  };

  // ✅ Socket 이벤트 리스너 설정 (재연결 로직 포함)
  const setupSocketListeners = () => {
    if (!socketRef.current) return;

    // 기존 사용자 목록
    socketRef.current.on('other-users', (users) => {
      console.log('👥 기존 사용자 목록:', users);
      if (users.length > 0) {
        remoteSocketIdRef.current = users[0].socketId;
        createPeerConnection(users[0].socketId);
      }
    });

    // 새 사용자 입장 (기존 사용자가 받는 이벤트)
    socketRef.current.on('user-joined', ({ socketId }) => {
      console.log('🚪 새 사용자 입장:', socketId);
      remoteSocketIdRef.current = socketId;
      // ⚠️ 수정: 여기서 바로 createPeerConnection을 하지 않고 newcomer의 offer를 기다립니다.
      setConnectionStatus('상대방 입장... 연결 대기 중');
    });

    // WebRTC Offer 수신
    socketRef.current.on('offer', async ({ offer, from }) => {
      console.log('📩 Offer 수신:', from);
      remoteSocketIdRef.current = from;
      await handleOffer(offer, from);
    });

    // WebRTC Answer 수신
    socketRef.current.on('answer', async ({ answer }) => {
      console.log('📩 Answer 수신');
      if (peerConnectionRef.current) {
        // ✅ 상태 체크 추가: have-local-offer 상태일 때만 answer를 처리합니다.
        if (peerConnectionRef.current.signalingState === 'have-local-offer') {
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          setIsConnected(true);
          setConnectionStatus('연결됨');
        } else {
          console.warn('⚠️ Answer를 처리할 수 없는 상태입니다:', peerConnectionRef.current.signalingState);
        }
      }
    });

    // ICE Candidate 수신
    socketRef.current.on('ice-candidate', async ({ candidate }) => {
      if (peerConnectionRef.current && candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(candidate)
          );
          console.log('❄️ ICE Candidate 추가 성공');
        } catch (error) {
          console.error('❌ ICE Candidate 추가 실패:', error);
        }
      }
    });

    // 채팅 메시지
    socketRef.current.on('chat-message', (message) => {
      setChatMessages(prev => [...prev, message]);
    });

    // ✅ 상대방 미디어 토글 수신
    socketRef.current.on('peer-toggle-media', ({ socketId, type, enabled }) => {
      console.log(`🎛️ 상대방 미디어 변경: ${type} - ${enabled}`);
      
      if (type === 'audio') {
        setRemoteMuted(!enabled);
      } else if (type === 'video') {
        setRemoteVideoOff(!enabled);
      }
    });

    // 사용자 퇴장
    socketRef.current.on('user-left', () => {
      console.log('👋 상대방이 나갔습니다');
      setConnectionStatus('상대방이 나갔습니다');
      setIsConnected(false);
      setTimeout(() => endCall(), 2000);
    });

    // 통화 종료
    socketRef.current.on('call-ended', () => {
      console.log('📞 통화가 종료되었습니다');
      setConnectionStatus('통화가 종료되었습니다');
      setIsConnected(false);
      setTimeout(() => endCall(), 2000);
    });

    // ✅ 소켓 연결 해제 (재연결 로직)
    socketRef.current.on('disconnect', (reason) => {
      console.log('🔌 소켓 연결 끊김:', reason);
      setIsConnected(false);
      
      if (reason === 'io server disconnect') {
        setConnectionStatus('서버에서 연결이 종료되었습니다');
      } else {
        setConnectionStatus('연결이 끊어졌습니다. 재연결 시도 중...');
        setIsReconnecting(true);
      }
    });

    // ✅ 소켓 재연결 성공
    socketRef.current.on('reconnect', (attemptNumber) => {
      console.log('✅ 소켓 재연결 성공:', attemptNumber);
      setConnectionStatus('재연결됨');
      setIsReconnecting(false);
      setReconnectAttempts(0);
      
      // 방에 다시 참가
      const userId = localStorage.getItem('userId');
      const userRole = localStorage.getItem('role') || 'patient';  // ✅ 동적 역할
      
      socketRef.current.emit('register', userId);
      socketRef.current.emit('join-room', {
        roomId: sessionId,
        userId,
        role: userRole  // ✅ 동적 역할 사용
      });

      // WebRTC 재연결 시도
      if (remoteSocketIdRef.current) {
        console.log('🔄 WebRTC 재연결 시도...');
        setTimeout(() => {
          createPeerConnection(remoteSocketIdRef.current);
        }, 1000);
      }
    });

    // ✅ 소켓 재연결 시도 중
    socketRef.current.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 재연결 시도 중:', attemptNumber);
      setReconnectAttempts(attemptNumber);
      setConnectionStatus(`재연결 시도 중... (${attemptNumber}/5)`);
    });

    // ✅ 소켓 재연결 실패
    socketRef.current.on('reconnect_failed', () => {
      console.error('❌ 재연결 실패');
      setConnectionStatus('재연결 실패. 페이지를 새로고침해주세요.');
      setIsReconnecting(false);
    });

    // ✅ 소켓 재연결 에러
    socketRef.current.on('reconnect_error', (error) => {
      console.error('❌ 재연결 에러:', error);
    });
  };

  const createPeerConnection = async (remoteSocketId) => {
    try {
      console.log('🔗 Peer Connection 생성 시작:', remoteSocketId);
      
      const peerConnection = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = peerConnection;

      // 로컬 스트림 추가
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
        console.log('➕ 로컬 트랙 추가:', track.kind);
      });

      // ✅ 원격 스트림 수신
      peerConnection.ontrack = (event) => {
        console.log('📥 원격 트랙 수신:', event.track.kind);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setIsConnected(true);
          setConnectionStatus('연결됨');
        }
      };

      // ✅ ICE Candidate
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('❄️ ICE Candidate 생성:', event.candidate.type);
          socketRef.current.emit('ice-candidate', {
            candidate: event.candidate,
            to: remoteSocketId
          });
        } else {
          console.log('❄️ 모든 ICE Candidate 수집 완료');
        }
      };

      // ✅ 연결 상태 모니터링
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('🔗 WebRTC 연결 상태:', state);
        
        switch (state) {
          case 'connected':
            setConnectionStatus('연결됨');
            setIsConnected(true);
            setIsReconnecting(false);
            break;
          case 'connecting':
            setConnectionStatus('연결 중...');
            break;
          case 'disconnected':
            setConnectionStatus('연결 끊김');
            setIsConnected(false);
            // 재연결 시도
            console.log('🔄 WebRTC 재연결 준비...');
            break;
          case 'failed':
            setConnectionStatus('연결 실패');
            setIsConnected(false);
            console.log('❌ WebRTC 연결 실패 - 재연결 시도...');
            // 3초 후 재연결 시도
            setTimeout(() => {
              if (remoteSocketIdRef.current) {
                console.log('🔄 WebRTC 재연결 시도...');
                createPeerConnection(remoteSocketIdRef.current);
              }
            }, 3000);
            break;
          case 'closed':
            setConnectionStatus('연결 종료');
            setIsConnected(false);
            break;
        }
      };

      // ✅ ICE 연결 상태 모니터링
      peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log('❄️ ICE 연결 상태:', state);
        
        switch (state) {
          case 'checking':
            console.log('❄️ ICE 후보 확인 중...');
            break;
          case 'connected':
          case 'completed':
            console.log('✅ ICE 연결 성공');
            break;
          case 'failed':
            console.error('❌ ICE 연결 실패');
            break;
          case 'disconnected':
            console.log('⚠️ ICE 연결 끊김');
            break;
          case 'closed':
            console.log('🔒 ICE 연결 종료');
            break;
        }
      };

      // ✅ ICE Gathering 상태 모니터링
      peerConnection.onicegatheringstatechange = () => {
        console.log('❄️ ICE Gathering 상태:', peerConnection.iceGatheringState);
      };

      // Offer 생성
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.setLocalDescription(offer);

      console.log('📤 Offer 전송');
      socketRef.current.emit('offer', {
        offer,
        to: remoteSocketId
      });

    } catch (error) {
      console.error('❌ Peer connection 생성 실패:', error);
      setConnectionStatus('Peer Connection 생성 실패');
    }
  };

  const handleOffer = async (offer, from) => {
    try {
      console.log('📩 Offer 처리 시작');
      
      const peerConnection = new RTCPeerConnection(iceServers);
      peerConnectionRef.current = peerConnection;

      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      peerConnection.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setIsConnected(true);
          setConnectionStatus('연결됨');
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('ice-candidate', {
            candidate: event.candidate,
            to: from
          });
        }
      };

      // ✅ 연결 상태 모니터링
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log('🔗 WebRTC 연결 상태 (Answer):', state);
        
        switch (state) {
          case 'connected':
            setConnectionStatus('연결됨');
            setIsConnected(true);
            break;
          case 'disconnected':
            setConnectionStatus('연결 끊김');
            setIsConnected(false);
            break;
          case 'failed':
            setConnectionStatus('연결 실패');
            setIsConnected(false);
            break;
          case 'closed':
            setConnectionStatus('연결 종료');
            setIsConnected(false);
            break;
        }
      };

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      console.log('📤 Answer 전송');
      socketRef.current.emit('answer', {
        answer,
        to: from
      });

    } catch (error) {
      console.error('❌ Offer 처리 실패:', error);
    }
  };

  const fetchSessionInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(
        `http://localhost:4000/api/videocall/sessions/${sessionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSessionInfo(response.data.session);
      }
    } catch (error) {
      console.error('❌ 세션 정보 조회 실패:', error);
    }
  };

  const updateSessionStatus = async (status) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `http://localhost:4000/api/videocall/sessions/${sessionId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('❌ 세션 상태 업데이트 실패:', error);
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);

        socketRef.current.emit('toggle-media', {
          roomId: sessionId,
          type: 'audio',
          enabled: audioTrack.enabled
        });
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);

        socketRef.current.emit('toggle-media', {
          roomId: sessionId,
          type: 'video',
          enabled: videoTrack.enabled
        });
      }
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && socketRef.current) {
      const userName = localStorage.getItem('username') || '사용자';
      const userId = localStorage.getItem('userId');

      socketRef.current.emit('chat-message', {
        roomId: sessionId,
        message: newMessage,
        userId,
        userName
      });

      setNewMessage('');
    }
  };

  const endCall = async () => {
    try {
      // 1) 상담 대화 자동 요약 요청 (내용이 있을 때)
      if (transcript.trim().length > 10) {
        console.log('🤖 AI 진료 일지 생성 요청 중...');
        try {
          await axios.post(`/api/videocall/sessions/${sessionId}/auto-summary`, {
            transcript: transcript
          }, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          });
        } catch (err) {
          console.error('자동 요약 생성 실패:', err);
        }
      }

      await updateSessionStatus('COMPLETED');

      if (socketRef.current) {
        socketRef.current.emit('end-call', { roomId: sessionId });
      }

      cleanup();
      const role = localStorage.getItem('role');
      navigate(role === 'doctor' ? '/doctor-dashboard' : '/dashboard');
    } catch (error) {
      console.error('❌ 통화 종료 실패:', error);
      cleanup();
      const role = localStorage.getItem('role');
      navigate(role === 'doctor' ? '/doctor-dashboard' : '/dashboard');
    }
  };

  const cleanup = () => {
    console.log('🧹 리소스 정리 시작...');
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('⏹️ 로컬 트랙 중지:', track.kind);
      });
      localStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      console.log('🔒 Peer Connection 종료');
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      console.log('🔌 Socket 연결 종료');
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const openBrowserSettings = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    let instructions = '';

    if (userAgent.includes('chrome')) {
      instructions = 'Chrome: 주소창 좌측의 자물쇠/카메라 아이콘 클릭 → 권한 설정';
    } else if (userAgent.includes('firefox')) {
      instructions = 'Firefox: 주소창 좌측의 자물쇠 아이콘 클릭 → 권한 → 카메라/마이크 허용';
    } else if (userAgent.includes('safari')) {
      instructions = 'Safari: Safari 메뉴 → 설정 → 웹사이트 → 카메라/마이크';
    } else if (userAgent.includes('edge')) {
      instructions = 'Edge: 주소창 좌측의 자물쇠 아이콘 클릭 → 사이트 권한';
    }

    alert(instructions || '브라우저 설정에서 이 사이트의 카메라/마이크 권한을 허용해주세요.');
  };

  // 권한 확인 중 화면
  if (permissionStatus === 'checking') {
    return (
      <div className="video-call-room">
        <div className="permission-screen">
          <div className="permission-content">
            <div className="spinner"></div>
            <h2>장치 확인 중...</h2>
            <p>카메라와 마이크를 확인하고 있습니다.</p>
          </div>
        </div>
      </div>
    );
  }

  // 권한 요청 필요 화면
  if (permissionStatus === 'prompt') {
    return (
      <div className="video-call-room">
        <div className="permission-screen">
          <div className="permission-content">
            <div className="permission-icon">📹🎤</div>
            <h2>카메라와 마이크 권한이 필요합니다</h2>
            <p className="permission-description">
              화상 통화를 위해 카메라와 마이크 사용 권한이 필요합니다.<br/>
              브라우저에서 권한 요청이 표시되면 '허용'을 클릭해주세요.
            </p>
            
            <div className="device-status">
              <div className={`device-item ${mediaDevices.hasCamera ? 'available' : 'unavailable'}`}>
                📹 카메라: {mediaDevices.hasCamera ? '감지됨' : '없음'}
              </div>
              <div className={`device-item ${mediaDevices.hasMicrophone ? 'available' : 'unavailable'}`}>
                🎤 마이크: {mediaDevices.hasMicrophone ? '감지됨' : '없음'}
              </div>
            </div>

            <div className="permission-actions">
              <button
                className="btn-request-permission"
                onClick={requestMediaPermissions}
                disabled={isRequestingPermission || (!mediaDevices.hasCamera && !mediaDevices.hasMicrophone)}
              >
                {isRequestingPermission ? '권한 요청 중...' : '📹 권한 허용하기'}
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  const role = localStorage.getItem('role');
                  navigate(role === 'doctor' ? '/doctor-dashboard' : '/dashboard');
                }}
              >
                취소
              </button>
            </div>

            <div className="permission-help">
              <p>💡 <strong>권한 허용 방법:</strong></p>
              <ol>
                <li>위 버튼을 클릭합니다</li>
                <li>브라우저 상단에 권한 요청 팝업이 표시됩니다</li>
                <li>'허용' 또는 'Allow' 버튼을 클릭합니다</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 권한 거부 화면
  if (permissionStatus === 'denied') {
    return (
      <div className="video-call-room">
        <div className="permission-screen error">
          <div className="permission-content">
            <div className="permission-icon error">⚠️</div>
            <h2>권한이 필요합니다</h2>
            <p className="error-message">{permissionError?.message}</p>

            <div className="error-help">
              {permissionError?.type === 'denied' && (
                <>
                  <h3>📋 해결 방법:</h3>
                  <ol>
                    <li>브라우저 주소창 좌측의 자물쇠 또는 카메라 아이콘을 클릭하세요</li>
                    <li>카메라와 마이크 권한을 '허용'으로 변경하세요</li>
                    <li>페이지를 새로고침하세요</li>
                  </ol>
                  <button
                    className="btn-help"
                    onClick={openBrowserSettings}
                  >
                    📖 자세한 안내 보기
                  </button>
                </>
              )}

              {permissionError?.type === 'no-devices' && (
                <>
                  <h3>📋 확인 사항:</h3>
                  <ul>
                    <li>카메라와 마이크가 컴퓨터에 연결되어 있나요?</li>
                    <li>다른 프로그램에서 카메라를 사용 중인가요?</li>
                    <li>장치 드라이버가 설치되어 있나요?</li>
                  </ul>
                </>
              )}

              {permissionError?.type === 'in-use' && (
                <>
                  <h3>📋 해결 방법:</h3>
                  <ul>
                    <li>다른 화상 통화 프로그램을 종료하세요 (Zoom, Teams 등)</li>
                    <li>브라우저의 다른 탭을 확인하세요</li>
                    <li>필요시 브라우저를 재시작하세요</li>
                  </ul>
                </>
              )}
            </div>

            <div className="permission-actions">
              <button
                className="btn-retry"
                onClick={checkMediaDevicesAndPermissions}
              >
                🔄 다시 시도
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  const role = localStorage.getItem('role');
                  navigate(role === 'doctor' ? '/doctor-dashboard' : '/dashboard');
                }}
              >
                대시보드로 돌아가기
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ✅ 정상 통화 화면
  return (
    <div className={`video-call-room-layout ${isDoctor ? 'with-sidebar' : ''}`}>
      <div className="video-call-main">
        <div className="call-header">
          <div className="session-info">
            {sessionInfo && (
              <>
                <h2>👨‍⚕️ {sessionInfo.DOCTOR_NAME}</h2>
                <span className="specialty">{sessionInfo.SPECIALTY}</span>
              </>
            )}
          </div>
          <div className="call-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'connecting'}`}>
              {connectionStatus}
              {isReconnecting && ' 🔄'}
            </div>
            {isConnected && (
              <div className="call-timer">
                ⏱️ {formatDuration(callDuration)}
              </div>
            )}
          </div>
        </div>

        <div className="video-container">
          <div className="main-video">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="remote-video"
            />
            {!isConnected && (
              <div className="waiting-overlay">
                <div className="spinner"></div>
                <p>{isReconnecting ? '재연결 중...' : '의사 선생님을 기다리고 있습니다...'}</p>
              </div>
            )}
            {/* ✅ 원격 미디어 상태 표시 */}
            {isConnected && remoteMuted && (
              <div className="remote-media-status muted">
                🔇 상대방이 음소거했습니다
              </div>
            )}
            {isConnected && remoteVideoOff && (
              <div className="remote-media-status video-off">
                📷 상대방이 비디오를 껐습니다
              </div>
            )}
          </div>

          <div className="local-video-wrapper">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="local-video"
            />
            {isVideoOff && (
              <div className="video-off-overlay">
                📷 OFF
              </div>
            )}
          </div>
        </div>

        <div className="controls-bar">
          <button
            className={`control-button ${isMuted ? 'active' : ''}`}
            onClick={toggleMute}
            title={isMuted ? '음소거 해제' : '음소거'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>

          <button
            className={`control-button ${isVideoOff ? 'active' : ''}`}
            onClick={toggleVideo}
            title={isVideoOff ? '비디오 켜기' : '비디오 끄기'}
          >
            {isVideoOff ? '📷' : '📹'}
          </button>

          <button
            className="control-button chat-toggle"
            onClick={() => setShowChat(!showChat)}
            title="채팅 토글"
          >
            💬
          </button>

          <button
            className="control-button end-call"
            onClick={endCall}
            title="통화 종료"
          >
            📞 종료
          </button>
        </div>

        {showChat && (
          <div className="chat-panel">
            <div className="chat-header">
              <h3>💬 채팅</h3>
              <button onClick={() => setShowChat(false)}>✕</button>
            </div>
            <div className="chat-messages">
              {chatMessages.map((msg, index) => (
                <div key={index} className="chat-message">
                  <span className="message-author">{msg.userName}:</span>
                  <span className="message-text">{msg.message}</span>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="chat-input">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="메시지를 입력하세요..."
              />
              <button onClick={sendMessage}>전송</button>
            </div>
          </div>
        )}
      </div>

      {/* ✅ 의사용 AI 진료 브리핑 사이드바 추가 */}
      {isDoctor && (
        <div className="doctor-ai-sidebar">
          <div className="sidebar-header">
            <h3>🤖 AI 진료 브리핑</h3>
            <button 
              onClick={fetchDoctorSummary} 
              className="refresh-btn"
              title="데이터 새로고침"
            >
              🔄
            </button>
          </div>
          
          <div className="sidebar-content">
            {isSummaryLoading ? (
              <div className="sidebar-loading">
                <div className="spinner small"></div>
                <p>데이터 분석 중...</p>
              </div>
            ) : doctorSummary ? (
              <div className="ai-briefing-container">
                <div className="patient-tag">
                  <span className="tag-label">환아:</span>
                  <span className="tag-value">{doctorSummary.infantName}</span>
                  <span className="event-count">({doctorSummary.eventCount} events)</span>
                </div>

                {/* ✅ 최근 울음소리 들어보기 기능 추가 */}
                {doctorSummary.recentAudioUrl && (
                  <div className="audio-playback-section">
                    <h4 className="section-subtitle">🎧 최근 울음소리 청취</h4>
                    <audio controls className="mini-audio-player">
                      <source src={doctorSummary.recentAudioUrl} type="audio/wav" />
                      브라우저가 오디오 재생을 지원하지 않습니다.
                    </audio>
                    <p className="audio-timestamp">녹음 시각: {new Date(doctorSummary.latestEventTime).toLocaleString()}</p>
                  </div>
                )}
                
                <div className="briefing-text">
                  {doctorSummary.doctorSummary.split('\n').map((line, i) => {
                    if (line.trim().startsWith('-') || line.trim().startsWith('🚨') || line.trim().startsWith('📊') || line.trim().startsWith('💡') || line.trim().startsWith('📋')) {
                      return <h4 key={i} className="briefing-section-title">{line}</h4>;
                    }
                    return <p key={i} className="briefing-paragraph">{line}</p>;
                  })}
                </div>
              </div>
            ) : (
              <div className="no-summary">
                <p>리포트 데이터가 없습니다.</p>
              </div>
            )}
          </div>
          
          <div className="sidebar-footer">
            <p>※ 최근 24시간 데이터를 기반으로 작성되었습니다.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoCallRoom;