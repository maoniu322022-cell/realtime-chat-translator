import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, message: 'Chat server is running' });
});

const roomUsers = new Map();

async function translateText(text, targetLanguage) {
  if (!text || !targetLanguage) {
    return text;
  }

  try {
    const response = await fetch('https://translate.argosopentech.com/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: text,
        source: 'auto',
        target: targetLanguage,
        format: 'text'
      })
    });

    if (!response.ok) {
      throw new Error(`Translation request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.translatedText) {
      return data.translatedText;
    }

    return text;
  } catch (error) {
    console.warn('Translation failed, using original text:', error.message);
    return text;
  }
}

function getRoomSockets(room) {
  const roomSet = io.sockets.adapter.rooms.get(room);
  if (!roomSet) return [];
  return [...roomSet];
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', async ({ username, room, preferredLanguage }) => {
    if (!username || !room) {
      socket.emit('error-message', { message: 'Username and room are required.' });
      return;
    }

    socket.join(room);
    socket.data.username = username;
    socket.data.room = room;
    socket.data.preferredLanguage = preferredLanguage || 'en';

    const members = getRoomSockets(room).map((socketId) => {
      const memberSocket = io.sockets.sockets.get(socketId);
      return {
        id: socketId,
        username: memberSocket?.data?.username || 'Unknown',
        preferredLanguage: memberSocket?.data?.preferredLanguage || 'en'
      };
    });

    roomUsers.set(room, members);

    socket.emit('room-joined', {
      room,
      username,
      preferredLanguage: socket.data.preferredLanguage,
      members
    });

    socket.to(room).emit('user-joined', {
      username,
      room,
      preferredLanguage: socket.data.preferredLanguage
    });
  });

  socket.on('chat:send', async ({ room, text }) => {
    if (!room || !text || !text.trim()) {
      return;
    }

    const senderName = socket.data.username || 'Anonymous';
    const senderLanguage = socket.data.preferredLanguage || 'en';

    const roomSockets = getRoomSockets(room);

    for (const socketId of roomSockets) {
      const targetSocket = io.sockets.sockets.get(socketId);
      const targetLanguage = targetSocket?.data?.preferredLanguage || 'en';
      const shouldTranslate = targetLanguage && targetLanguage.toLowerCase() !== senderLanguage.toLowerCase();

      let displayText = text.trim();
      if (shouldTranslate) {
        displayText = await translateText(text.trim(), targetLanguage);
      }

      const payload = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        room,
        username: senderName,
        text: displayText,
        originalText: text.trim(),
        language: senderLanguage,
        createdAt: new Date().toISOString(),
        isOwnMessage: socketId === socket.id
      };

      io.to(socketId).emit('chat:message', payload);
    }
  });

  socket.on('disconnect', () => {
    const room = socket.data.room;
    if (room) {
      socket.to(room).emit('user-left', {
        username: socket.data.username || 'Unknown',
        room
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
});
