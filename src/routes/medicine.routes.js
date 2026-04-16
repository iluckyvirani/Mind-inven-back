const router = require('express').Router();
const auth = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  addMedicineValidator,
  updateMedicineValidator,
  addStockValidator,
} = require('../validators/medicine.validator');
const {
  getMedicines,
  getMedicineById,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  addStock,
  getCategories,
  getExpiringMedicines,
  getLowStockMedicines,
} = require('../controllers/medicine.controller');

// All routes require authentication
router.use(auth);

// Category routes
router.get('/categories', getCategories);

// Special medicine queries (must be before /:id)
router.get('/medicines/expiring', getExpiringMedicines);
router.get('/medicines/low-stock', getLowStockMedicines);

// Medicine CRUD
router.get('/medicines', getMedicines);
router.get('/medicines/:id', getMedicineById);

router.post(
  '/medicines',
  authorize('ADMIN', 'PHARMACIST'),
  addMedicineValidator,
  validate,
  addMedicine
);

router.put(
  '/medicines/:id',
  authorize('ADMIN'),
  updateMedicineValidator,
  validate,
  updateMedicine
);

router.delete(
  '/medicines/:id',
  authorize('ADMIN'),
  deleteMedicine
);

// Stock management
router.post(
  '/medicines/:id/stock',
  authorize('ADMIN', 'PHARMACIST'),
  addStockValidator,
  validate,
  addStock
);

module.exports = router;
