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

    async createEmployee(req, res, next) {
        try {
            await employeeService.createEmployee(req.body);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async updateEmployee(req, res, next) {
        try {
            await employeeService.updateEmployee(req.params.id, req.body);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async updateEmployeeRole(req, res, next) {
        try {
            const { role } = req.body;
            await employeeService.updateEmployeeRole(req.params.ma_nv, role);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }

    async deleteEmployee(req, res, next) {
        try {
            await employeeService.deleteEmployee(req.params.id);
            return res.json({ success: true });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new EmployeeController();
