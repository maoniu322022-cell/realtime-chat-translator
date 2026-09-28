import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const socketUrl = 'http://localhost:3001';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'ru', label: 'Russian' }
];

function App() {
  const [socket, setSocket] = useState(null);
  const [joined, setJoined] = useState(false);
  const [username, setUsername] = useState('Guest');
  const [room, setRoom] = useState('general');
  const [preferredLanguage, setPreferredLanguage] = useState('en');
  const [messageInput, setMessageInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [status, setStatus] = useState('Choose a username and join a room.');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true
    });

    newSocket.on('connect', () => {
      setStatus('Connected to the chat server.');
    });

    newSocket.on('room-joined', ({ room: joinedRoom, members: roomMembers }) => {
      setJoined(true);
      setStatus(`Joined room "${joinedRoom}".`);
      setMembers(roomMembers);
    });

    newSocket.on('user-joined', ({ username: memberName, preferredLanguage: memberLanguage }) => {
      setStatus(`${memberName} joined the room (${memberLanguage}).`);
    });

    newSocket.on('user-left', ({ username: leftUser }) => {
      setStatus(`${leftUser} left the room.`);
    });

    newSocket.on('chat:message', (payload) => {
      setMessages((prev) => [...prev, payload]);
    });

    newSocket.on('error-message', ({ message }) => {
      setStatus(message);
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoinRoom = () => {
    if (!socket || !username.trim() || !room.trim()) {
      setStatus('Please enter a username and room name.');
      return;
    }

    socket.emit('join-room', {
      username: username.trim(),
      room: room.trim(),
      preferredLanguage
    });
  };

  const handleSend = () => {
    if (!socket || !joined || !messageInput.trim()) {
      return;
    }

    socket.emit('chat:send', {
      room,
      text: messageInput.trim()
    });

    setMessageInput('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="app-shell">
      <div className="sidebar">
        <h1>Chat Translator</h1>

        <div className="field">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Your name" />
        </div>

        <div className="field">
          <label>Room</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="general" />
        </div>

        <div className="field">
          <label>Preferred language</label>
          <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)}>
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button onClick={handleJoinRoom} className="primary-button">
          {joined ? 'Reconnect to room' : 'Join room'}
        </button>

        <div className="member-panel">
          <h3>Members</h3>
          {members.length > 0 ? (
            <ul>
              {members.map((member) => (
                <li key={member.id}>{member.username}</li>
              ))}
            </ul>
          ) : (
            <p>No one in room yet.</p>
          )}
        </div>
      </div>

      <div className="chat-panel">
        <div className="status-bar">{status}</div>

        <div className="messages">
          {messages.length === 0 ? (
            <div className="empty-state">No messages yet. Start the conversation.</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.isOwnMessage ? 'own' : ''}`}
              >
                <div className="message-header">
                  <strong>{message.username}</strong>
                  <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
                </div>
                <div className="message-text">{message.text}</div>
                {message.originalText && message.originalText !== message.text && (
                  <div className="translation-note">Original: {message.originalText}</div>
                )}
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
            placeholder="Type a message..."
            disabled={!joined}
          />
          <button onClick={handleSend} disabled={!joined}>Send</button>
        </div>
      </div>
    </div>
  );
}

export default App;
