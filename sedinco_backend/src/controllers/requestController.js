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
            const result = await requestService.createRequest({ 
                employee_id: employee_id || (req.user ? req.user.ma_nv : null), 
                request_type, 
                request_date, 
                reason, 
                current_user: req.user 
            });
            return res.status(201).json({ success: true, message: 'Tạo đơn thành công!', data: result.data });
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

    async cancelRequest(req, res, next) {
        try {
            const reqId = req.params.id;
            const result = await requestService.cancelRequest(reqId, req.user);
            return res.json({ success: true, message: result.message || 'Hủy đơn thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async createOtPreRegistration(req, res, next) {
        try {
            const { employee_id, work_date, expected_hours, reason } = req.body;
            const result = await requestService.createOtPreRegistration({
                employee_id,
                work_date,
                expected_hours,
                reason,
                current_user: req.user
            });
            return res.status(201).json(result);
        } catch (err) {
            next(err);
        }
    }

    async getOtRegistrations(req, res, next) {
        try {
            const { month, year } = req.query;
            const data = await requestService.getOtRegistrations(month, year);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateOtRegistrationStatus(req, res, next) {
        try {
            const { status } = req.body;
            const { id } = req.params;
            const result = await requestService.updateOtRegistrationStatus(id, status, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new RequestController();
