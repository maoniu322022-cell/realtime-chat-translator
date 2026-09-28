import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' }
];

function App() {
  const [socket, setSocket] = useState(null);
  const [authMode, setAuthMode] = useState('register');
  const [authenticated, setAuthenticated] = useState(false);
  const [userId, setUserId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('Create an account or sign in to start chatting.');
  const [conversationRequests, setConversationRequests] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io(socketUrl, { transports: ['websocket'], reconnection: true });

    newSocket.on('connect', () => setStatus('Connected to the chat server.'));
    newSocket.on('auth-success', ({ user }) => {
      setAuthenticated(true);
      setUserId(user.userId);
      setUsername(user.username);
      setPreferredLanguage(user.preferredLanguage);
      setStatus(`Welcome, ${user.username}. Select a contact to start a private chat.`);
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
      setStatus(`${senderUser.username} sent you a chat request.`);
    });
    newSocket.on('conversation-initiated', ({ conversationId, targetUserId, targetUser }) => {
      setActiveConversation({ conversationId, otherUserId: targetUserId, otherUser: targetUser });
      setMessages([]);
      setStatus(`Chat request sent to ${targetUser.username}.`);
    });
    newSocket.on('conversation-accepted', ({ conversationId, otherUserId, otherUser }) => {
      setActiveConversation({ conversationId, otherUserId, otherUser });
      setMessages([]);
      setConversationRequests((previous) => previous.filter((request) => request.conversationId !== conversationId));
      setStatus(`${otherUser.username} accepted your chat request.`);
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
      setStatus('Please enter a user ID and password.');
      return;
    }
    if (authMode === 'register' && !username.trim()) {
      setStatus('Please enter a display name.');
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
          <h1>Secure Chat</h1>
          <p>Encrypted 1-to-1 messaging with automatic translation</p>

          <div className="auth-tabs">
            <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Create account</button>
            <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Sign in</button>
          </div>

          <div className="field">
            <label>User ID</label>
            <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Choose a unique ID" autoComplete="username" />
          </div>

          {authMode === 'register' && (
            <div className="field">
              <label>Display name</label>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Your name" />
            </div>
          )}

          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} />
          </div>

          {authMode === 'register' && (
            <div className="field">
              <label>Preferred language</label>
              <select value={preferredLanguage} onChange={(event) => setPreferredLanguage(event.target.value)}>
                {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          )}

          <button onClick={handleAuth} className="primary-button">
            {authMode === 'register' ? 'Create account' : 'Sign in'}
          </button>
          <p className="status-text">{status}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>💬 Chat</h1>
        <p className="user-info">Signed in as <strong>{username}</strong></p>

        {conversationRequests.length > 0 && (
          <div className="requests-panel">
            <h3>Chat requests</h3>
            {conversationRequests.map((request) => (
              <div key={request.conversationId} className="request-item">
                <p>{request.senderUser.username}</p>
                <div className="request-actions">
                  <button className="accept-btn" onClick={() => socket.emit('accept-conversation', { conversationId: request.conversationId })}>Accept</button>
                  <button className="reject-btn" onClick={() => setConversationRequests((previous) => previous.filter((item) => item.conversationId !== request.conversationId))}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="contacts-panel">
          <h3>Online contacts</h3>
          {onlineUsers.length === 0 ? <p className="empty-text">No other users online.</p> : (
            <ul>
              {onlineUsers.map((user) => (
                <li key={user.userId}>
                  <div><strong>{user.username}</strong><span>{user.preferredLanguage.toUpperCase()}</span></div>
                  <button className="contact-btn" onClick={() => socket.emit('initiate-conversation', { targetUserId: user.userId })} disabled={activeConversation?.otherUserId === user.userId}>
                    {activeConversation?.otherUserId === user.userId ? 'Active' : 'Chat'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="chat-panel">
        {!activeConversation ? (
          <div className="no-conversation"><p>Select a contact to start a private chat.</p><p className="hint">🔒 Messages are encrypted and automatically translated.</p></div>
        ) : (
          <>
            <div className="chat-header"><h2>{activeConversation.otherUser.username}</h2><span className="language-badge">{activeConversation.otherUser.preferredLanguage.toUpperCase()}</span></div>
            <div className="messages">
              {messages.length === 0 ? <div className="empty-state">Start the conversation</div> : messages.map((message) => (
                <div key={message.id} className={`message ${message.isOwnMessage ? 'own' : ''}`}>
                  <div className="message-header"><strong>{message.senderName}</strong><span>{new Date(message.createdAt).toLocaleTimeString()}</span></div>
                  <div className="message-text">{message.text}</div>
                  {message.originalText !== message.text && <div className="translation-note">Original: {message.originalText}</div>}
                  <div className="message-security">🔒 Encrypted</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="composer"><input value={messageInput} onChange={(event) => setMessageInput(event.target.value)} onKeyDown={handleKeyDown} placeholder="Type an encrypted message..." /><button onClick={handleSend}>Send</button></div>
          </>
        )}
        <div className="status-bar">{status}</div>
      </main>
    </div>
  );
}

export default App;
