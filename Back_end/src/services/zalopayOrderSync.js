const { addCoinsToUser } = require('./billingService');

const ZALOPAY_REDIRECT_URL = process.env.ZALOPAY_REDIRECT_URL || 'http://localhost:4200/home';

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

module.exports = {
  resolveEmbedRedirectUrl,
  applyZaloPayQueryToRecord
};
