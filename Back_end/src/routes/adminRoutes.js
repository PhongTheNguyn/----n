const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { adminMiddleware } = require('../middleware/adminAuth');
const {
  getDashboardStats,
  getReports,
  getReportDetail,
  updateReport,
  getAdminConfig,
  updateAdminConfig,
  getSessions,
  getLogs
} = require('../controllers/adminController');

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/dashboard', getDashboardStats);
router.get('/reports', getReports);
router.get('/reports/:id', getReportDetail);
router.patch('/reports/:id', updateReport);
router.get('/config', getAdminConfig);
router.put('/config', updateAdminConfig);
router.get('/sessions', getSessions);
router.get('/logs', getLogs);

module.exports = router;
