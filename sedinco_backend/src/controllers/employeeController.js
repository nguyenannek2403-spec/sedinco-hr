const employeeService = require('../services/employeeService');

class EmployeeController {
    async getEmployees(req, res, next) {
        try {
            const data = await employeeService.getAllEmployees();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async getEmployeeById(req, res, next) {
        try {
            const data = await employeeService.getEmployeeById(req.params.id);
            if (!data) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy nhân viên!' });
            }
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async createEmployee(req, res, next) {
        try {
            await employeeService.createEmployee(req.body, req.user);
            return res.json({ success: true, message: 'Tạo hồ sơ nhân viên thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async updateEmployee(req, res, next) {
        try {
            await employeeService.updateEmployee(req.params.id, req.body, req.user);
            return res.json({ success: true, message: 'Cập nhật thông tin nhân viên thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async updateEmployeeRole(req, res, next) {
        try {
            const { role } = req.body;
            await employeeService.updateEmployeeRole(req.params.ma_nv, role, req.user);
            return res.json({ success: true, message: 'Cập nhật phân quyền nhân viên thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async updateEmployeeStatus(req, res, next) {
        try {
            const { status, is_locked } = req.body;
            await employeeService.updateEmployeeStatus(req.params.ma_nv, { status, is_locked }, req.user);
            return res.json({ success: true, message: 'Cập nhật trạng thái tài khoản thành công!' });
        } catch (err) {
            next(err);
        }
    }

    async deleteEmployee(req, res, next) {
        try {
            await employeeService.deleteEmployee(req.params.id, req.user);
            return res.json({ success: true, message: 'Xóa nhân viên thành công!' });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new EmployeeController();
