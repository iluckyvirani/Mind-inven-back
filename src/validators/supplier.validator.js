const { body } = require('express-validator');

const addSupplierValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Supplier name is required.')
    .isLength({ max: 100 })
    .withMessage('Name must be under 100 characters.'),
  body('phone')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required.')
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Phone must be 10-15 digits.'),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Contact person must be under 100 characters.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Address must be under 300 characters.'),
  body('bankName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Bank name must be under 100 characters.'),
  body('accountNo')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Account number must be under 30 characters.'),
  body('ifscCode')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('IFSC code must be under 20 characters.'),
  body('gstNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('GST number must be under 20 characters.'),
  body('panNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('PAN number must be under 20 characters.'),
];

const updateSupplierValidator = [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty.')
    .isLength({ max: 100 })
    .withMessage('Name must be under 100 characters.'),
  body('phone')
    .optional()
    .trim()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Phone must be 10-15 digits.'),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Contact person must be under 100 characters.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Address must be under 300 characters.'),
  body('bankName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Bank name must be under 100 characters.'),
  body('accountNo')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Account number must be under 30 characters.'),
  body('ifscCode')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('IFSC code must be under 20 characters.'),
  body('gstNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('GST number must be under 20 characters.'),
  body('panNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('PAN number must be under 20 characters.'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('Status must be ACTIVE or INACTIVE.'),
];

const supplierPaymentValidator = [
  body('amount')
    .notEmpty()
    .withMessage('Amount is required.')
    .isFloat({ min: 0.01 })
    .withMessage('Amount must be greater than 0.'),
  body('paymentMode')
    .notEmpty()
    .withMessage('Payment mode is required.')
    .isIn(['CASH', 'CARD', 'UPI'])
    .withMessage('Payment mode must be CASH, CARD, or UPI.'),
  body('note')
    .optional()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Note must be under 300 characters.'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date.'),
];

module.exports = {
  addSupplierValidator,
  updateSupplierValidator,
  supplierPaymentValidator,
};
