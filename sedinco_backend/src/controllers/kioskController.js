/**
 * src/controllers/kioskController.js
 * 
 * HTTP Controller xử lý các request Kiosk
 */

const kioskService = require('../services/kioskService');

class KioskController {
    async register(req, res, next) {
        try {
            const { kiosk_name, branch_id } = req.body;
            const created_by = req.user ? (req.user.username || req.user.ma_nv) : 'admin';
            const data = await kioskService.registerKiosk({ kiosk_name, branch_id, created_by });
            return res.status(201).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async list(req, res, next) {
        try {
            const data = await kioskService.listKiosks();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async revoke(req, res, next) {
        try {
            const { id } = req.params;
            const actor_id = req.user ? (req.user.username || req.user.ma_nv) : 'admin';
            const result = await kioskService.revokeKiosk(id, actor_id);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getQr(req, res, next) {
        try {
            // Lấy API key từ header x-kiosk-key hoặc Authorization Bearer
            let apiKey = req.headers['x-kiosk-key'];
            if (!apiKey && req.headers['authorization']) {
                const parts = req.headers['authorization'].split(' ');
                if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                    apiKey = parts[1];
                }
            }

            const ipAddress = req.clientIp || req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress) || '';
            const data = await kioskService.generateKioskQr(apiKey, ipAddress);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getQrStatus(req, res, next) {
        try {
            let apiKey = req.headers['x-kiosk-key'];
            if (!apiKey && req.headers['authorization']) {
                const parts = req.headers['authorization'].split(' ');
                if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
                    apiKey = parts[1];
                }
            }
            const token = req.query.token || req.body?.token;
            const data = await kioskService.getKioskQrStatus(apiKey, token);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async rotateKey(req, res, next) {
        try {
            const { id } = req.params;
            const actor_id = req.user ? (req.user.username || req.user.ma_nv) : 'admin';
            const data = await kioskService.rotateApiKey(id, actor_id);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new KioskController();
