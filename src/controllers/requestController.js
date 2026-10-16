const requestService = require('../services/requestService');

class RequestController {
    async getRequests(req, res, next) {
        try {
            const data = await requestService.getAllRequests();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async createRequest(req, res, next) {
        try {
            const { employee_id, request_type, request_date, reason } = req.body;
            await requestService.createRequest({ employee_id, request_type, request_date, reason });
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async updateRequestStatus(req, res, next) {
        try {
            const { status } = req.body;
            const reqId = req.params.id;
            await requestService.updateRequestStatus(reqId, status);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new RequestController();
