const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  createSaleValidator,
  updatePaymentValidator,
  updateSaleValidator,
} = require('../validators/sale.validator');
const {
  createSale,
  getSales,
  getSaleById,
  getReceipt,
  updatePayment,
  updateSale,
  deleteSale,
  getDailySummary,
  getSalesByPhone,
  exportSalesPdf,
} = require('../controllers/sale.controller');

// All routes require authentication
router.use(auth);

// Special routes (must be before /:id to avoid conflicts)
router.get('/export/pdf', exportSalesPdf);
router.get('/summary/:date', getDailySummary);
router.get('/by-phone/:phone', getSalesByPhone);

// Sale CRUD
router.get('/', getSales);

router.post(
  '/',
  authorize('ADMIN', 'PHARMACIST'),
  createSaleValidator,
  validate,
  createSale
);

router.get('/:id', getSaleById);
router.get('/:id/receipt', getReceipt);

router.patch(
  '/:id/payment',
  authorize('ADMIN', 'PHARMACIST'),
  updatePaymentValidator,
  validate,
  updatePayment
);

router.put(
  '/:id',
  authorize('ADMIN'),
  updateSaleValidator,
  validate,
  updateSale
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  deleteSale
);

module.exports = router;
