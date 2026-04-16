const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/role');
const { getReport } = require('../controllers/report.controller');

// All report routes require auth + ADMIN or PHARMACIST
router.use(authenticate);
router.use(authorize('ADMIN', 'PHARMACIST'));

router.get('/:type', getReport);

module.exports = router;
