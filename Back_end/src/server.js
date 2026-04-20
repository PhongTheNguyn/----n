// @ts-nocheck
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const webrtcRoutes = require('./routes/webrtcRoutes');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const blockRoutes = require('./routes/blockRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { prisma } = require('./config/db');

const app = express();
const server = http.createServer(app);

// Cho phép nhiều origin (localhost và IP LAN), cách nhau bằng dấu phẩy
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (corsOrigins.length === 0) corsOrigins.push('http://localhost:4200');

const io = new Server(server, {
  cors: { origin: corsOrigins }
});

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(uploadDir)));

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/block', blockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webrtc', webrtcRoutes);

const PORT = process.env.PORT || 3000;

const queue = [];
const rooms = new Map(); // roomId -> { peerIds: [id1, id2], userA, userB, sessionId? }
const normalizeFilterValue = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const normalizeGenderFilter = (v) => (v === 'male' || v === 'female' ? v : 'all');
const normalizeCountryFilter = (v) => (!v || v === 'all' ? 'all' : v);

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Chưa đăng nhập'));
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Token không hợp lệ'));
  }
});

io.on('connection', (socket) => {
  socket.on('join-queue', async (filters) => {
    const requestedGender = normalizeFilterValue(filters?.gender);
    const requestedCountry = normalizeFilterValue(filters?.country);

    const myProfile = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: {
        isBanned: true,
        bannedUntil: true,
        gender: true,
        country: true,
        displayName: true,
        avatarUrl: true
      }
    }).catch(() => null);
    if (myProfile?.isBanned && (myProfile.bannedUntil == null || myProfile.bannedUntil > new Date())) {
      socket.emit('searching');
      return;
    }
    const me = {
      socketId: socket.id,
      userId: socket.userId,
      prefGender: normalizeGenderFilter(requestedGender),
      prefCountry: normalizeCountryFilter(requestedCountry),
      userGender: normalizeFilterValue(myProfile?.gender),
      userCountry: normalizeFilterValue(myProfile?.country),
      displayName: myProfile?.displayName || null,
      avatarUrl: myProfile?.avatarUrl || null
    };

    const blockedByMe = await prisma.blocked_users
      .findMany({ where: { blocker_id: socket.userId }, select: { blocked_id: true } })
      .then((rows) => new Set(rows.map((r) => r.blocked_id)))
      .catch(() => new Set());

    let match = null;
    for (const q of queue) {
      if (q.socketId === socket.id) continue;
      if (blockedByMe.has(q.userId)) continue;
      const blockedByPeer = await prisma.blocked_users
        .findFirst({ where: { blocker_id: q.userId, blocked_id: socket.userId } })
        .catch(() => null);
      if (blockedByPeer) continue;
      const qPrefGender = normalizeGenderFilter(normalizeFilterValue(q.prefGender || q.gender));
      const qPrefCountry = normalizeCountryFilter(normalizeFilterValue(q.prefCountry || q.country));
      const qUserGender = normalizeFilterValue(q.userGender);
      const qUserCountry = normalizeFilterValue(q.userCountry);

      const iAcceptPeer = (me.prefGender === 'all' || me.prefGender === qUserGender)
        && (me.prefCountry === 'all' || me.prefCountry === qUserCountry);
      const peerAcceptMe = (qPrefGender === 'all' || qPrefGender === me.userGender)
        && (qPrefCountry === 'all' || qPrefCountry === me.userCountry);

      if (iAcceptPeer && peerAcceptMe) {
        match = q;
        break;
      }
    }

    if (match) {
      const roomId = `room-${Date.now()}`;
      const idx = queue.findIndex((q) => q.socketId === match.socketId);
      queue.splice(idx, 1);

      rooms.set(roomId, {
        peerIds: [socket.id, match.socketId],
        userA: socket.userId,
        userB: match.userId,
        sessionId: null
      });
      socket.join(roomId);
      io.sockets.sockets.get(match.socketId)?.join(roomId);

      const [peerProfile] = await Promise.all([
        prisma.user.findUnique({
          where: { id: match.userId },
          select: { displayName: true, avatarUrl: true }
        }).catch(() => null)
      ]);

      prisma.call_sessions
        .create({
          data: {
            user_a_id: socket.userId,
            user_b_id: match.userId,
            room_id: roomId
          }
        })
        .then((s) => {
          const r = rooms.get(roomId);
          if (r) r.sessionId = s.id;
        })
        .catch((e) => console.error('create call_session:', e));

      socket.emit('matched', {
        roomId,
        peerId: match.socketId,
        peerUserId: match.userId,
        peerDisplayName: peerProfile?.displayName || null,
        peerAvatarUrl: peerProfile?.avatarUrl || null,
        isInitiator: true
      });
      io.to(match.socketId).emit('matched', {
        roomId,
        peerId: socket.id,
        peerUserId: socket.userId,
        peerDisplayName: me.displayName,
        peerAvatarUrl: me.avatarUrl,
        isInitiator: false
      });
    } else {
      queue.push(me);
      socket.emit('searching');
    }
  });

  socket.on('leave-queue', () => {
    const idx = queue.findIndex((q) => q.socketId === socket.id);
    if (idx >= 0) queue.splice(idx, 1);
    socket.emit('left-queue');
  });

  socket.on('offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('offer', { offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('camera-state', ({ roomId, isCameraOff }) => {
    if (!roomId) return;
    socket.to(roomId).emit('peer-camera-state', { isCameraOff: !!isCameraOff, from: socket.id });
  });

  socket.on('chat-message', ({ roomId, text }) => {
    if (!roomId || typeof text !== 'string') return;
    const clean = text.trim().slice(0, 500);
    if (!clean) return;
    socket.to(roomId).emit('peer-chat-message', { text: clean, from: socket.id, sentAt: Date.now() });
  });

  function endCall(roomId) {
    const r = rooms.get(roomId);
    if (r) {
      (r.peerIds || r).forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
      if (r.sessionId) {
        prisma.call_sessions.update({ where: { id: r.sessionId }, data: { ended_at: new Date() } }).catch(() => {});
      }
      rooms.delete(roomId);
    }
  }

  socket.on('skip', (roomId) => {
    socket.to(roomId).emit('peer-skipped');
    endCall(roomId);
  });

  socket.on('end-call', (roomId) => {
    socket.to(roomId).emit('peer-ended');
    endCall(roomId);
  });

  socket.on('disconnect', () => {
    const idx = queue.findIndex((q) => q.socketId === socket.id);
    if (idx >= 0) queue.splice(idx, 1);
    rooms.forEach((r, roomId) => {
      const peerIds = r.peerIds || r;
      if (Array.isArray(peerIds) && peerIds.includes(socket.id)) {
        socket.to(roomId).emit('peer-disconnected');
        if (r.sessionId) {
          prisma.call_sessions.update({ where: { id: r.sessionId }, data: { ended_at: new Date() } }).catch(() => {});
        }
        peerIds.forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
        rooms.delete(roomId);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0',() => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
