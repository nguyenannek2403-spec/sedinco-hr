const notificationService = require('../services/notificationService');

class NotificationController {
    async getMyNotifications(req, res, next) {
        try {
            const { limit, offset, filter } = req.query || {};
            const data = await notificationService.getMyNotifications(req.user, { limit, offset, filter });
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async markAsRead(req, res, next) {
        try {
            const data = await notificationService.markAsRead(req.params.id, req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async markAllAsRead(req, res, next) {
        try {
            const data = await notificationService.markAllAsRead(req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new NotificationController();
