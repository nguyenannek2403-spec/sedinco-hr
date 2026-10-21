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

    async getMyRequests(req, res, next) {
        try {
            const employee_id = req.user ? req.user.ma_nv : null;
            if (!employee_id) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const data = await requestService.getMyRequests(employee_id);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async createRequest(req, res, next) {
        try {
            const { employee_id, request_type, request_date, reason } = req.body;
            await requestService.createRequest({ 
                employee_id: employee_id || (req.user ? req.user.ma_nv : null), 
                request_type, 
                request_date, 
                reason, 
                current_user: req.user 
            });
            return res.json({ success: true, message: 'Tạo đơn thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async updateRequestStatus(req, res, next) {
        try {
            const { status } = req.body;
            const reqId = req.params.id;
            await requestService.updateRequestStatus(reqId, status, req.user);
            return res.json({ success: true, message: 'Cập nhật trạng thái đơn thành công!' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new RequestController();
