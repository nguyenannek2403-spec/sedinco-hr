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
            return res.status(201).json({ success: true, message: 'Tạo hồ sơ nhân viên thành công!' });
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

    async bindZalo(req, res, next) {
        try {
            const { zalo_token } = req.body;
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const data = await employeeService.bindZalo(ma_nv, zalo_token, req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async requestDeviceChange(req, res, next) {
        try {
            const { new_device_id, reason } = req.body;
            const ma_nv = req.user ? req.user.ma_nv : null;
            if (!ma_nv) {
                return res.status(401).json({ success: false, message: 'Yêu cầu đăng nhập tài khoản nhân viên!' });
            }
            const result = await employeeService.requestDeviceChange(ma_nv, { new_device_id, reason }, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async getPendingDeviceChanges(req, res, next) {
        try {
            const data = await employeeService.getPendingDeviceChanges();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async approveDeviceChange(req, res, next) {
        try {
            const { ma_nv } = req.params;
            const result = await employeeService.approveDeviceChange(ma_nv, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async rejectDeviceChange(req, res, next) {
        try {
            const { ma_nv } = req.params;
            const result = await employeeService.rejectDeviceChange(ma_nv, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async setDeviceBindingMode(req, res, next) {
        try {
            const { ma_nv } = req.params;
            const { mode } = req.body;
            const result = await employeeService.setDeviceBindingMode(ma_nv, mode, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }

    async stagedForcePasswordChange(req, res, next) {
        try {
            const { role, chuc_danh, ma_nv_list, limit, offset, dry_run } = req.body;
            const result = await employeeService.stagedForcePasswordChange({
                role,
                chuc_danh,
                ma_nv_list,
                limit,
                offset,
                dry_run,
                current_user: req.user
            });
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new EmployeeController();
