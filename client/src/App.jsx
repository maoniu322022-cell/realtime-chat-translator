import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socketUrl = 'http://localhost:3001';

const languageOptions = [
  { value: 'en', label: 'English 英文' },
  { value: 'zh', label: 'Chinese 中文' },
  { value: 'fr', label: 'French 法文' },
  { value: 'es', label: 'Spanish 西班牙文' },
  { value: 'de', label: 'German 德文' },
  { value: 'ja', label: 'Japanese 日文' },
  { value: 'ko', label: 'Korean 韩文' },
  { value: 'ar', label: 'Arabic 阿拉伯文' },
  { value: 'ru', label: 'Russian 俄文' }
];

function App() {
  const [socket, setSocket] = useState(null);
  const [registered, setRegistered] = useState(false);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('游客');
  const [preferredLanguage, setPreferredLanguage] = useState('zh');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('请输入用户名和用户ID开始使用');
  const [conversationRequests, setConversationRequests] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true
    });

    newSocket.on('connect', () => {
      setStatus('已连接到聊天服务器');
    });

    newSocket.on('user-registered', ({ userId: regUserId, username: regUsername }) => {
      setRegistered(true);
      setStatus(`已注册为 ${regUsername}，选择联系人开始聊天`);
    });

    newSocket.on('online-users', (users) => {
      setOnlineUsers(users.filter(u => u.userId !== userId));
    });

    newSocket.on('user-online', ({ userId: onlineUserId, username: onlineUsername, preferredLanguage: lang }) => {
      if (onlineUserId !== userId) {
        setOnlineUsers((prev) => {
          const exists = prev.find(u => u.userId === onlineUserId);
          if (!exists) {
            return [...prev, { userId: onlineUserId, username: onlineUsername, preferredLanguage: lang }];
          }
          return prev;
        });
        setStatus(`${onlineUsername} 已上线`);
      }
    });

    newSocket.on('user-offline', ({ userId: offlineUserId, username: offlineUsername }) => {
      setOnlineUsers((prev) => prev.filter(u => u.userId !== offlineUserId));
      setStatus(`${offlineUsername} 已离线`);
    });

    newSocket.on('conversation-request', ({ conversationId, senderId, senderUser }) => {
      setConversationRequests((prev) => [
        ...prev,
        { conversationId, senderId, senderUser }
      ]);
      setStatus(`${senderUser.username} 向你发起聊天请求`);
    });

    newSocket.on('conversation-initiated', ({ conversationId, targetUserId, targetUser }) => {
      setActiveConversation({
        conversationId,
        otherUserId: targetUserId,
        otherUser: targetUser
      });
      setMessages([]);
      setStatus(`已与 ${targetUser.username} 开始对话`);
    });

    newSocket.on('conversation-accepted', ({ conversationId, otherUserId, otherUser }) => {
      setActiveConversation({
        conversationId,
        otherUserId,
        otherUser
      });
      setMessages([]);
      setStatus(`${otherUser.username} 接受了你的聊天请求`);
      setConversationRequests((prev) =>
        prev.filter(req => req.conversationId !== conversationId)
      );
    });

    newSocket.on('chat:message', (payload) => {
      setMessages((prev) => [...prev, payload]);
    });

    newSocket.on('error-message', ({ message }) => {
      setStatus(`❌ ${message}`);
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleRegister = () => {
    if (!socket || !userId.trim() || !username.trim()) {
      setStatus('请输入用户ID和用户名');
      return;
    }

    socket.emit('register-user', {
      userId: userId.trim(),
      username: username.trim(),
      preferredLanguage
    });

    socket.emit('get-online-users');
  };

  const handleInitiateConversation = (targetUserId) => {
    if (!socket) return;
    socket.emit('initiate-conversation', { targetUserId });
  };

  const handleAcceptConversation = (conversationId) => {
    if (!socket) return;
    socket.emit('accept-conversation', { conversationId });
  };

  const handleRejectConversation = (conversationId) => {
    setConversationRequests((prev) =>
      prev.filter(req => req.conversationId !== conversationId)
    );
  };

  const handleSend = () => {
    if (!socket || !activeConversation || !messageInput.trim()) {
      return;
    }

    socket.emit('chat:send', {
      conversationId: activeConversation.conversationId,
      text: messageInput.trim()
    });

    setMessageInput('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  if (!registered) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>🔐 加密聊天</h1>
          <p>端到端加密 1对1 私聊 + 自动翻译</p>

          <div className="field">
            <label>用户ID (唯一标识)</label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="如: user123"
            />
          </div>

          <div className="field">
            <label>用户名 (显示名称)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="你的名字"
            />
          </div>

          <div className="field">
            <label>首选语言</label>
            <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button onClick={handleRegister} className="primary-button">
            进入聊天
          </button>

          <p className="status-text">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <h1>💬 聊天</h1>
        <p className="user-info">你: {username}</p>

        {conversationRequests.length > 0 && (
          <div className="requests-panel">
            <h3>聊天请求</h3>
            {conversationRequests.map((req) => (
              <div key={req.conversationId} className="request-item">
                <p>{req.senderUser.username}</p>
                <div className="request-actions">
                  <button onClick={() => handleAcceptConversation(req.conversationId)} className="accept-btn">
                    接受
                  </button>
                  <button onClick={() => handleRejectConversation(req.conversationId)} className="reject-btn">
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="contacts-panel">
          <h3>在线联系人</h3>
          {onlineUsers.length === 0 ? (
            <p className="empty-text">暂无在线用户</p>
          ) : (
            <ul>
              {onlineUsers.map((user) => (
                <li key={user.userId}>
                  <div>
                    <strong>{user.username}</strong>
                    <span>{user.preferredLanguage.toUpperCase()}</span>
                  </div>
                  <button
                    onClick={() => handleInitiateConversation(user.userId)}
                    className="contact-btn"
                    disabled={activeConversation?.otherUserId === user.userId}
                  >
                    {activeConversation?.otherUserId === user.userId ? '聊天中' : '聊天'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="chat-panel">
        {!activeConversation ? (
          <div className="no-conversation">
            <p>选择一个联系人开始聊天</p>
            <p className="hint">💡 消息端到端加密，自动翻译成双方的语言</p>
          </div>
        ) : (
          <>
            <div className="chat-header">
              <h2>{activeConversation.otherUser.username}</h2>
              <span className="language-badge">{activeConversation.otherUser.preferredLanguage.toUpperCase()}</span>
            </div>

            <div className="messages">
              {messages.length === 0 ? (
                <div className="empty-state">开始对话</div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${message.isOwnMessage ? 'own' : ''}`}
                  >
                    <div className="message-header">
                      <strong>{message.senderName}</strong>
                      <span>{new Date(message.createdAt).toLocaleTimeString('zh-CN')}</span>
                    </div>
                    <div className="message-text">{message.text}</div>
                    {message.originalText && message.originalText !== message.text && (
                      <div className="translation-note">原文: {message.originalText}</div>
                    )}
                    <div className="message-security">🔒 加密</div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="composer">
              <input
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入加密消息..."
              />
              <button onClick={handleSend}>发送</button>
            </div>
          </>
        )}

        <div className="status-bar">{status}</div>
      </div>
    </div>
  );
}

export default App;
