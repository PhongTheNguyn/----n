const { prisma } = require('../config/db');

const FREE_CALL_SECONDS_PER_DAY = 10 * 60;
const CALL_BILLING_BLOCK_SECONDS = 10 * 60;
const COINS_PER_CALL_BLOCK = 1;
const COIN_VND_VALUE = 10000;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getFilterCoinCost(filters = {}) {
  let cost = 0;
  if (filters.gender && filters.gender !== 'all') cost += 1;
  if (filters.country && filters.country !== 'all') cost += 1;
  return cost;
}

async function getOrCreateDailyUsage(tx, userId, usageDate) {
  return tx.user_daily_usage.upsert({
    where: {
      user_id_usage_date: {
        user_id: userId,
        usage_date: usageDate
      }
    },
    create: {
      user_id: userId,
      usage_date: usageDate,
      free_seconds_used: 0,
      paid_seconds_used: 0
    },
    update: {}
  });
}

async function getBillingSummary(userId, tx = prisma) {
  const usageDate = startOfDay();
  const [user, usage] = await Promise.all([
    tx.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true }
    }),
    tx.user_daily_usage.findUnique({
      where: {
        user_id_usage_date: {
          user_id: userId,
          usage_date: usageDate
        }
      }
    })
  ]);

  const freeUsed = usage?.free_seconds_used || 0;
  const freeRemaining = Math.max(0, FREE_CALL_SECONDS_PER_DAY - freeUsed);

  return {
    coinBalance: user?.coinBalance || 0,
    coinVndValue: COIN_VND_VALUE,
    freeCallSecondsPerDay: FREE_CALL_SECONDS_PER_DAY,
    freeCallSecondsUsedToday: freeUsed,
    freeCallSecondsRemainingToday: freeRemaining,
    paidCallSecondsToday: usage?.paid_seconds_used || 0,
    callBillingBlockSeconds: CALL_BILLING_BLOCK_SECONDS,
    coinsPerCallBlock: COINS_PER_CALL_BLOCK
  };
}

async function addCoinsToUser(userId, coinAmount, reason = 'manual_topup', metadata = {}) {
  const amount = Math.max(0, Math.floor(coinAmount || 0));
  if (amount <= 0) {
    throw new Error('INVALID_COIN_AMOUNT');
  }

  return prisma.$transaction(async (trx) => {
    const updated = await trx.user.update({
      where: { id: userId },
      data: { coinBalance: { increment: amount } },
      select: { coinBalance: true }
    });

    await trx.coin_transactions.create({
      data: {
        user_id: userId,
        amount,
        type: 'Cộng',
        reason,
        metadata
      }
    });

    return {
      coinBalance: updated.coinBalance,
      addedCoins: amount
    };
  });
}

async function getCoinTransactions(userId, limit = 20) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  return prisma.coin_transactions.findMany({
    where: { user_id: userId },
    orderBy: { created_at: 'desc' },
    take: safeLimit
  });
}

async function chargeFilterCoins(userId, filters) {
  const filterCost = getFilterCoinCost(filters);
  if (filterCost <= 0) return { chargedCoins: 0, filterCost: 0 };

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, coinBalance: true }
    });
    if (!user) throw new Error('USER_NOT_FOUND');
    if (user.coinBalance < filterCost) {
      const err = new Error('INSUFFICIENT_COINS');
      err.code = 'INSUFFICIENT_COINS';
      throw err;
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { coinBalance: { decrement: filterCost } },
      select: { coinBalance: true }
    });

    await tx.coin_transactions.create({
      data: {
        user_id: userId,
        amount: -filterCost,
        type: 'trừ',
        reason: 'Charge for gender/country filters',
        metadata: {
          gender: filters?.gender || 'all',
          country: filters?.country || 'all'
        }
      }
    });

    return { chargedCoins: filterCost, filterCost, coinBalance: updated.coinBalance };
  });
}

async function chargeCallDuration(userId, durationSeconds, metadata = {}) {
  const safeDuration = Math.max(0, Math.floor(durationSeconds || 0));
  if (safeDuration <= 0) return { chargedCoins: 0, chargedSeconds: 0 };

  const usageDate = startOfDay();

  return prisma.$transaction(async (tx) => {
    const [user, usage] = await Promise.all([
      tx.user.findUnique({
        where: { id: userId },
        select: { id: true, coinBalance: true }
      }),
      getOrCreateDailyUsage(tx, userId, usageDate)
    ]);

    if (!user) throw new Error('USER_NOT_FOUND');

    const freeRemaining = Math.max(0, FREE_CALL_SECONDS_PER_DAY - usage.free_seconds_used);
    const freeConsumed = Math.min(freeRemaining, safeDuration);
    const billableSeconds = Math.max(0, safeDuration - freeConsumed);
    const requestedCoins = Math.ceil(billableSeconds / CALL_BILLING_BLOCK_SECONDS) * COINS_PER_CALL_BLOCK;
    const chargedCoins = Math.min(user.coinBalance, requestedCoins);
    const chargedSeconds = chargedCoins * CALL_BILLING_BLOCK_SECONDS;

    await tx.user_daily_usage.update({
      where: {
        user_id_usage_date: {
          user_id: userId,
          usage_date: usageDate
        }
      },
      data: {
        free_seconds_used: { increment: freeConsumed },
        paid_seconds_used: { increment: Math.min(billableSeconds, chargedSeconds) }
      }
    });

    let coinBalance = user.coinBalance;
    if (chargedCoins > 0) {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { coinBalance: { decrement: chargedCoins } },
        select: { coinBalance: true }
      });
      coinBalance = updated.coinBalance;

      await tx.coin_transactions.create({
        data: {
          user_id: userId,
          amount: -chargedCoins,
          type: 'call_charge',
          reason: `Call charge (${safeDuration}s)`,
          metadata: {
            ...metadata,
            durationSeconds: safeDuration,
            freeConsumedSeconds: freeConsumed,
            billableSeconds,
            billedByBlockSeconds: CALL_BILLING_BLOCK_SECONDS,
            requestedCoins,
            chargedCoins
          }
        }
      });
    }

    return {
      chargedCoins,
      requestedCoins,
      freeConsumedSeconds: freeConsumed,
      billableSeconds,
      durationSeconds: safeDuration,
      coinBalance
    };
  });
}

module.exports = {
  FREE_CALL_SECONDS_PER_DAY,
  CALL_BILLING_BLOCK_SECONDS,
  COINS_PER_CALL_BLOCK,
  COIN_VND_VALUE,
  getFilterCoinCost,
  getBillingSummary,
  addCoinsToUser,
  getCoinTransactions,
  chargeFilterCoins,
  chargeCallDuration
};
