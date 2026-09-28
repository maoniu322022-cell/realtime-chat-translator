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
  res.json({ ok: true, message: '1对1加密聊天服务器运行中' });
});

// 活跃用户: { userId: { socketId, username, preferredLanguage } }
const activeUsers = new Map();
// 用户映射: { userId: socketId }
const userSockets = new Map();
// 对话: { conversationId: { user1Id, user2Id, sharedSecret } }
const conversations = new Map();

function generateConversationId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

function generateSharedSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function encryptMessage(message, sharedSecret) {
  try {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(sharedSecret, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('加密错误:', error);
    return null;
  }
}

async function translateText(text, targetLanguage) {
  if (!text || !targetLanguage) return text;

  try {
    const response = await fetch('https://translate.argosopentech.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source: 'auto',
        target: targetLanguage,
        format: 'text'
      })
    });

    if (!response.ok) throw new Error(`翻译请求失败: ${response.status}`);

    const data = await response.json();
    return data?.translatedText || text;
  } catch (error) {
    console.warn('翻译失败，使用原文:', error.message);
    return text;
  }
}

io.on('connection', (socket) => {
  console.log('用户已连接:', socket.id);

  socket.on('register-user', ({ userId, username, preferredLanguage }) => {
    if (!userId || !username) {
      socket.emit('error-message', { message: '需要用户ID和用户名' });
      return;
    }

    activeUsers.set(userId, {
      userId,
      socketId: socket.id,
      username,
      preferredLanguage: preferredLanguage || 'en'
    });

    userSockets.set(userId, socket.id);
    socket.data.userId = userId;
    socket.data.username = username;
    socket.data.preferredLanguage = preferredLanguage || 'en';

    // 广播用户上线
    io.emit('user-online', {
      userId,
      username,
      preferredLanguage: socket.data.preferredLanguage
    });

    socket.emit('user-registered', {
      userId,
      username,
      preferredLanguage: socket.data.preferredLanguage
    });

    // 发送在线用户列表
    socket.emit('online-users', Array.from(activeUsers.values()));
    console.log(`用户已注册: ${userId} (${username})`);
  });

  socket.on('get-online-users', () => {
    socket.emit('online-users', Array.from(activeUsers.values()));
  });

  socket.on('initiate-conversation', ({ targetUserId }) => {
    const senderId = socket.data.userId;

    if (!senderId || !targetUserId || senderId === targetUserId) {
      socket.emit('error-message', { message: '无效的收件人' });
      return;
    }

    const conversationId = generateConversationId(senderId, targetUserId);
    let conversation = conversations.get(conversationId);

    if (!conversation) {
      conversation = {
        conversationId,
        user1Id: senderId,
        user2Id: targetUserId,
        sharedSecret: generateSharedSecret()
      };
      conversations.set(conversationId, conversation);
    }

    const targetSocketId = userSockets.get(targetUserId);
    const senderUser = activeUsers.get(senderId);

    socket.emit('conversation-initiated', {
      conversationId,
      targetUserId,
      targetUser: activeUsers.get(targetUserId)
    });

    if (targetSocketId) {
      io.to(targetSocketId).emit('conversation-request', {
        conversationId,
        senderId,
        senderUser
      });
    }
  });

  socket.on('accept-conversation', ({ conversationId }) => {
    const userId = socket.data.userId;
    const conversation = conversations.get(conversationId);

    if (!conversation) {
      socket.emit('error-message', { message: '对话不存在' });
      return;
    }

    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
    const otherSocketId = userSockets.get(otherUserId);

    socket.emit('conversation-accepted', {
      conversationId,
      otherUserId,
      otherUser: activeUsers.get(otherUserId)
    });

    if (otherSocketId) {
      io.to(otherSocketId).emit('conversation-accepted', {
        conversationId,
        otherUserId: userId,
        otherUser: activeUsers.get(userId)
      });
    }

    console.log(`对话已接受: ${conversationId}`);
  });

  socket.on('chat:send', async ({ conversationId, text }) => {
    if (!conversationId || !text || !text.trim()) {
      return;
    }

    const senderId = socket.data.userId;
    const conversation = conversations.get(conversationId);

    if (!conversation) {
      socket.emit('error-message', { message: '对话不存在' });
      return;
    }

    const recipientId = conversation.user1Id === senderId ? conversation.user2Id : conversation.user1Id;
    const senderLanguage = socket.data.preferredLanguage || 'en';
    const recipientUser = activeUsers.get(recipientId);
    const recipientLanguage = recipientUser?.preferredLanguage || 'en';

    // 加密消息
    const encryptedMessage = encryptMessage(text.trim(), conversation.sharedSecret);
    if (!encryptedMessage) {
      socket.emit('error-message', { message: '加密失败' });
      return;
    }

    // 翻译消息
    let translatedText = text.trim();
    if (recipientLanguage && recipientLanguage.toLowerCase() !== senderLanguage.toLowerCase()) {
      translatedText = await translateText(text.trim(), recipientLanguage);
    }

    const payload = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      conversationId,
      senderId,
      senderName: socket.data.username,
      text: translatedText,
      originalText: text.trim(),
      encryptedMessage,
      language: senderLanguage,
      createdAt: new Date().toISOString(),
      isOwnMessage: true
    };

    // 发送给发送者
    socket.emit('chat:message', payload);

    // 发送给接收者
    const recipientSocketId = userSockets.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('chat:message', {
        ...payload,
        isOwnMessage: false,
        text: await translateText(text.trim(), recipientLanguage)
      });
    }
  });

  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId) {
      activeUsers.delete(userId);
      userSockets.delete(userId);
      io.emit('user-offline', { userId, username: socket.data.username });
      console.log(`用户已断开连接: ${userId}`);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`1对1加密聊天服务器运行在 http://localhost:${PORT}`);
});
