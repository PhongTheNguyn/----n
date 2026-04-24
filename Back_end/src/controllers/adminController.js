const { prisma } = require('../config/db');
const { randomUUID } = require('crypto');
const { addCoinsToUser } = require('../services/billingService');
const crypto = require('crypto');

const ZALOPAY_QUERY_ENDPOINT =
  process.env.ZALOPAY_QUERY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/query';
const ZALOPAY_APP_ID = Number(process.env.ZALOPAY_APP_ID || 0);
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1 || '';

const DEFAULT_CONFIG = {
  warnThreshold: 3,
  tempBanThreshold: 5,
  permanentBanThreshold: 7,
  tempBanDays: 7
};

async function getDashboardStats(req, res) {
  try {
    const [totalUsers, reportsToday, totalReports, totalSessions, pendingReports] = await Promise.all([
      prisma.user.count(),
      prisma.user_reports.count({
        where: {
          created_at: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      }),
      prisma.user_reports.count(),
      prisma.call_sessions.count(),
      prisma.user_reports.count({ where: { status: 'pending' } })
    ]);

    res.json({
      totalUsers,
      reportsToday,
      totalReports,
      totalSessions,
      pendingReports,
      onlineCount: 0
    });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getReports(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = status ? { status } : {};
    const [items, total] = await Promise.all([
      prisma.user_reports.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: { created_at: 'desc' },
        include: {
          users_user_reports_reporter_idTousers: {
            select: { id: true, displayName: true, email: true, avatarUrl: true }
          },
          users_user_reports_reported_idTousers: {
            select: { id: true, displayName: true, email: true, avatarUrl: true }
          }
        }
      }),
      prisma.user_reports.count({ where })
    ]);

    const reports = items.map((r) => ({
      id: r.id,
      reporterId: r.reporter_id,
      reporter: r.users_user_reports_reporter_idTousers,
      reportedId: r.reported_id,
      reported: r.users_user_reports_reported_idTousers,
      reason: r.reason,
      description: r.description,
      status: r.status,
      actionBy: r.action_by,
      actionAt: r.action_at,
      createdAt: r.created_at
    }));

    res.json({ reports, total });
  } catch (err) {
    console.error('getReports error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getReportDetail(req, res) {
  try {
    const { id } = req.params;
    const report = await prisma.user_reports.findUnique({
      where: { id },
      include: {
        users_user_reports_reporter_idTousers: {
          select: { id: true, displayName: true, email: true, avatarUrl: true, createdAt: true }
        },
        users_user_reports_reported_idTousers: {
          select: { id: true, displayName: true, email: true, avatarUrl: true, createdAt: true }
        }
      }
    });

    if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    res.json({
      id: report.id,
      reporter: report.users_user_reports_reporter_idTousers,
      reported: report.users_user_reports_reported_idTousers,
      reason: report.reason,
      description: report.description,
      status: report.status,
      actionBy: report.action_by,
      actionAt: report.action_at,
      createdAt: report.created_at
    });
  } catch (err) {
    console.error('getReportDetail error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function updateReport(req, res) {
  try {
    const { id } = req.params;
    const { action } = req.body;
    const adminId = req.userId;

    const validActions = ['dismiss', 'warn', 'ban_temp', 'ban_permanent', 'processed'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ error: 'Hành động không hợp lệ' });
    }

    const report = await prisma.user_reports.findUnique({ where: { id } });
    if (!report) return res.status(404).json({ error: 'Không tìm thấy báo cáo' });

    const now = new Date();
    let banUntil = null;
    let isBanned = false;

    if (action === 'ban_temp') {
      const config = await loadAdminConfig();
      const days = config.tempBanDays || 7;
      banUntil = new Date();
      banUntil.setDate(banUntil.getDate() + days);
      isBanned = true;
    } else if (action === 'ban_permanent') {
      isBanned = true;
      banUntil = null;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user_reports.update({
        where: { id },
        data: {
          status: action === 'dismiss' ? 'dismissed' : action === 'processed' ? 'processed' : action === 'warn' ? 'warned' : 'banned',
          action_by: adminId,
          action_at: now
        }
      });

      if (action === 'ban_temp' || action === 'ban_permanent') {
        await tx.user.update({
          where: { id: report.reported_id },
          data: { isBanned: true, bannedUntil: banUntil }
        });
      }
    });

    await createSystemLog({
      action: 'report_action',
      user_id: adminId,
      target_id: report.reported_id,
      details: JSON.stringify({ reportId: id, action })
    });

    res.json({ message: 'Đã xử lý báo cáo' });
  } catch (err) {
    console.error('updateReport error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getAdminConfigHandler(req, res) {
  try {
    const config = await loadAdminConfig();
    res.json(config);
  } catch (err) {
    console.error('getAdminConfig error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function loadAdminConfig() {
  const rows = await prisma.admin_config.findMany();
  const obj = { ...DEFAULT_CONFIG };
  for (const row of rows) {
    try {
      obj[row.key] = JSON.parse(row.value);
    } catch {
      obj[row.key] = row.value;
    }
  }
  return obj;
}

async function updateAdminConfig(req, res) {
  try {
    const { warnThreshold, tempBanThreshold, permanentBanThreshold, tempBanDays } = req.body;

    const updates = [];
    if (warnThreshold != null) updates.push({ key: 'warnThreshold', value: JSON.stringify(warnThreshold) });
    if (tempBanThreshold != null) updates.push({ key: 'tempBanThreshold', value: JSON.stringify(tempBanThreshold) });
    if (permanentBanThreshold != null) updates.push({ key: 'permanentBanThreshold', value: JSON.stringify(permanentBanThreshold) });
    if (tempBanDays != null) updates.push({ key: 'tempBanDays', value: JSON.stringify(tempBanDays) });

    for (const u of updates) {
      await prisma.admin_config.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value }
      });
    }

    res.json({ message: 'Đã cập nhật cấu hình' });
  } catch (err) {
    console.error('updateAdminConfig error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getSessions(req, res) {
  try {
    const { page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [items, total] = await Promise.all([
      prisma.call_sessions.findMany({
        skip,
        take: parseInt(limit, 10),
        orderBy: { started_at: 'desc' }
      }),
      prisma.call_sessions.count()
    ]);

    res.json({ sessions: items, total });
  } catch (err) {
    console.error('getSessions error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getLogs(req, res) {
  try {
    const { action, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const where = action ? { action } : {};
    const [items, total] = await Promise.all([
      prisma.system_logs.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: { created_at: 'desc' }
      }),
      prisma.system_logs.count({ where })
    ]);

    res.json({ logs: items, total });
  } catch (err) {
    console.error('getLogs error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
}

async function topupUserCoins(req, res) {
  try {
    const { userId, coins } = req.body;
    const coinAmount = Number(coins);
    if (!userId || !Number.isFinite(coinAmount) || coinAmount <= 0) {
      return res.status(400).json({ error: 'userId và coins hợp lệ là bắt buộc' });
    }

    const result = await addCoinsToUser(
      userId,
      coinAmount,
      'admin_topup',
      { adminId: req.userId }
    );

    await createSystemLog({
      action: 'admin_topup',
      user_id: req.userId,
      target_id: userId,
      details: JSON.stringify({ coins: coinAmount })
    });

    return res.json({
      message: 'Nạp coin thành công',
      ...result
    });
  } catch (err) {
    console.error('topupUserCoins error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}

async function getPayments(req, res) {
  try {
    const { page = 1, limit = 20, status, userId, orderId } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const where = {};
    if (status) where.status = status;
    if (userId) where.user_id = String(userId);
    if (orderId) where.app_trans_id = { contains: String(orderId) };

    const [items, total] = await Promise.all([
      prisma.zalopay_payments.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: { created_at: 'desc' }
      }),
      prisma.zalopay_payments.count({ where })
    ]);

    const userIds = [...new Set(items.map((x) => x.user_id).filter(Boolean))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, displayName: true, email: true }
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const payments = items.map((p) => ({
      id: p.id,
      userId: p.user_id,
      user: userMap.get(p.user_id) || null,
      appTransId: p.app_trans_id,
      zpTransId: p.zp_trans_id,
      amountVnd: p.amount_vnd,
      coinAmount: p.coin_amount,
      status: p.status,
      returnCode: p.zlp_return_code,
      createdAt: p.created_at,
      paidAt: p.paid_at
    }));

    return res.json({ payments, total });
  } catch (err) {
    console.error('getPayments error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}

function signZaloPay(data) {
  return crypto.createHmac('sha256', ZALOPAY_KEY1).update(data).digest('hex');
}

async function syncPayment(req, res) {
  try {
    if (!ZALOPAY_APP_ID || !ZALOPAY_KEY1) {
      return res.status(400).json({ error: 'ZaloPay chưa được cấu hình đầy đủ trên server.' });
    }

    const { orderId } = req.params;
    const payment = await prisma.zalopay_payments.findUnique({ where: { app_trans_id: orderId } });
    if (!payment) {
      return res.status(404).json({ error: 'Không tìm thấy đơn thanh toán' });
    }

    const mac = signZaloPay(`${ZALOPAY_APP_ID}|${orderId}|${ZALOPAY_KEY1}`);
    const response = await fetch(ZALOPAY_QUERY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        app_id: String(ZALOPAY_APP_ID),
        app_trans_id: orderId,
        mac
      })
    });
    const data = await response.json();

    if (data.return_code === 1 && payment.status !== 'paid') {
      await prisma.zalopay_payments.update({
        where: { app_trans_id: orderId },
        data: {
          status: 'paid',
          zlp_return_code: 1,
          zp_trans_id: data.zp_trans_id ? String(data.zp_trans_id) : payment.zp_trans_id,
          paid_at: payment.paid_at || new Date(),
          raw_response: data
        }
      });

      await addCoinsToUser(
        payment.user_id,
        payment.coin_amount,
        'zalopay_topup',
        { appTransId: orderId, zpTransId: data.zp_trans_id || null, amountVnd: payment.amount_vnd }
      );
    }

    await createSystemLog({
      action: 'payment_sync',
      user_id: req.userId,
      target_id: payment.user_id,
      details: JSON.stringify({ orderId, returnCode: data.return_code })
    });

    return res.json({ message: 'Đã đồng bộ đơn', data });
  } catch (err) {
    console.error('syncPayment error:', err);
    return res.status(500).json({ error: 'Lỗi đồng bộ đơn' });
  }
}

async function createSystemLog(data) {
  try {
    const id = `cl${randomUUID().replace(/-/g, '').slice(0, 22)}`;
    await prisma.system_logs.create({
      data: {
        id,
        action: data.action,
        user_id: data.user_id || null,
        target_id: data.target_id || null,
        details: data.details || null
      }
    });
  } catch (e) {
    console.error('createSystemLog error:', e);
  }
}

module.exports = {
  getDashboardStats,
  getReports,
  getReportDetail,
  updateReport,
  getAdminConfig: getAdminConfigHandler,
  updateAdminConfig,
  getSessions,
  getLogs,
  topupUserCoins,
  getPayments,
  syncPayment,
  createSystemLog,
  loadAdminConfig
};
