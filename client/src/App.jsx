import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

const languageOptions = [
  { value: 'en', label: 'English 英文' },
  { value: 'zh', label: 'Chinese 中文' },
  { value: 'fr', label: 'French 法语' },
  { value: 'es', label: 'Spanish 西班牙语' },
  { value: 'de', label: 'German 德语' },
  { value: 'ja', label: 'Japanese 日语' },
  { value: 'ko', label: 'Korean 韩语' },
  { value: 'ar', label: 'Arabic 阿拉伯语' },
  { value: 'ru', label: 'Russian 俄语' }
];

function App() {
  const [socket, setSocket] = useState(null);
  const [authMode, setAuthMode] = useState('register');
  const [authenticated, setAuthenticated] = useState(false);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('zh');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('请输入用户ID和密码开始使用。');
  const [conversationRequests, setConversationRequests] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io(socketUrl, { transports: ['websocket'], reconnection: true });

    newSocket.on('connect', () => setStatus('已连接到聊天服务器。'));
    newSocket.on('auth-success', ({ user }) => {
      setAuthenticated(true);
      setUserId(user.userId);
      setUsername(user.username);
      setPreferredLanguage(user.preferredLanguage);
      setStatus(`欢迎，${user.username}。选择联系人开始私聊。`);
      newSocket.emit('get-online-users');
    });
    newSocket.on('online-users', (users) => {
      setOnlineUsers(users.filter((user) => user.userId !== userId));
    });
    newSocket.on('user-online', (user) => {
      if (user.userId !== userId) {
        setOnlineUsers((previous) => {
          const withoutUser = previous.filter((item) => item.userId !== user.userId);
          return [...withoutUser, user];
        });
      }
    });
    newSocket.on('user-offline', ({ userId: offlineUserId }) => {
      setOnlineUsers((previous) => previous.filter((user) => user.userId !== offlineUserId));
    });
    newSocket.on('conversation-request', ({ conversationId, senderId, senderUser }) => {
      setConversationRequests((previous) => [
        ...previous.filter((request) => request.conversationId !== conversationId),
        { conversationId, senderId, senderUser }
      ]);
      setStatus(`${senderUser.username} 向你发起了聊天请求。`);
    });
    newSocket.on('conversation-initiated', ({ conversationId, targetUserId, targetUser }) => {
      setActiveConversation({ conversationId, otherUserId: targetUserId, otherUser: targetUser });
      setMessages([]);
      setStatus(`已向 ${targetUser.username} 发送聊天请求。`);
    });
    newSocket.on('conversation-accepted', ({ conversationId, otherUserId, otherUser }) => {
      setActiveConversation({ conversationId, otherUserId, otherUser });
      setMessages([]);
      setConversationRequests((previous) => previous.filter((request) => request.conversationId !== conversationId));
      setStatus(`${otherUser.username} 接受了你的聊天请求。`);
    });
    newSocket.on('chat:message', (message) => setMessages((previous) => [...previous, message]));
    newSocket.on('auth-error', ({ message }) => setStatus(message));
    newSocket.on('error-message', ({ message }) => setStatus(message));

    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuth = () => {
    if (!socket || !userId.trim() || !password) {
      setStatus('请输入用户ID和密码。');
      return;
    }
    if (authMode === 'register' && !username.trim()) {
      setStatus('请输入显示名称。');
      return;
    }

    socket.emit(authMode === 'register' ? 'register-account' : 'login-account', {
      userId: userId.trim(),
      username: username.trim(),
      password,
      preferredLanguage
    });
  };

  const handleSend = () => {
    if (!socket || !activeConversation || !messageInput.trim()) return;
    socket.emit('chat:send', {
      conversationId: activeConversation.conversationId,
      text: messageInput.trim()
    });
    setMessageInput('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') handleSend();
  };

  if (!authenticated) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="brand-mark">🔐</div>
          <h1>加密聊天</h1>
          <p>端到端加密 1对1 私聊 + 自动翻译</p>

          <div className="auth-tabs">
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>注册账号</button>
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>登录</button>
          </div>

          <div className="field">
            <label>用户ID</label>
            <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="请输入唯一用户ID" autoComplete="username" />
          </div>

          {authMode === 'register' && (
            <div className="field">
              <label>用户名</label>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="你的昵称" />
            </div>
          )}

          <div className="field">
            <label>密码</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位字符" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} />
          </div>

          {authMode === 'register' && (
            <div className="field">
              <label>首选语言</label>
              <select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}

          <button onClick={handleAuth} className="primary-button">
            {authMode === 'register' ? '注册账号' : '登录'}
          </button>
          <p className="status-text">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>💬 聊天</h1>
        <p className="user-info">已登录：<strong>{username}</strong></p>

        {conversationRequests.length > 0 && (
          <div className="requests-panel">
            <h3>聊天请求</h3>
            {conversationRequests.map((request) => (
              <div key={request.conversationId} className="request-item">
                <p>{request.senderUser.username}</p>
                <div className="request-actions">
                  <button className="accept-btn" onClick={() => socket.emit('accept-conversation', { conversationId: request.conversationId })}>接受</button>
                  <button className="reject-btn" onClick={() => setConversationRequests((previous) => previous.filter((item) => item.conversationId !== request.conversationId))}>拒绝</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="contacts-panel">
          <h3>在线联系人</h3>
          {onlineUsers.length === 0 ? <p className="empty-text">暂无在线用户。</p> : (
            <ul>
              {onlineUsers.map((user) => (
                <li key={user.userId}>
                  <div><strong>{user.username}</strong><span>{user.preferredLanguage.toUpperCase()}</span></div>
                  <button className="contact-btn" onClick={() => socket.emit('initiate-conversation', { targetUserId: user.userId })} disabled={activeConversation?.otherUserId === user.userId}>
                    {activeConversation?.otherUserId === user.userId ? '聊天中' : '聊天'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="chat-panel">
        {!activeConversation ? (
          <div className="no-conversation"><p>选择一个联系人开始聊天。</p><p className="hint">🔒 消息已加密并自动翻译成双方语言。</p></div>
        ) : (
          <>
            <div className="chat-header"><h2>{activeConversation.otherUser.username}</h2><span className="language-badge">{activeConversation.otherUser.preferredLanguage.toUpperCase()}</span></div>
            <div className="messages">
              {messages.length === 0 ? <div className="empty-state">开始对话</div> : messages.map((message) => (
                <div key={message.id} className={`message ${message.isOwnMessage ? 'own' : ''}`}>
                  <div className="message-header"><strong>{message.senderName}</strong><span>{new Date(message.createdAt).toLocaleTimeString()}</span></div>
                  <div className="message-text">{message.text}</div>
                  {message.originalText !== message.text && <div className="translation-note">原文：{message.originalText}</div>}
                  <div className="message-security">🔒 已加密</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="composer"><input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="输入加密消息..." /><button onClick={handleSend}>发送</button></div>
          </>
        )}
        <div className="status-bar">{status}</div>
      </main>
    </div>
  );
}

export default App;
