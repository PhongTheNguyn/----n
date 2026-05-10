// @ts-nocheck
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const http = require('http');
const { Server } = require('socket.io');
const webrtcRoutes = require('./routes/webrtcRoutes');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const blockRoutes = require('./routes/blockRoutes');
const adminRoutes = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { prisma } = require('./config/db');
const {
  getFilterCoinCost,
  chargeFilterCoins,
  chargeCallDuration,
  getBillingSummary
} = require('./services/billingService');

const app = express();
app.set('trust proxy', 1);
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
const userSocketMap = new Map(); // userId -> Set<socketId>

function registerUserSocket(userId, socketId) {
  if (!userId || !socketId) return;
  if (!userSocketMap.has(userId)) {
    userSocketMap.set(userId, new Set());
  }
  userSocketMap.get(userId).add(socketId);
}

function unregisterUserSocket(userId, socketId) {
  if (!userId || !socketId) return;
  const set = userSocketMap.get(userId);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) {
    userSocketMap.delete(userId);
  }
}

function enforceBanOnUser(userId, payload) {
  const set = userSocketMap.get(userId);
  if (!set || set.size === 0) return;
  for (const socketId of set) {
    io.to(socketId).emit('account-banned', payload);
    io.sockets.sockets.get(socketId)?.disconnect(true);
  }
  userSocketMap.delete(userId);
}

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(uploadDir)));
app.set('io', io);
app.set('enforceBanOnUser', enforceBanOnUser);

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/block', blockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/webrtc', webrtcRoutes);
app.use('/api/payment', paymentRoutes);

const PORT = process.env.PORT || 3000;
const SKIP_REMATCH_COOLDOWN_MS = Number(process.env.SKIP_REMATCH_COOLDOWN_MS || 10000);

const queue = [];
const rooms = new Map(); // roomId -> { peerIds: [id1, id2], userA, userB, sessionId?, startedAtMs? }
const engagedSockets = new Set(); // socketIds currently in room or being matched
const recentSkips = new Map(); // userId -> Map<otherUserId, expiresAtMs>
let joinQueueBusy = false;
const normalizeFilterValue = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const normalizeGenderFilter = (v) => (v === 'male' || v === 'female' ? v : 'all');
const normalizeCountryFilter = (v) => (!v || v === 'all' ? 'all' : v);

function removeSocketFromQueue(socketId) {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i]?.socketId === socketId) {
      queue.splice(i, 1);
    }
  }
}

function findRoomIdBySocketId(socketId) {
  for (const [roomId, roomData] of rooms.entries()) {
    const peerIds = Array.isArray(roomData?.peerIds) ? roomData.peerIds : roomData;
    if (Array.isArray(peerIds) && peerIds.includes(socketId)) {
      return roomId;
    }
  }
  return null;
}

function createRoomId() {
  if (typeof crypto.randomUUID === 'function') {
    return `room-${crypto.randomUUID()}`;
  }
  return `room-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markRecentSkipPair(userA, userB) {
  if (!userA || !userB) return;
  const expiresAt = Date.now() + SKIP_REMATCH_COOLDOWN_MS;

  if (!recentSkips.has(userA)) recentSkips.set(userA, new Map());
  if (!recentSkips.has(userB)) recentSkips.set(userB, new Map());

  recentSkips.get(userA).set(userB, expiresAt);
  recentSkips.get(userB).set(userA, expiresAt);
}

function hasRecentSkipBetween(userA, userB) {
  if (!userA || !userB) return false;
  const now = Date.now();
  const mapA = recentSkips.get(userA);
  if (!mapA) return false;
  const expiresAt = mapA.get(userB);
  if (!expiresAt) return false;
  if (expiresAt <= now) {
    mapA.delete(userB);
    if (mapA.size === 0) recentSkips.delete(userA);
    return false;
  }
  return true;
}

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
  registerUserSocket(socket.userId, socket.id);

  socket.on('join-queue', async (filters) => {
    while (joinQueueBusy) {
      await delay(8);
    }
    joinQueueBusy = true;

    try {
      if (engagedSockets.has(socket.id)) {
        const roomId = findRoomIdBySocketId(socket.id);
        if (roomId) {
          return;
        }
        // Recover from stale engaged state (e.g. previous peer disconnected unexpectedly).
        engagedSockets.delete(socket.id);
      }
      // Keep queue invariant: one socket appears at most once.
      removeSocketFromQueue(socket.id);
      // If this socket is still in an active room, close that room first.
      const activeRoomId = findRoomIdBySocketId(socket.id);
      if (activeRoomId) {
        const activeRoom = rooms.get(activeRoomId);
        const peerIds = Array.isArray(activeRoom?.peerIds) ? activeRoom.peerIds : [];
        peerIds
          .filter((peerSocketId) => peerSocketId !== socket.id)
          .forEach((peerSocketId) => io.to(peerSocketId).emit('peer-skipped'));
        endCall(activeRoomId);
      }

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

      const normalizedFilters = {
        gender: normalizeGenderFilter(requestedGender),
        country: normalizeCountryFilter(requestedCountry)
      };
      const me = {
        socketId: socket.id,
        userId: socket.userId,
        prefGender: normalizedFilters.gender,
        prefCountry: normalizedFilters.country,
        userGender: normalizeFilterValue(myProfile?.gender),
        userCountry: normalizeFilterValue(myProfile?.country),
        displayName: myProfile?.displayName || null,
        avatarUrl: myProfile?.avatarUrl || null
      };

      const [summary, filterCost] = await Promise.all([
        getBillingSummary(socket.userId).catch(() => null),
        Promise.resolve(getFilterCoinCost(normalizedFilters))
      ]);

      if (!summary) {
        socket.emit('billing-error', { message: 'Không thể tải thông tin ví. Vui lòng thử lại.' });
        return;
      }

      if (summary.freeCallSecondsRemainingToday <= 0 && summary.coinBalance <= 0) {
        socket.emit('billing-error', {
          message: 'Bạn đã hết 10 phút miễn phí hôm nay và không đủ coin để gọi tiếp.',
          coinBalance: summary.coinBalance
        });
        return;
      }

      if (filterCost > 0 && summary.coinBalance < filterCost) {
        socket.emit('billing-error', {
          message: `Không đủ coin để dùng bộ lọc (cần ${filterCost} coin).`,
          coinBalance: summary.coinBalance,
          filterCost
        });
        return;
      }

      if (filterCost > 0) {
        try {
          const filterCharge = await chargeFilterCoins(socket.userId, normalizedFilters);
          socket.emit('wallet-updated', {
            coinBalance: filterCharge.coinBalance,
            chargedCoins: filterCharge.chargedCoins,
            type: 'filter'
          });
        } catch (err) {
          socket.emit('billing-error', {
            message: 'Không thể trừ coin cho bộ lọc. Vui lòng thử lại.',
            code: err?.code || 'FILTER_CHARGE_ERROR'
          });
          return;
        }
      }

      const blockedByMe = await prisma.blocked_users
        .findMany({ where: { blocker_id: socket.userId }, select: { blocked_id: true } })
        .then((rows) => new Set(rows.map((r) => r.blocked_id)))
        .catch(() => new Set());

      let match = null;
      for (const q of queue) {
        if (q.socketId === socket.id) continue;
        if (engagedSockets.has(q.socketId)) {
          removeSocketFromQueue(q.socketId);
          continue;
        }
        if (!io.sockets.sockets.get(q.socketId)) {
          removeSocketFromQueue(q.socketId);
          continue;
        }
        if (findRoomIdBySocketId(q.socketId)) {
          removeSocketFromQueue(q.socketId);
          continue;
        }
        if (hasRecentSkipBetween(socket.userId, q.userId) || hasRecentSkipBetween(q.userId, socket.userId)) {
          continue;
        }
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
        // Re-validate at commit time to prevent double-match races.
        if (engagedSockets.has(socket.id) || engagedSockets.has(match.socketId)) {
          socket.emit('searching');
          return;
        }
        engagedSockets.add(socket.id);
        engagedSockets.add(match.socketId);

        const roomId = createRoomId();
        removeSocketFromQueue(match.socketId);

        rooms.set(roomId, {
          peerIds: [socket.id, match.socketId],
          userA: socket.userId,
          userB: match.userId,
          sessionId: null,
          startedAtMs: Date.now()
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
        engagedSockets.delete(socket.id);
        queue.push(me);
        socket.emit('searching');
      }
    } finally {
      joinQueueBusy = false;
    }
  });

  socket.on('leave-queue', () => {
    removeSocketFromQueue(socket.id);
    socket.emit('left-queue');
  });

  socket.on('offer', ({ roomId, offer }) => {
    socket.to(roomId).emit('offer', { roomId, offer, from: socket.id });
  });

  socket.on('answer', ({ roomId, answer }) => {
    socket.to(roomId).emit('answer', { roomId, answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ roomId, candidate }) => {
    socket.to(roomId).emit('ice-candidate', { roomId, candidate, from: socket.id });
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

  async function settleCallBilling(roomId, roomData) {
    const startedAtMs = roomData?.startedAtMs || Date.now();
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
    const userIds = [roomData?.userA, roomData?.userB].filter(Boolean);

    for (const uid of userIds) {
      try {
        const charge = await chargeCallDuration(uid, durationSeconds, {
          roomId,
          sessionId: roomData?.sessionId || null
        });
        const targetSocketId = (roomData.peerIds || []).find((id) => io.sockets.sockets.get(id)?.userId === uid);
        if (targetSocketId) {
          io.to(targetSocketId).emit('wallet-updated', {
            coinBalance: charge.coinBalance,
            chargedCoins: charge.chargedCoins,
            durationSeconds,
            type: 'call'
          });
        }
      } catch (err) {
        console.error('settleCallBilling error:', err);
      }
    }
  }

  function endCall(roomId) {
    const r = rooms.get(roomId);
    if (r) {
      (r.peerIds || []).forEach((id) => engagedSockets.delete(id));
      (r.peerIds || r).forEach((id) => io.sockets.sockets.get(id)?.leave(roomId));
      if (r.sessionId) {
        prisma.call_sessions.update({ where: { id: r.sessionId }, data: { ended_at: new Date() } }).catch(() => {});
      }
      settleCallBilling(roomId, r).catch(() => {});
      rooms.delete(roomId);
    }
  }

  socket.on('skip', (roomId) => {
    const targetRoomId =
      (typeof roomId === 'string' && rooms.has(roomId) && roomId) ||
      findRoomIdBySocketId(socket.id);
    if (!targetRoomId) return;

    const roomData = rooms.get(targetRoomId);
    const peerIds = Array.isArray(roomData?.peerIds) ? roomData.peerIds : [];
    if (roomData?.userA && roomData?.userB) {
      markRecentSkipPair(roomData.userA, roomData.userB);
    }
    peerIds
      .filter((peerSocketId) => peerSocketId !== socket.id)
      .forEach((peerSocketId) => {
        io.to(peerSocketId).emit('peer-skipped');
      });
    endCall(targetRoomId);
  });

  socket.on('end-call', (roomId) => {
    const targetRoomId =
      (typeof roomId === 'string' && rooms.has(roomId) && roomId) ||
      findRoomIdBySocketId(socket.id);
    if (!targetRoomId) return;

    const roomData = rooms.get(targetRoomId);
    const peerIds = Array.isArray(roomData?.peerIds) ? roomData.peerIds : [];
    peerIds
      .filter((peerSocketId) => peerSocketId !== socket.id)
      .forEach((peerSocketId) => {
        io.to(peerSocketId).emit('peer-ended');
      });
    endCall(targetRoomId);
  });

  socket.on('disconnect', () => {
    unregisterUserSocket(socket.userId, socket.id);
    engagedSockets.delete(socket.id);
    removeSocketFromQueue(socket.id);
    rooms.forEach((r, roomId) => {
      const peerIds = r.peerIds || r;
      if (Array.isArray(peerIds) && peerIds.includes(socket.id)) {
        socket.to(roomId).emit('peer-disconnected');
        peerIds.forEach((id) => engagedSockets.delete(id));
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
