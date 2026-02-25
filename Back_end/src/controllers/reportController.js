const { prisma } = require('../config/db');
const { randomUUID } = require('crypto');

const VALID_REASONS = ['inappropriate', 'harassment', 'spam', 'other'];

async function createReport(req, res) {
  try {
    const { reportedId, reason, description } = req.body;
    const reporterId = req.userId;

    if (!reportedId || !reason) {
      return res.status(400).json({ error: 'Thiếu reportedId hoặc reason' });
    }

    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: 'Lý do báo cáo không hợp lệ' });
    }

    if (reporterId === reportedId) {
      return res.status(400).json({ error: 'Không thể tự báo cáo chính mình' });
    }

    const reportedUser = await prisma.user.findUnique({ where: { id: reportedId } });
    if (!reportedUser) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    const id = `cl${randomUUID().replace(/-/g, '').slice(0, 22)}`;
    await prisma.user_reports.create({
      data: {
        id,
        reporter_id: reporterId,
        reported_id: reportedId,
        reason,
        description: description || null,
        status: 'pending'
      }
    });

    res.status(201).json({ message: 'Báo cáo đã được gửi' });
  } catch (err) {
    console.error('Create report error:', err);
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Bạn đã báo cáo người này rồi' });
    }
    res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = { createReport };
