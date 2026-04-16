const { success } = require('../utils/apiResponse');

const router = require('express').Router();

// Health check
router.get('/', (req, res) => {
  success(res, 'Dimag Pharmacy API is running');
});

// Mount route files
router.use('/auth', require('./auth.routes'));
router.use('/pharmacy', require('./medicine.routes'));
router.use('/pharmacy/suppliers', require('./supplier.routes'));
router.use('/pharmacy/dashboard', require('./dashboard.routes'));
router.use('/sales', require('./sale.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/expenses', require('./expense.routes'));
router.use('/reports', require('./report.routes'));
router.use('/settings', require('./settings.routes'));

module.exports = router;
