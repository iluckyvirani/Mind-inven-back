const { body } = require('express-validator');

const addCustomerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required.')
    .isLength({ max: 100 })
    .withMessage('Name must be under 100 characters.'),
  body('phone')
    .trim()
    .matches(/^[0-9]{10,15}$/)
    .withMessage('Phone must be 10-15 digits.'),
  body('age')
    .optional()
    .isInt({ min: 0, max: 150 })
    .withMessage('Age must be between 0 and 150.'),
  body('address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Address must be under 500 characters.'),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.'),
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
  body('gstNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('GST number must be under 20 characters.'),
];

const updateCustomerValidator = [
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
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('Please enter a valid email.'),
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
  body('gstNo')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('GST number must be under 20 characters.'),
];

module.exports = { addCustomerValidator, updateCustomerValidator };
