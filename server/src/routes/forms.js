const express = require('express');
const router = express.Router();
const formController = require('../controllers/formController');
const auth = require('../middleware/auth');

router.post('/', auth, formController.createForm);
router.get('/', auth, formController.getForms);
router.get('/:formId', auth, formController.getForm);
router.put('/:formId', auth, formController.updateForm);
router.delete('/:formId', auth, formController.deleteForm);
router.post('/:formId/publish', auth, formController.publishForm);

module.exports = router; 