const { body } = require('express-validator');

const supplierReturnValidator = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required.'),
  body('items.*.medicineId')
    .notEmpty()
    .withMessage('Medicine ID is required for each item.'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Return quantity must be at least 1.'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reason must be under 500 characters.'),
];

module.exports = {
  supplierReturnValidator,
};
