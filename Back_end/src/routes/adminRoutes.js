const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/adminAuth');
const {
  getDashboardStats,
  getUsers,
  updateUser,
  getReports,
  getReportDetail,
  updateReport,
  getAdminConfig,
  updateAdminConfig,
  getSessions,
  getLogs,
  topupUserCoins,
  getPayments,
  syncPayment,
  reconcileStalePayments
} = require('../controllers/adminController');

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/dashboard', getDashboardStats);
router.get('/users', getUsers);
router.patch('/users/:id', updateUser);
router.get('/reports', getReports);
router.get('/reports/:id', getReportDetail);
router.patch('/reports/:id', updateReport);
router.get('/config', getAdminConfig);
router.put('/config', updateAdminConfig);
router.get('/sessions', getSessions);
router.get('/logs', getLogs);
router.post('/topup-coins', topupUserCoins);
router.get('/payments', getPayments);
router.post('/payments/:orderId/sync', syncPayment);
router.post('/payments/reconcile-stale', reconcileStalePayments);

module.exports = router;
