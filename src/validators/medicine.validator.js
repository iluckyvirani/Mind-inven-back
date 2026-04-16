const { body } = require('express-validator');

const addMedicineValidator = [
  body('name').trim().notEmpty().withMessage('Medicine name is required.'),
  body('categoryId').trim().notEmpty().withMessage('Category is required.'),
  body('batchNo').trim().notEmpty().withMessage('Batch number is required.'),
  body('stock')
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer.'),
  body('minStock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock must be a non-negative integer.'),
  body('unitPrice')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a non-negative number.'),
  body('sellingPrice')
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number.'),
  body('expiryDate')
    .notEmpty()
    .withMessage('Expiry date is required.')
    .isISO8601()
    .withMessage('Expiry date must be a valid date.'),
  body('genericName').optional().trim(),
  body('barcode').optional().trim(),
  body('supplierId').optional().trim(),
  body('manufacturer').optional().trim(),
  body('description').optional().trim(),
  body('form').optional().trim(),
  body('mrp').optional().isFloat({ min: 0 }).withMessage('MRP must be a non-negative number.'),
  body('rackNo').optional().trim(),
  body('hsnCode').optional().trim(),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('GST percent must be between 0 and 100.'),
];

const updateMedicineValidator = [
  body('name').optional().trim().notEmpty().withMessage('Medicine name cannot be empty.'),
  body('categoryId').optional().trim().notEmpty().withMessage('Category cannot be empty.'),
  body('batchNo').optional().trim().notEmpty().withMessage('Batch number cannot be empty.'),
  body('stock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Stock must be a non-negative integer.'),
  body('minStock')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Minimum stock must be a non-negative integer.'),
  body('unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a non-negative number.'),
  body('sellingPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number.'),
  body('expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Expiry date must be a valid date.'),
  body('genericName').optional().trim(),
  body('barcode').optional().trim(),
  body('supplierId').optional().trim(),
  body('manufacturer').optional().trim(),
  body('description').optional().trim(),
  body('form').optional().trim(),
  body('mrp').optional().isFloat({ min: 0 }).withMessage('MRP must be a non-negative number.'),
  body('rackNo').optional().trim(),
  body('hsnCode').optional().trim(),
  body('gstPercent').optional().isFloat({ min: 0, max: 100 }).withMessage('GST percent must be between 0 and 100.'),
];

const addStockValidator = [
  body('quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1.'),
  body('batchNo').optional().trim(),
  body('note').optional().trim(),
];

module.exports = { addMedicineValidator, updateMedicineValidator, addStockValidator };
