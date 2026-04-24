const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  getPricingConfig,
  createZaloPayPayment,
  zaloPayCallback,
  getMyZaloPayPaymentStatus,
  queryZaloPayOrder
} = require('../controllers/paymentController');

const router = express.Router();

router.post('/zalopay/callback', zaloPayCallback);

router.use(authMiddleware);
router.get('/pricing', getPricingConfig);
router.post('/zalopay/create', createZaloPayPayment);
router.get('/zalopay/:orderId', getMyZaloPayPaymentStatus);
router.post('/zalopay/:orderId/query', queryZaloPayOrder);

module.exports = router;
