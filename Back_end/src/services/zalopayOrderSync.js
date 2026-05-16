const crypto = require('crypto');
const { addCoinsToUser } = require('./billingService');

const ZALOPAY_QUERY_ENDPOINT =
  process.env.ZALOPAY_QUERY_ENDPOINT || 'https://sb-openapi.zalopay.vn/v2/query';
const ZALOPAY_APP_ID = Number(process.env.ZALOPAY_APP_ID || 0);
const ZALOPAY_KEY1 = process.env.ZALOPAY_KEY1 || '';
const ZALOPAY_REDIRECT_URL = process.env.ZALOPAY_REDIRECT_URL || 'http://localhost:4200/home';
const ZALOPAY_ORDER_EXPIRE_MINUTES = Number(process.env.ZALOPAY_ORDER_EXPIRE_MINUTES || 15);
const ZALOPAY_RECONCILE_MIN_AGE_MINUTES = Number(process.env.ZALOPAY_RECONCILE_MIN_AGE_MINUTES || 2);
const ZALOPAY_RECONCILE_BATCH_SIZE = Number(process.env.ZALOPAY_RECONCILE_BATCH_SIZE || 40);

function isZaloPayConfigured() {
  return !!(ZALOPAY_APP_ID && ZALOPAY_KEY1);
}

function signQueryMac(appTransId) {
  const data = `${ZALOPAY_APP_ID}|${appTransId}|${ZALOPAY_KEY1}`;
  return crypto.createHmac('sha256', ZALOPAY_KEY1).update(data).digest('hex');
}

async function fetchZaloPayQuery(appTransId) {
  const mac = signQueryMac(appTransId);
  const response = await fetch(ZALOPAY_QUERY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      app_id: String(ZALOPAY_APP_ID),
      app_trans_id: appTransId,
      mac
    })
  });
  return response.json();
}
function normalizeToHomeUrl(urlString) {
  try {
    const u = new URL(urlString);
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    const p = path === '/' ? '/home' : path;
    return `${u.origin}${p}`;
  } catch {
    return 'http://localhost:4200/home';
  }
}

function addAllowedOrigin(set, urlString) {
  try {
    const u = new URL(urlString);
    set.add(u.origin);
    if (u.hostname === 'localhost') {
      set.add(`${u.protocol}//127.0.0.1${u.port ? `:${u.port}` : ''}`);
    } else if (u.hostname === '127.0.0.1') {
      set.add(`${u.protocol}//localhost${u.port ? `:${u.port}` : ''}`);
    }
  } catch {
    /* ignore */
  }
}

function getAllowedRedirectOrigins() {
  const origins = new Set();
  addAllowedOrigin(origins, ZALOPAY_REDIRECT_URL);
  for (const raw of String(process.env.FRONTEND_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (raw.startsWith('http')) addAllowedOrigin(origins, raw);
  }
  return origins;
}

/**
 * Cho phép client gửi returnUrl trùng origin với ZALOPAY_REDIRECT_URL / FRONTEND_ORIGINS
 * (ví dụ localhost vs 127.0.0.1) để sau khi thanh toán ZaloPay redirect đúng tab đang đăng nhập.
 */
function resolveEmbedRedirectUrl(requestedReturnUrl) {
  const fallback = normalizeToHomeUrl(ZALOPAY_REDIRECT_URL);
  const allowed = getAllowedRedirectOrigins();

  if (typeof requestedReturnUrl !== 'string' || !requestedReturnUrl.trim()) {
    return fallback;
  }
  try {
    const u = new URL(requestedReturnUrl.trim());
    if (!allowed.has(u.origin)) {
      return fallback;
    }
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/';
    if (path !== '/home' && path !== '/') {
      return fallback;
    }
    return `${u.origin}${path === '/' ? '/home' : path}`;
  } catch {
    return fallback;
  }
}

/**
 * Áp kết quả API Query ZaloPay lên bản ghi zalopay_payments (paid / canceled).
 * Không đổi trạng thái khi return_code = 3 (chưa thanh toán / đang xử lý) hoặc lỗi tham số query.
 */
async function applyZaloPayQueryToRecord(prisma, payment, data) {
  const orderId = payment.app_trans_id;
  const rc = Number(data.return_code);
  const sub = Number(data.sub_return_code);

  if (payment.status === 'paid') {
    return { payment, changed: false };
  }

  if (rc === 1) {
    await prisma.zalopay_payments.update({
      where: { app_trans_id: orderId },
      data: {
        status: 'paid',
        zlp_return_code: 1,
        zp_trans_id: data.zp_trans_id != null ? String(data.zp_trans_id) : payment.zp_trans_id,
        paid_at: payment.paid_at || new Date(),
        raw_response: data
      }
    });
    await addCoinsToUser(payment.user_id, payment.coin_amount, 'zalopay_topup', {
      appTransId: orderId,
      zpTransId: data.zp_trans_id != null ? String(data.zp_trans_id) : null,
      amountVnd: payment.amount_vnd
    });
    const updated = await prisma.zalopay_payments.findUnique({ where: { app_trans_id: orderId } });
    return { payment: updated, changed: true, status: 'paid' };
  }

  if (rc === 2) {
    const queryRequestErrors = new Set([-401, -402, -429, -500, -999, -92]);
    if (queryRequestErrors.has(sub)) {
      return { payment, changed: false, queryError: true };
    }
    const terminalFail = new Set([-54, -101, -332, -333, -217]);
    if (terminalFail.has(sub)) {
      await prisma.zalopay_payments.update({
        where: { app_trans_id: orderId },
        data: {
          status: 'canceled',
          zlp_return_code: Number.isFinite(sub) ? sub : null,
          raw_response: data
        }
      });
      const updated = await prisma.zalopay_payments.findUnique({ where: { app_trans_id: orderId } });
      return { payment: updated, changed: true, status: 'canceled' };
    }
  }

  return { payment, changed: false };
}

async function markPaymentAsCanceled(prisma, payment, extra = {}) {
  if (!payment || payment.status === 'paid' || payment.status === 'canceled') {
    return payment;
  }
  const prev = payment.raw_response;
  const base = prev && typeof prev === 'object' && !Array.isArray(prev) ? { ...prev } : {};
  await prisma.zalopay_payments.update({
    where: { app_trans_id: payment.app_trans_id },
    data: {
      status: 'canceled',
      raw_response: {
        ...base,
        ...extra,
        canceledAt: new Date().toISOString()
      }
    }
  });
  return prisma.zalopay_payments.findUnique({ where: { app_trans_id: payment.app_trans_id } });
}

/**
 * Quét đơn created/pending: query ZaloPay; đơn quá hạn (~15 phút) mà vẫn chưa paid → canceled.
 * Xử lý trường hợp user đóng tab / không quay lại app sau khi mở cổng ZaloPay.
 */
async function reconcileStaleZaloPayPayments(prisma) {
  if (!isZaloPayConfigured()) {
    return { scanned: 0, updated: 0, skipped: true };
  }

  const expireMs = Math.max(1, ZALOPAY_ORDER_EXPIRE_MINUTES) * 60 * 1000;
  const minAgeMs = Math.max(0, ZALOPAY_RECONCILE_MIN_AGE_MINUTES) * 60 * 1000;
  const expireBefore = new Date(Date.now() - expireMs);
  const minCreatedBefore = new Date(Date.now() - minAgeMs);

  const candidates = await prisma.zalopay_payments.findMany({
    where: {
      status: { in: ['created', 'pending'] },
      created_at: { lte: minCreatedBefore }
    },
    orderBy: { created_at: 'asc' },
    take: Math.max(1, ZALOPAY_RECONCILE_BATCH_SIZE)
  });

  let updated = 0;
  for (const payment of candidates) {
    try {
      const data = await fetchZaloPayQuery(payment.app_trans_id);
      const result = await applyZaloPayQueryToRecord(prisma, payment, data);
      if (result.changed) {
        updated += 1;
        continue;
      }

      const isExpired = payment.created_at <= expireBefore;
      const stillOpen =
        result.payment?.status === 'created' || result.payment?.status === 'pending';
      const zaloStillUnpaid = Number(data.return_code) === 3;

      if (isExpired && stillOpen && (zaloStillUnpaid || Number(data.return_code) === 2)) {
        await markPaymentAsCanceled(prisma, result.payment, {
          autoExpired: true,
          reason: 'order_expired_or_abandoned',
          zaloPayReturnCode: data.return_code,
          zaloPaySubReturnCode: data.sub_return_code,
          zaloPayQuery: data
        });
        updated += 1;
      }
    } catch (err) {
      console.error('reconcileStaleZaloPayPayments:', payment.app_trans_id, err);
    }
  }

  return { scanned: candidates.length, updated, skipped: false };
}

async function queryAndSyncPayment(prisma, appTransId) {
  const payment = await prisma.zalopay_payments.findUnique({ where: { app_trans_id: appTransId } });
  if (!payment) return null;
  const data = await fetchZaloPayQuery(appTransId);
  const result = await applyZaloPayQueryToRecord(prisma, payment, data);
  return { payment: result.payment, data, changed: result.changed, status: result.status };
}

module.exports = {
  isZaloPayConfigured,
  resolveEmbedRedirectUrl,
  applyZaloPayQueryToRecord,
  markPaymentAsCanceled,
  fetchZaloPayQuery,
  reconcileStaleZaloPayPayments,
  queryAndSyncPayment
};
