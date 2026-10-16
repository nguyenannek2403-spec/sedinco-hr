const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');

router.get('/', (req, res, next) => companyController.getCompany(req, res, next));
router.put('/', (req, res, next) => companyController.updateCompany(req, res, next));

module.exports = router;
