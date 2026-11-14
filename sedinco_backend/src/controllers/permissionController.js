const permissionService = require('../services/permissionService');

class PermissionController {
    async getAccountantPermissions(req, res, next) {
        try {
            const data = await permissionService.getAccountantPermissions();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateAccountantPermissions(req, res, next) {
        try {
            const { permissions } = req.body;
            const result = await permissionService.updateAccountantPermissions(permissions, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getAuditLogs(req, res, next) {
        try {
            const data = await permissionService.getAuditLogs(req.query || {});
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async togglePinAuditLog(req, res, next) {
        try {
            const logId = req.params.id || req.body.id;
            const { is_pinned } = req.body;
            const result = await permissionService.togglePinAuditLog(logId, is_pinned);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async toggleEmployeeKeepLogs(req, res, next) {
        try {
            const ma_nv = req.params.ma_nv || req.body.ma_nv;
            const { keep_logs } = req.body;
            const result = await permissionService.toggleEmployeeKeepLogs(ma_nv, keep_logs, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async cleanupAuditLogs(req, res, next) {
        try {
            const { retention_days } = req.body || {};
            const result = await permissionService.cleanupExpiredAuditLogs(retention_days, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getAlertsSummary(req, res, next) {
        try {
            const data = await permissionService.getAlertsSummary();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PermissionController();
