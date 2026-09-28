import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';

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
  res.json({ ok: true, message: 'Secure chat server is running' });
});

const accounts = new Map();
const activeUsers = new Map();
const userSockets = new Map();
const conversations = new Map();

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, account) {
  try {
    const actual = hashPassword(password, account.salt);
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(account.passwordHash, 'hex'));
  } catch {
    return false;
  }
}

function publicUser(account) {
  return { userId: account.userId, username: account.username, preferredLanguage: account.preferredLanguage };
}

function conversationIdFor(firstUserId, secondUserId) {
  return [firstUserId, secondUserId].sort().join('_');
}

function createSharedSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function encryptMessage(message, sharedSecret) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(sharedSecret, 'hex'), iv);
    return `${iv.toString('hex')}:${cipher.update(message, 'utf8', 'hex')}${cipher.final('hex')}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return null;
  }
}

async function translateText(text, targetLanguage) {
  try {
    const response = await fetch('https://translate.argosopentech.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'auto', target: targetLanguage, format: 'text' })
    });

    if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);

    const data = await response.json();
    return data?.translatedText || text;
  } catch (error) {
    console.warn('Translation failed; using original text:', error.message);
    return text;
  }
}

function emitOnlineUsers(socket) {
  socket.emit('online-users', Array.from(activeUsers.values()).map((user) => ({
    userId: user.userId,
    username: user.username,
    preferredLanguage: user.preferredLanguage
  })));
}

io.on('connection', (socket) => {
  socket.on('register-account', ({ userId, username, password, preferredLanguage }) => {
    if (!userId?.trim() || !username?.trim() || !password) {
      socket.emit('auth-error', { message: 'User ID、用户名和密码都是必填项。' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(userId.trim())) {
      socket.emit('auth-error', { message: 'User ID 只能包含字母、数字、下划线或短横线，长度 3-32。' });
      return;
    }
    if (password.length < 6) {
      socket.emit('auth-error', { message: '密码长度至少 6 位。' });
      return;
    }
    if (accounts.has(userId.trim())) {
      socket.emit('auth-error', { message: '该用户ID已存在，请直接登录。' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const account = {
      userId: userId.trim(),
      username: username.trim(),
      preferredLanguage: preferredLanguage || 'zh',
      salt,
      passwordHash: hashPassword(password, salt)
    };

    accounts.set(account.userId, account);
    activeUsers.set(account.userId, { ...publicUser(account), socketId: socket.id });
    userSockets.set(account.userId, socket.id);
    socket.data.userId = account.userId;

    socket.emit('auth-success', { user: publicUser(account) });
    io.emit('user-online', publicUser(account));
    emitOnlineUsers(socket);
    console.log(`用户注册: ${account.userId}`);
  });

  socket.on('login-account', ({ userId, password }) => {
    const account = accounts.get(userId?.trim());
    if (!account || !password || !verifyPassword(password, account)) {
      socket.emit('auth-error', { message: '用户ID或密码不正确。' });
      return;
    }

    activeUsers.set(account.userId, { ...publicUser(account), socketId: socket.id });
    userSockets.set(account.userId, socket.id);
    socket.data.userId = account.userId;

    socket.emit('auth-success', { user: publicUser(account) });
    io.emit('user-online', publicUser(account));
    emitOnlineUsers(socket);
    console.log(`用户登录: ${account.userId}`);
  });

  socket.on('get-online-users', () => emitOnlineUsers(socket));

  socket.on('initiate-conversation', ({ targetUserId }) => {
    const senderId = socket.data.userId;
    const target = activeUsers.get(targetUserId);

    if (!senderId || !target || senderId === targetUserId) {
      socket.emit('error-message', { message: '该用户不可用。' });
      return;
    }

    const conversationId = conversationIdFor(senderId, targetUserId);
    if (!conversations.has(conversationId)) {
      conversations.set(conversationId, {
        conversationId,
        user1Id: senderId,
        user2Id: targetUserId,
        sharedSecret: createSharedSecret()
      });
    }

    socket.emit('conversation-initiated', { conversationId, targetUserId, targetUser: target });
    io.to(target.socketId).emit('conversation-request', {
      conversationId,
      senderId,
      senderUser: activeUsers.get(senderId)
    });
  });

  socket.on('accept-conversation', ({ conversationId }) => {
    const conversation = conversations.get(conversationId);
    const userId = socket.data.userId;

    if (!conversation || !userId || ![conversation.user1Id, conversation.user2Id].includes(userId)) {
      socket.emit('error-message', { message: '对话不存在。' });
      return;
    }

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
    const otherUser = activeUsers.get(otherUserId);

    socket.emit('conversation-accepted', { conversationId, otherUserId, otherUser });

    if (otherUser) {
      io.to(otherUser.socketId).emit('conversation-accepted', {
        conversationId,
        otherUserId: userId,
        otherUser: activeUsers.get(userId)
      });
    }
  });

  socket.on('chat:send', async ({ conversationId, text }) => {
    const senderId = socket.data.userId;
    const conversation = conversations.get(conversationId);

    if (!senderId || !conversation || !text?.trim() || ![conversation.user1Id, conversation.user2Id].includes(senderId)) {
      socket.emit('error-message', { message: '无法发送消息。' });
      return;
    }

    const recipientId = conversation.user1Id === senderId ? conversation.user2Id : conversation.user1Id;
    const sender = activeUsers.get(senderId);
    const recipient = activeUsers.get(recipientId);
    const originalText = text.trim();

    const encryptedMessage = encryptMessage(originalText, conversation.sharedSecret);
    if (!encryptedMessage) {
      socket.emit('error-message', { message: '消息加密失败。' });
      return;
    }

    const translatedText = recipient && recipient.preferredLanguage !== sender.preferredLanguage
      ? await translateText(originalText, recipient.preferredLanguage)
      : originalText;

    const payload = {
      id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      conversationId,
      senderId,
      senderName: sender.username,
      text: originalText,
      originalText,
      encryptedMessage,
      language: sender.preferredLanguage,
      createdAt: new Date().toISOString(),
      isOwnMessage: true
    };

    socket.emit('chat:message', payload);

    if (recipient) {
      io.to(recipient.socketId).emit('chat:message', {
        ...payload,
        text: translatedText,
        isOwnMessage: false
      });
    }
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (!userId) return;

    const active = activeUsers.get(userId);
    if (active?.socketId === socket.id) {
      activeUsers.delete(userId);
      userSockets.delete(userId);
      io.emit('user-offline', { userId, username: active.username });
      console.log(`用户断开: ${userId}`);
    }
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Secure 1-to-1 chat server running on http://0.0.0.0:${PORT}`);
});
