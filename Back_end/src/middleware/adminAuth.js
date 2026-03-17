const { prisma } = require('../config/db');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function adminMiddleware(req, res, next) {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'Người dùng không tồn tại' });
    }

    const isAdmin =
      user.role === 'admin' || ADMIN_EMAILS.includes((user.email || '').toLowerCase());

    if (!isAdmin) {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }

    next();
  } catch (err) {
    console.error('adminMiddleware error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = { adminMiddleware };
