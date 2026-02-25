const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { blockUser, unblockUser, getBlockedList } = require('../controllers/blockController');

const router = express.Router();
router.use(authMiddleware);

router.post('/', blockUser);
router.delete('/:blockedId', unblockUser);
router.get('/', getBlockedList);

module.exports = router;
