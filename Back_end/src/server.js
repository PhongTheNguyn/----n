require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const blockRoutes = require('./routes/blockRoutes');
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

const PORT = process.env.PORT || 3000;

const queue = [];
const rooms = new Map();

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
    const { gender, country } = filters || {};
    const me = { socketId: socket.id, userId: socket.userId, gender: gender || 'all', country: country || 'all' };

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
      const gMatch = q.gender === 'all' || me.gender === 'all' || q.gender === me.gender;
      const cMatch = q.country === 'all' || me.country === 'all' || q.country === me.country;
      if (gMatch && cMatch) {
        match = q;
        break;
      }
    }

    if (match) {
      const roomId = `room-${Date.now()}`;
      const idx = queue.findIndex((q) => q.socketId === match.socketId);
      queue.splice(idx, 1);

      rooms.set(roomId, [socket.id, match.socketId]);
      socket.join(roomId);
      io.sockets.sockets.get(match.socketId)?.join(roomId);

      socket.emit('matched', { roomId, peerId: match.socketId, peerUserId: match.userId, isInitiator: true });
      io.to(match.socketId).emit('matched', { roomId, peerId: socket.id, peerUserId: socket.userId, isInitiator: false });
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

  socket.on('skip', (roomId) => {
    socket.to(roomId).emit('peer-skipped');
    const peers = rooms.get(roomId);
    if (peers) {
      peers.forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
      rooms.delete(roomId);
    }
  });

  socket.on('end-call', (roomId) => {
    socket.to(roomId).emit('peer-ended');
    const peers = rooms.get(roomId);
    if (peers) {
      peers.forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
      rooms.delete(roomId);
    }
  });

  socket.on('disconnect', () => {
    const idx = queue.findIndex((q) => q.socketId === socket.id);
    if (idx >= 0) queue.splice(idx, 1);
    rooms.forEach((peers, roomId) => {
      if (peers.includes(socket.id)) {
        socket.to(roomId).emit('peer-disconnected');
        peers.forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
        rooms.delete(roomId);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0',() => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
