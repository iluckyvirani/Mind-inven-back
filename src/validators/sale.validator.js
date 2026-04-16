const { body } = require('express-validator');

const createSaleValidator = [
  body('customerName')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required.')
    .isLength({ max: 100 })
    .withMessage('Customer name must be under 100 characters.'),
  body('customerPhone')
    .trim()
    .notEmpty()
    .withMessage('Customer phone is required.')
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Phone must be 10-15 digits.'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required.'),
  body('items.*.medicineId')
    .notEmpty()
    .withMessage('Medicine ID is required for each item.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be 0 or more.'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount must be between 0 and 100 (percentage).'),
  body('paymentMode')
    .notEmpty()
    .withMessage('Payment mode is required.')
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
  body('amountPaid')
    .isFloat({ min: 0 })
    .withMessage('Amount paid must be 0 or more.'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be under 500 characters.'),
];

const updatePaymentValidator = [
  body('amount')
    .notEmpty()
    .withMessage('Payment amount is required.')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0.'),
  body('paymentMode')
    .optional()
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
];

const updateSaleValidator = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required.'),
  body('items.*.medicineId')
    .notEmpty()
    .withMessage('Medicine ID is required for each item.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('items.*.unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be 0 or more.'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount must be between 0 and 100 (percentage).'),
  body('paymentMode')
    .optional()
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
  body('amountPaid')
    .isFloat({ min: 0 })
    .withMessage('Amount paid must be 0 or more.'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must be under 500 characters.'),
];

module.exports = {
  createSaleValidator,
  updatePaymentValidator,
  updateSaleValidator,
};
