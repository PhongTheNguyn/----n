const jwt = require('jsonwebtoken');
const { prisma } = require('../config/db');

function formatRemainingDuration(remainingMs) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  parts.push(`${seconds} giây`);
  return parts.join(' ');
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, isBanned: true, bannedUntil: true }
    });
    if (!user) {
      return res.status(401).json({ error: 'Người dùng không tồn tại' });
    }

    const now = new Date();
    if (user.isBanned) {
      if (user.bannedUntil == null) {
        return res.status(403).json({
          error: 'Bạn đã bị cấm khỏi nền tảng',
          banType: 'permanent'
        });
      }

      const bannedUntil = new Date(user.bannedUntil);
      if (bannedUntil > now) {
        const remainingMs = bannedUntil.getTime() - now.getTime();
        return res.status(403).json({
          error: `Tài khoản đang bị cảnh cáo. Thời gian còn lại: ${formatRemainingDuration(remainingMs)}`,
          banType: 'temporary',
          bannedUntil: bannedUntil.toISOString(),
          remainingMs
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: false, bannedUntil: null }
      });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token hết hạn hoặc không hợp lệ' });
  }
}

module.exports = { authMiddleware };
