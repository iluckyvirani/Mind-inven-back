const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  addSupplierValidator,
  updateSupplierValidator,
  supplierPaymentValidator,
} = require('../validators/supplier.validator');
const { supplierReturnValidator } = require('../validators/supplierReturn.validator');
const {
  getSuppliers,
  getSupplierById,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  addPayment,
  getPayments,
} = require('../controllers/supplier.controller');
const {
  createSupplierReturn,
  getSupplierReturns,
} = require('../controllers/supplierReturn.controller');

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

// Supplier returns
router.post(
  '/:id/return',
  authorize('ADMIN', 'PHARMACIST'),
  supplierReturnValidator,
  validate,
  createSupplierReturn
);

router.get('/:id/returns', getSupplierReturns);

module.exports = router;
