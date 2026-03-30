const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { getTurnCredentials } = require('../controllers/webrtcController');

const router = express.Router();

router.use(authMiddleware);
router.get('/turn-credentials', getTurnCredentials);

module.exports = router;