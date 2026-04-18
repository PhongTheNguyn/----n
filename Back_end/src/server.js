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

// In-memory storage (consider Redis for production scaling)
const queue = [];
const rooms = new Map(); // roomId -> { peerIds: [socketId1, socketId2], userA, userB, sessionId }

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    console.log('[Socket] Connection rejected: No token');
    return next(new Error('Chưa đăng nhập'));
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    console.log('[Socket] User connected:', socket.userId, 'socket:', socket.id);
    next();
  } catch (err) {
    console.log('[Socket] Token validation failed:', err.message);
    next(new Error('Token không hợp lệ'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id} (user: ${socket.userId})`);

  socket.on('join-queue', async (filters) => {
    console.log(`[Socket] User ${socket.userId} joining queue with filters:`, filters);
    const { gender, country } = filters || {};
    const me = { socketId: socket.id, userId: socket.userId, gender: gender || 'all', country: country || 'all' };

    // Check if user is banned
    const u = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { isBanned: true, bannedUntil: true }
    }).catch(() => null);

    if (u?.isBanned && (u.bannedUntil == null || u.bannedUntil > new Date())) {
      console.log(`[Socket] User ${socket.userId} is banned, cannot join queue`);
      socket.emit('searching');
      return;
    }

    // Get blocked users
    const blockedByMe = await prisma.blocked_users
      .findMany({ where: { blocker_id: socket.userId }, select: { blocked_id: true } })
      .then((rows) => new Set(rows.map((r) => r.blocked_id)))
      .catch(() => new Set());

    // Find match
    let match = null;
    const matchIndex = -1;
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
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
        queue.splice(i, 1);
        break;
      }
    }

    if (match) {
      console.log(`[Socket] Match found: ${socket.userId} <-> ${match.userId}`);
      const roomId = `room-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const roomData = {
        peerIds: [socket.id, match.socketId],
        userA: socket.userId,
        userB: match.userId,
        sessionId: null
      };
      rooms.set(roomId, roomData);

      // Join both sockets to room
      socket.join(roomId);
      const peerSocket = io.sockets.sockets.get(match.socketId);
      if (peerSocket) {
        peerSocket.join(roomId);
      }

      // Create call session record
      try {
        const session = await prisma.call_sessions.create({
          data: {
            user_a_id: socket.userId,
            user_b_id: match.userId,
            room_id: roomId
          }
        });
        roomData.sessionId = session.id;
        console.log(`[Socket] Call session created: ${session.id}`);
      } catch (e) {
        console.error('[Socket] Failed to create call session:', e);
      }

      // Notify both peers
      socket.emit('matched', {
        roomId,
        peerId: match.socketId,
        peerUserId: match.userId,
        isInitiator: true
      });

      if (peerSocket) {
        peerSocket.emit('matched', {
          roomId,
          peerId: socket.id,
          peerUserId: socket.userId,
          isInitiator: false
        });
      }
    } else {
      console.log(`[Socket] No match, user ${socket.userId} added to queue`);
      queue.push(me);
      socket.emit('searching');
    }
  });

  socket.on('leave-queue', () => {
    const idx = queue.findIndex((q) => q.socketId === socket.id);
    if (idx >= 0) {
      queue.splice(idx, 1);
      console.log(`[Socket] User ${socket.userId} left queue`);
    }
    socket.emit('left-queue');
  });

  socket.on('offer', ({ roomId, offer }) => {
    const room = rooms.get(roomId);
    if (!room) {
      console.warn(`[Socket] Offer for non-existent room: ${roomId}`);
      return;
    }
    socket.to(roomId).emit('offer', { offer, from: socket.id });
    console.log(`[Socket] Offer forwarded in room ${roomId} from ${socket.userId}`);
  });

  socket.on('answer', ({ roomId, answer }) => {
    const room = rooms.get(roomId);
    if (!room) {
      console.warn(`[Socket] Answer for non-existent room: ${roomId}`);
      return;
    }
    socket.to(roomId).emit('answer', { answer, from: socket.id });
    console.log(`[Socket] Answer forwarded in room ${roomId} from ${socket.userId}`);
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    const room = rooms.get(roomId);
    if (!room) {
      console.warn(`[Socket] ICE candidate for non-existent room: ${roomId}`);
      return;
    }
    socket.to(roomId).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('skip', (roomId) => {
    console.log(`[Socket] User ${socket.userId} skipping room ${roomId}`);
    const room = rooms.get(roomId);
    if (room) {
      socket.to(roomId).emit('peer-skipped');
      endCall(roomId);
    }
  });

  socket.on('end-call', (roomId) => {
    console.log(`[Socket] User ${socket.userId} ending call in room ${roomId}`);
    const room = rooms.get(roomId);
    if (room) {
      socket.to(roomId).emit('peer-ended');
      endCall(roomId);
    }
  });

  function endCall(roomId) {
    const room = rooms.get(roomId);
    if (room) {
      console.log(`[Socket] Ending call in room ${roomId}`);
      // Notify all peers in room
      room.peerIds.forEach((peerSocketId) => {
        const peerSocket = io.sockets.sockets.get(peerSocketId);
        if (peerSocket) {
          peerSocket.leave(roomId);
        }
      });

      // Update call session
      if (room.sessionId) {
        prisma.call_sessions.update({
          where: { id: room.sessionId },
          data: { ended_at: new Date() }
        }).catch(err => console.error('[Socket] Failed to update call session:', err));
      }

      rooms.delete(roomId);
      console.log(`[Socket] Room ${roomId} cleaned up`);
    }
  }

  socket.on('disconnect', (reason) => {
    console.log(`[Socket] Client disconnected: ${socket.id} (user: ${socket.userId}), reason: ${reason}`);

    // Remove from queue
    const queueIdx = queue.findIndex((q) => q.socketId === socket.id);
    if (queueIdx >= 0) {
      queue.splice(queueIdx, 1);
      console.log(`[Socket] User ${socket.userId} removed from queue`);
    }

    // Handle room cleanup
    rooms.forEach((room, roomId) => {
      if (room.peerIds.includes(socket.id)) {
        console.log(`[Socket] User ${socket.userId} was in room ${roomId}, notifying peer`);
        socket.to(roomId).emit('peer-disconnected');

        if (room.sessionId) {
          prisma.call_sessions.update({
            where: { id: room.sessionId },
            data: { ended_at: new Date() }
          }).catch(err => console.error('[Socket] Failed to update call session on disconnect:', err));
        }

        // Remove all peers from room
        room.peerIds.forEach((peerSocketId) => {
          const peerSocket = io.sockets.sockets.get(peerSocketId);
          if (peerSocket) {
            peerSocket.leave(roomId);
          }
        });

        rooms.delete(roomId);
        console.log(`[Socket] Room ${roomId} deleted due to disconnect`);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] CORS origins:`, corsOrigins);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[Server] HTTP server closed');
  });
  io.close(() => {
    console.log('[Server] Socket.io server closed');
  });
});
