const crypto = require('crypto');
const { prisma } = require('../config/db');
const { addCoinsToUser, COIN_VND_VALUE } = require('../services/billingService');

const ZALOPAY_CREATE_ENDPOINT =
  process.env.ZALOPAY_CREATE_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/create';
const ZALOPAY_QUERY_ENDPOINT =
  process.env.ZALOPAY_QUERY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/query';
const ZALOPAY_APP_ID = Number(process.env.ZALOPAY_APP_ID || 0);
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1 || '';
const ZALOPAY_KEY2 = process.env.ZALOPAY_KEY2 || '';
const ZALOPAY_CALLBACK_URL =
  process.env.ZALOPAY_CALLBACK_URL || 'http://localhost:3000/api/payment/zalopay/callback';
const ZALOPAY_REDIRECT_URL = process.env.ZALOPAY_REDIRECT_URL || 'http://localhost:4200/home';

function isZaloPayConfigured() {
  return !!(ZALOPAY_APP_ID && ZALOPAY_KEY1 && ZALOPAY_KEY2);
}

function signWithHmac(data, key) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

function generateAppTransId() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return `${yy}${mm}${dd}_${suffix}`;
}

function getPricingConfig(req, res) {
  return res.json({
    coinVndValue: COIN_VND_VALUE,
    zalopay: {
      enabled: isZaloPayConfigured(),
      appId: ZALOPAY_APP_ID,
      createEndpoint: ZALOPAY_CREATE_ENDPOINT
    }
  });
}

async function createZaloPayPayment(req, res) {
  try {
    if (!isZaloPayConfigured()) {
      return res.status(400).json({ error: 'ZaloPay chưa được cấu hình đầy đủ trên server.' });
    }

    const { coins } = req.body;
    const coinAmount = Math.max(1, Math.floor(Number(coins) || 0));
    const amount = coinAmount * COIN_VND_VALUE;
    const appTransId = generateAppTransId();
    const appTime = Date.now();
    const appUser = req.userId;
    const item = JSON.stringify([{ coinAmount, unitPrice: COIN_VND_VALUE }]);
    const embedData = JSON.stringify({
      userId: req.userId,
      coinAmount,
      redirectUrl: ZALOPAY_REDIRECT_URL
    });

    const order = {
      app_id: ZALOPAY_APP_ID,
      app_user: appUser,
      app_time: appTime,
      amount,
      app_trans_id: appTransId,
      item,
      embed_data: embedData,
      description: `Nap ${coinAmount} coin`
    };
    const dataToSign = [
      order.app_id,
      order.app_trans_id,
      order.app_user,
      order.amount,
      order.app_time,
      order.embed_data,
      order.item
    ].join('|');
    order.mac = signWithHmac(dataToSign, ZALOPAY_KEY1);
    order.callback_url = ZALOPAY_CALLBACK_URL;

    const response = await fetch(ZALOPAY_CREATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(
        Object.entries(order).reduce((acc, [key, value]) => {
          acc[key] = String(value);
          return acc;
        }, {})
      )
    });
    const data = await response.json();

    await prisma.zalopay_payments.create({
      data: {
        user_id: req.userId,
        app_trans_id: appTransId,
        app_id: ZALOPAY_APP_ID,
        amount_vnd: amount,
        coin_amount: coinAmount,
        status: data.return_code === 1 ? 'created' : 'failed',
        zlp_return_code: data.return_code ?? null,
        order_url: data.order_url || null,
        raw_response: data
      }
    });

    if (!response.ok || data.return_code !== 1) {
      return res.status(400).json({
        error: data.return_message || 'Tạo thanh toán ZaloPay thất bại',
        returnCode: data.return_code
      });
    }

    return res.json({
      orderId: appTransId,
      payUrl: data.order_url,
      zpTransToken: data.zp_trans_token || null
    });
  } catch (err) {
    console.error('createZaloPayPayment error:', err);
    return res.status(500).json({ error: 'Lỗi tạo thanh toán ZaloPay' });
  }
}

async function zaloPayCallback(req, res) {
  try {
    if (!isZaloPayConfigured()) {
      return res.status(400).json({ return_code: -1, return_message: 'ZaloPay not configured' });
    }

    const { data, mac } = req.body || {};
    if (!data || !mac) {
      return res.status(400).json({ return_code: -1, return_message: 'Missing callback payload' });
    }

    const expectedMac = signWithHmac(data, ZALOPAY_KEY2);
    if (expectedMac !== mac) {
      return res.status(400).json({ return_code: -1, return_message: 'Invalid MAC' });
    }

    const payload = JSON.parse(data);
    const appTransId = payload.app_trans_id;
    const zpTransId = payload.zp_trans_id ? String(payload.zp_trans_id) : null;
    if (!appTransId) {
      return res.status(400).json({ return_code: -1, return_message: 'Missing app_trans_id' });
    }

    const payment = await prisma.zalopay_payments.findUnique({ where: { app_trans_id: appTransId } });
    if (!payment) {
      return res.status(404).json({ return_code: -1, return_message: 'Order not found' });
    }
    if (payment.status === 'paid') {
      return res.json({ return_code: 1, return_message: 'success' });
    }

    const processed = await prisma.$transaction(async (tx) => {
      const latest = await tx.zalopay_payments.findUnique({ where: { app_trans_id: appTransId } });
      if (!latest || latest.status === 'paid') return false;

      await tx.zalopay_payments.update({
        where: { app_trans_id: appTransId },
        data: {
          status: 'paid',
          zlp_return_code: 1,
          zp_trans_id: zpTransId,
          paid_at: new Date(),
          raw_response: payload
        }
      });
      return true;
    });

    if (processed) {
      await addCoinsToUser(
        payment.user_id,
        payment.coin_amount,
        'zalopay_topup',
        { appTransId, zpTransId, amountVnd: payment.amount_vnd }
      );
    }

    return res.json({ return_code: 1, return_message: 'success' });
  } catch (err) {
    console.error('zaloPayCallback error:', err);
    return res.status(500).json({ return_code: 0, return_message: 'system error' });
  }
}

async function getMyZaloPayPaymentStatus(req, res) {
  try {
    const { orderId } = req.params;
    const payment = await prisma.zalopay_payments.findFirst({
      where: { app_trans_id: orderId, user_id: req.userId },
      select: {
        app_trans_id: true,
        amount_vnd: true,
        coin_amount: true,
        status: true,
        zlp_return_code: true,
        zp_trans_id: true,
        created_at: true,
        paid_at: true
      }
    });
    if (!payment) {
      return res.status(404).json({ error: 'Không tìm thấy đơn thanh toán' });
    }

    return res.json({
      orderId: payment.app_trans_id,
      amountVnd: payment.amount_vnd,
      coinAmount: payment.coin_amount,
      status: payment.status,
      returnCode: payment.zlp_return_code,
      zpTransId: payment.zp_trans_id,
      createdAt: payment.created_at,
      paidAt: payment.paid_at
    });
  } catch (err) {
    console.error('getMyZaloPayPaymentStatus error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}

async function queryZaloPayOrder(req, res) {
  try {
    if (!isZaloPayConfigured()) {
      return res.status(400).json({ error: 'ZaloPay chưa được cấu hình đầy đủ trên server.' });
    }

    const { orderId } = req.params;
    const payment = await prisma.zalopay_payments.findFirst({
      where: { app_trans_id: orderId, user_id: req.userId }
    });
    if (!payment) {
      return res.status(404).json({ error: 'Không tìm thấy đơn thanh toán' });
    }

    const mac = signWithHmac(`${ZALOPAY_APP_ID}|${orderId}|${ZALOPAY_KEY1}`, ZALOPAY_KEY1);
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

    return res.json(data);
  } catch (err) {
    console.error('queryZaloPayOrder error:', err);
    return res.status(500).json({ error: 'Lỗi kiểm tra đơn ZaloPay' });
  }
}

module.exports = {
  getPricingConfig,
  createZaloPayPayment,
  zaloPayCallback,
  getMyZaloPayPaymentStatus,
  queryZaloPayOrder
};
