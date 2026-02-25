const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createReport } = require('../controllers/reportController');

const router = express.Router();
router.use(authMiddleware);

router.post('/', createReport);

module.exports = router;
