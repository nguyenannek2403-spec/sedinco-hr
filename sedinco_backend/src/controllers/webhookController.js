const zaloWebhookService = require('../services/zaloWebhookService');

class WebhookController {
    async pingZaloWebhook(req, res) {
        return res.status(200).json({
            success: true,
            status: 'ready',
            endpoint: '/api/webhooks/zalo'
        });
    }

    async receiveZaloWebhook(req, res) {
        const headerSig = req.headers['x-zevent-signature'] || req.headers['X-ZEvent-Signature'];
        const verification = zaloWebhookService.verifyIncomingRequest(req.body, headerSig);

        if (!verification.ok) {
            res.locals.rejection_code = verification.code;
            return res.status(verification.statusCode).json({
                success: false,
                code: verification.code,
                message: verification.message
            });
        }

        const eventPayload = req.body;
        const ip_address = req.ip || req.socket?.remoteAddress || '';

        if (process.env.NODE_ENV === 'test') {
            const outcome = await zaloWebhookService.processZaloWebhookEvent(eventPayload, { ip_address });
            return res.status(200).json({
                success: true,
                message: 'ok',
                data: outcome
            });
        }

        // Tuân thủ SLA <= 2 giây của Zalo Webhook: xác nhận 200 OK ngay và xử lý DB nền an toàn
        setImmediate(() => {
            zaloWebhookService
                .processZaloWebhookEvent(eventPayload, { ip_address })
                .catch((err) => {
                    console.error('[ZaloWebhook] Lỗi xử lý sự kiện nền:', err?.message || err);
                });
        });

        return res.status(200).json({
            success: true,
            message: 'ok'
        });
    }
}

module.exports = new WebhookController();
