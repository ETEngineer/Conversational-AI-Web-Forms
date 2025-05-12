const express = require('express');
const router = express.Router();
const responseController = require('../controllers/responseController');
const auth = require('../middleware/auth');

router.get('/form/:formId', auth, responseController.getResponses);
router.get('/:responseId', auth, responseController.getResponse);
router.delete('/:responseId', auth, responseController.deleteResponse);
router.get('/form/:formId/export', auth, responseController.exportResponses);
router.post("/callback", responseController.handleNlpCallback);

module.exports = router;