const qaCenterService = require('./qaCenterService');

class QaCenterController {
    async getOverview(req, res, next) {
        try {
            const data = await qaCenterService.getOverview();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getTestCases(req, res, next) {
        try {
            const { group, module, status } = req.query || {};
            const data = await qaCenterService.getTestCases({ group, module, status });
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getBugs(req, res, next) {
        try {
            const { severity, status, module } = req.query || {};
            const data = await qaCenterService.getBugs({ severity, status, module });
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getHistory(req, res, next) {
        try {
            const data = await qaCenterService.getHistory();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async runSafeChecks(req, res, next) {
        try {
            const { checks, requestedMode, mode } = req.body || {};
            const actor = req.user?.username || req.user?.ma_nv || 'admin';
            const data = await qaCenterService.runSafeChecks({
                checks,
                requestedMode: requestedMode || mode || 'safe',
                actor,
                expressApp: req.app
            });
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async exportReport(req, res, next) {
        try {
            const data = await qaCenterService.exportReport();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new QaCenterController();
