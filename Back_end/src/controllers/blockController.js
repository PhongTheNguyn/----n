const { prisma } = require('../config/db');
const { randomUUID } = require('crypto');

async function blockUser(req, res) {
  try {
    const { blockedId } = req.body;
    const blockerId = req.userId;

    if (!blockedId) {
      return res.status(400).json({ error: 'Thiếu blockedId' });
    }

    if (blockerId === blockedId) {
      return res.status(400).json({ error: 'Không thể chặn chính mình' });
    }

    const blockedUser = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!blockedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    const existing = await prisma.blocked_users.findFirst({
      where: { blocker_id: blockerId, blocked_id: blockedId }
    });
    if (existing) {
      return res.status(200).json({ message: 'Đã chặn trước đó' });
    }

    const id = `cl${randomUUID().replace(/-/g, '').slice(0, 22)}`;
    await prisma.blocked_users.create({
      data: {
        id,
        blocker_id: blockerId,
        blocked_id: blockedId
      }
    });

    res.status(201).json({ message: 'Đã chặn người dùng' });
  } catch (err) {
    console.error('Block user error:', err);
    if (err.code === 'P2002') {
      return res.status(200).json({ message: 'Đã chặn trước đó' });
    }
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function unblockUser(req, res) {
  try {
    const { blockedId } = req.params;
    const blockerId = req.userId;

    await prisma.blocked_users.deleteMany({
      where: { blocker_id: blockerId, blocked_id: blockedId }
    });

    res.json({ message: 'Đã bỏ chặn' });
  } catch (err) {
    console.error('Unblock user error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getBlockedList(req, res) {
  try {
    const blockerId = req.userId;

    const blocked = await prisma.blocked_users.findMany({
      where: { blocker_id: blockerId },
      include: {
        users_blocked_users_blocked_idTousers: {
          select: { id: true, displayName: true, avatarUrl: true }
        }
      }
    });

    res.json(
      blocked.map((b) => ({
        id: b.id,
        blockedId: b.blocked_id,
        displayName: b.users_blocked_users_blocked_idTousers?.displayName,
        avatarUrl: b.users_blocked_users_blocked_idTousers?.avatarUrl
      }))
    );
  } catch (err) {
    console.error('Get blocked list error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = { blockUser, unblockUser, getBlockedList };
