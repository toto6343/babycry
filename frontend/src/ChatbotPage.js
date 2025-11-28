// src/ChatbotPage.js
import React, { useState, useEffect, useRef } from 'react';
import { chatbotAPI } from './api';
import { useAuth } from './AuthContext';

function ChatbotPage() {
  const { selectedInfant, user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  // 초기 환영 메시지
  useEffect(() => {
    setMessages([
      {
        role: 'assistant',
        content: `안녕하세요! 👋 ${selectedInfant.name}의 육아를 돕는 AI 상담사입니다. 궁금한 점이나 고민되는 부분을 편하게 말씀해 주세요.`,
        timestamp: new Date(),
      },
    ]);
  }, [selectedInfant]);

  // 메시지 추가 시 스크롤 하단 이동
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date(),
    };

    // 사용자 메시지 추가
    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setLoading(true);
    setError('');

    try {
      // API 호출용 히스토리 구성 (환영 메시지 제외)
      const history = messages
        .filter((msg) => msg.role !== 'system')
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      const response = await chatbotAPI.sendMessage({
        infantId: selectedInfant.infantId,
        guardianId: user.guardianId,
        message: userMessage.content,
        history: history,
      });

      // AI 응답 추가
      const assistantMessage = {
        role: 'assistant',
        content: response.data.reply || response.data.response || '응답을 받지 못했습니다.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error('Chatbot error:', err);
      setError('메시지 전송에 실패했습니다. 다시 시도해주세요.');
      
      // 에러 메시지 추가
      const errorMessage = {
        role: 'assistant',
        content: '죄송합니다. 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.chatContainer}>
        {/* 헤더 */}
        <div style={styles.chatHeader}>
          <div style={styles.headerContent}>
            <div style={styles.headerIcon}>💬</div>
            <div style={styles.headerText}>
              <h2 style={styles.headerTitle}>육아 상담 챗봇</h2>
              <p style={styles.headerSubtitle}>
                {selectedInfant.name}에 대한 육아 조언을 받아보세요
              </p>
            </div>
          </div>
        </div>

        {/* 메시지 영역 */}
        <div style={styles.messagesArea}>
          <div style={styles.messagesContainer}>
            {messages.map((message, index) => (
              <MessageBubble key={index} message={message} />
            ))}
            
            {/* 로딩 인디케이터 */}
            {loading && (
              <div style={styles.loadingMessage}>
                <div style={styles.typingIndicator}>
                  <span style={styles.typingDot}></span>
                  <span style={styles.typingDot}></span>
                  <span style={styles.typingDot}></span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div style={styles.errorBanner}>
            ⚠️ {error}
          </div>
        )}

        {/* 입력 영역 */}
        <div style={styles.inputArea}>
          <form onSubmit={handleSendMessage} style={styles.inputForm}>
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
              style={styles.textarea}
              disabled={loading}
              rows={3}
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              style={{
                ...styles.sendButton,
                opacity: !inputMessage.trim() || loading ? 0.5 : 1,
                cursor: !inputMessage.trim() || loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? '전송 중...' : '전송 📤'}
            </button>
          </form>
        </div>

        {/* 사용 팁 */}
        <div style={styles.tipsSection}>
          <div style={styles.tips}>
            <span style={styles.tipIcon}>💡</span>
            <span style={styles.tipText}>
              예시 질문: "아기가 밤에 자주 깨요", "이유식은 언제부터 시작하나요?", "기저귀 발진은 어떻게 치료하나요?"
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 메시지 말풍선 컴포넌트
function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  const isError = message.isError;

  // 메시지 스타일 결정
  let messageTextStyle = { ...styles.messageText };
  if (isUser) {
    messageTextStyle = { ...messageTextStyle, backgroundColor: '#1976d2', color: 'white' };
  } else if (isError) {
    messageTextStyle = { 
      ...messageTextStyle, 
      backgroundColor: '#ffebee', 
      color: '#c62828',
      border: '1px solid #ef9a9a' 
    };
  } else {
    messageTextStyle = { ...messageTextStyle, backgroundColor: '#e3f2fd', color: '#333' };
  }

  return (
    <div style={{
      ...styles.messageWrapper,
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        ...styles.messageBubble,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        {!isUser && (
          <div style={styles.bubbleIcon}>🤖</div>
        )}
        <div style={styles.bubbleContent}>
          <div style={messageTextStyle}>{message.content}</div>
          <div style={{
            ...styles.messageTime,
            textAlign: isUser ? 'right' : 'left',
          }}>
            {message.timestamp.toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
    height: 'calc(100vh - 120px)',
    display: 'flex',
    flexDirection: 'column',
  },
  chatContainer: {
    backgroundColor: 'white',
    borderRadius: '16px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  chatHeader: {
    padding: '20px 24px',
    borderBottom: '2px solid #f0f0f0',
    backgroundColor: '#fafafa',
  },
  headerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  headerIcon: {
    fontSize: '40px',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    margin: '0 0 4px 0',
    fontSize: '24px',
    color: '#333',
  },
  headerSubtitle: {
    margin: 0,
    fontSize: '14px',
    color: '#666',
  },
  messagesArea: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#f9f9f9',
  },
  messagesContainer: {
    height: '100%',
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  messageWrapper: {
    display: 'flex',
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '70%',
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  bubbleIcon: {
    fontSize: '32px',
    flexShrink: 0,
  },
  bubbleContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  messageText: {
    padding: '12px 16px',
    borderRadius: '12px',
    fontSize: '15px',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  messageTime: {
    fontSize: '11px',
    color: '#999',
    paddingLeft: '8px',
  },
  loadingMessage: {
    display: 'flex',
    justifyContent: 'flex-start',
  },
  typingIndicator: {
    display: 'flex',
    gap: '4px',
    padding: '16px 20px',
    backgroundColor: '#e3f2fd',
    borderRadius: '12px',
  },
  typingDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#1976d2',
    borderRadius: '50%',
    animation: 'typing 1.4s infinite',
  },
  errorBanner: {
    padding: '12px 24px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    fontSize: '14px',
    borderTop: '1px solid #ef9a9a',
  },
  inputArea: {
    padding: '20px 24px',
    borderTop: '2px solid #f0f0f0',
    backgroundColor: 'white',
  },
  inputForm: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
  },
  textarea: {
    flex: 1,
    padding: '12px 16px',
    border: '2px solid #e0e0e0',
    borderRadius: '12px',
    fontSize: '15px',
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  sendButton: {
    padding: '12px 24px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: '12px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    whiteSpace: 'nowrap',
    height: '48px',
  },
  tipsSection: {
    padding: '12px 24px',
    backgroundColor: '#f9f9f9',
    borderTop: '1px solid #f0f0f0',
  },
  tips: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tipIcon: {
    fontSize: '16px',
  },
  tipText: {
    fontSize: '12px',
    color: '#666',
    lineHeight: '1.5',
  },
};

// CSS 애니메이션 추가
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes typing {
    0%, 60%, 100% {
      transform: translateY(0);
      opacity: 0.7;
    }
    30% {
      transform: translateY(-10px);
      opacity: 1;
    }
  }
`;
document.head.appendChild(styleSheet);

export default ChatbotPage;