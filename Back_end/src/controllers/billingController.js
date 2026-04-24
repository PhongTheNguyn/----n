const {
  getBillingSummary,
  getCoinTransactions
} = require('../services/billingService');

async function getMyBillingSummary(req, res) {
  try {
    const summary = await getBillingSummary(req.userId);
    return res.json(summary);
  } catch (err) {
    console.error('getMyBillingSummary error:', err);
    return res.status(500).json({ error: 'Lỗi server' });
  }
}

module.exports = {
  getMyBillingSummary,
  async getMyCoinTransactions(req, res) {
    try {
      const { limit = 20 } = req.query;
      const items = await getCoinTransactions(req.userId, limit);
      return res.json({ transactions: items });
    } catch (err) {
      console.error('getMyCoinTransactions error:', err);
      return res.status(500).json({ error: 'Lỗi server' });
    }
  }
};
