const { body } = require('express-validator');

const EXPENSE_CATEGORIES = [
  'Salaries', 'Utilities', 'Rent', 'Equipment',
  'Marketing', 'Maintenance', 'Insurance', 'Miscellaneous',
];

const createExpenseValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required.')
    .isLength({ max: 200 })
    .withMessage('Title must be under 200 characters.'),
  body('amount')
    .notEmpty()
    .withMessage('Amount is required.')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0.'),
  body('category')
    .trim()
    .notEmpty()
    .withMessage('Category is required.')
    .isIn(EXPENSE_CATEGORIES)
    .withMessage(`Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`),
  body('date')
    .notEmpty()
    .withMessage('Date is required.')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date.'),
  body('paymentMode')
    .notEmpty()
    .withMessage('Payment mode is required.')
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring must be a boolean.'),
  body('recurringPeriod')
    .optional()
    .isIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
    .withMessage('Recurring period must be DAILY, WEEKLY, MONTHLY, or YEARLY.'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Note must be under 500 characters.'),
  body('receiptUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('Receipt URL must be a valid URL.'),
];

const updateExpenseValidator = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty.')
    .isLength({ max: 200 })
    .withMessage('Title must be under 200 characters.'),
  body('amount')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0.'),
  body('category')
    .optional()
    .trim()
    .isIn(EXPENSE_CATEGORIES)
    .withMessage(`Category must be one of: ${EXPENSE_CATEGORIES.join(', ')}`),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date.'),
  body('paymentMode')
    .optional()
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring must be a boolean.'),
  body('recurringPeriod')
    .optional()
    .isIn(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])
    .withMessage('Recurring period must be DAILY, WEEKLY, MONTHLY, or YEARLY.'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Note must be under 500 characters.'),
  body('receiptUrl')
    .optional()
    .trim()
    .isURL()
    .withMessage('Receipt URL must be a valid URL.'),
];

module.exports = {
  createExpenseValidator,
  updateExpenseValidator,
  EXPENSE_CATEGORIES,
};
