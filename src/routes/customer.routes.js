const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const { addCustomerValidator, updateCustomerValidator } = require('../validators/customer.validator');
const {
  addCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getPurchaseHistory,
  collectPayment,
} = require('../controllers/customer.controller');

// All routes require authentication
router.use(auth);

router.get('/', getCustomers);

router.post(
  '/',
  authorize('ADMIN', 'PHARMACIST'),
  addCustomerValidator,
  validate,
  addCustomer
);

router.get('/:id', getCustomerById);
router.get('/:id/purchases', getPurchaseHistory);
router.post('/:id/payment', auth, collectPayment);

router.put(
  '/:id',
  authorize('ADMIN'),
  updateCustomerValidator,
  validate,
  updateCustomer
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  deleteCustomer
);

module.exports = router;
