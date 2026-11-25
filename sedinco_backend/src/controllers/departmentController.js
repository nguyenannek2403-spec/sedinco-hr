const departmentService = require('../services/departmentService');

class DepartmentController {
    async getDepartments(req, res, next) {
        try {
            const data = await departmentService.getAllDepartments();
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async createDepartment(req, res, next) {
        try {
            const { name } = req.body || {};
            const data = await departmentService.createDepartment(name, req.user);
            return res.status(201).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async updateDepartment(req, res, next) {
        try {
            const { name } = req.body || {};
            const data = await departmentService.updateDepartment(req.params.id, name, req.user);
            return res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    async deleteDepartment(req, res, next) {
        try {
            const result = await departmentService.deleteDepartment(req.params.id, req.user);
            return res.json(result);
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new DepartmentController();
