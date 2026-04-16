const { body } = require('express-validator');

const updateShopValidator = [
  body('name').optional().trim().notEmpty().withMessage('Shop name cannot be empty.'),
  body('tagline').optional().trim(),
  body('address').optional().trim(),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('pincode').optional().trim(),
  body('phone').optional().trim(),
  body('mobile').optional().trim(),
  body('email').optional().trim().isEmail().withMessage('Please enter a valid email.'),
  body('website').optional().trim(),
  body('gstin').optional().trim(),
  body('licenseNo').optional().trim(),
  body('printHeader').optional().trim(),
  body('printFooter').optional().trim(),
  body('logoUrl').optional().trim(),
  body('taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tax rate must be between 0 and 100.'),
];

const addTeamValidator = [
  body('name').trim().notEmpty().withMessage('Name is required.'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Please enter a valid email.'),
  body('phone').optional().trim(),
  body('password')
    .notEmpty()
    .withMessage('Password is required.')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('role')
    .notEmpty()
    .withMessage('Role is required.')
    .isIn(['ADMIN', 'PHARMACIST', 'CASHIER'])
    .withMessage('Role must be ADMIN, PHARMACIST, or CASHIER.'),
];

const updateTeamValidator = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty.'),
  body('email').optional().trim().isEmail().withMessage('Please enter a valid email.'),
  body('phone').optional().trim(),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
  body('role')
    .optional()
    .isIn(['ADMIN', 'PHARMACIST', 'CASHIER'])
    .withMessage('Role must be ADMIN, PHARMACIST, or CASHIER.'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE'])
    .withMessage('Status must be ACTIVE or INACTIVE.'),
];

const changeTeamPasswordValidator = [
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required.')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters.'),
];

module.exports = { updateShopValidator, addTeamValidator, updateTeamValidator, changeTeamPasswordValidator };
