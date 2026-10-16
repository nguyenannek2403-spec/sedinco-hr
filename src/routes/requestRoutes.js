const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

router.get('/', (req, res, next) => requestController.getRequests(req, res, next));
router.post('/', (req, res, next) => requestController.createRequest(req, res, next));
router.put('/:id', (req, res, next) => requestController.updateRequestStatus(req, res, next));

module.exports = router;
