const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  addSupplierValidator,
  updateSupplierValidator,
  supplierPaymentValidator,
} = require('../validators/supplier.validator');
const {
  getSuppliers,
  getSupplierById,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  addPayment,
  getPayments,
} = require('../controllers/supplier.controller');

// All routes require authentication
router.use(auth);

// Supplier CRUD
router.get('/', getSuppliers);
router.get('/:id', getSupplierById);

router.post(
  '/',
  authorize('ADMIN', 'PHARMACIST'),
  addSupplierValidator,
  validate,
  addSupplier
);

router.put(
  '/:id',
  authorize('ADMIN'),
  updateSupplierValidator,
  validate,
  updateSupplier
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  deleteSupplier
);

// Supplier payments
router.post(
  '/:id/payment',
  authorize('ADMIN', 'PHARMACIST'),
  supplierPaymentValidator,
  validate,
  addPayment
);

router.get('/:id/payments', getPayments);

module.exports = router;
