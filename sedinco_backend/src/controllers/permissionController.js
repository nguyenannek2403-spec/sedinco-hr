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
            const { limit } = req.query;
            const data = await permissionService.getAuditLogs(limit);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PermissionController();
