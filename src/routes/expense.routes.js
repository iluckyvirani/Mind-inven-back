const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  createExpenseValidator,
  updateExpenseValidator,
} = require('../validators/expense.validator');
const {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getCategories,
} = require('../controllers/expense.controller');

// All routes require authentication
router.use(auth);

// Categories (must be before /:id)
router.get('/categories', getCategories);

// Expense CRUD
router.get('/', getExpenses);

router.post(
  '/',
  authorize('ADMIN', 'PHARMACIST'),
  createExpenseValidator,
  validate,
  createExpense
);

router.put(
  '/:id',
  authorize('ADMIN'),
  updateExpenseValidator,
  validate,
  updateExpense
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  deleteExpense
);

module.exports = router;
