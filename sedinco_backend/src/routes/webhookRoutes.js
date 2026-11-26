const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Zalo Mini App Open API Webhook endpoint (GET kiểm tra kết nối, POST nhận sự kiện kèm X-ZEvent-Signature)
router.get('/zalo', (req, res, next) => webhookController.pingZaloWebhook(req, res, next));
router.post('/zalo', (req, res, next) => webhookController.receiveZaloWebhook(req, res, next));

module.exports = router;
