const router = require('express').Router();
const auth = require('../middleware/auth');
const {
  getStats,
  getRecentSales,
  getLowStockAlerts,
  getExpiryAlerts,
  getRevenueChart,
} = require('../controllers/dashboard.controller');

// All routes require authentication
router.use(auth);

router.get('/stats', getStats);
router.get('/recent-sales', getRecentSales);
router.get('/low-stock', getLowStockAlerts);
router.get('/expiry-alerts', getExpiryAlerts);
router.get('/revenue-chart', getRevenueChart);

module.exports = router;
