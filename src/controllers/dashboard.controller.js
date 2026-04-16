const prisma = require('../config/db');
const { success } = require('../utils/apiResponse');

/**
 * GET /api/pharmacy/dashboard/stats
 */
const getStats = async (req, res, next) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + 30);

    const [
      todaySalesAgg,
      totalMedicines,
      lowStockCount,
      expiringSoonCount,
      monthlyRevenueAgg,
      pendingAgg,
    ] = await Promise.all([
      prisma.sale.aggregate({
        where: { date: { gte: todayStart, lt: todayEnd } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      prisma.medicine.count(),
      prisma.medicine.count({
        where: { OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }] },
      }),
      prisma.medicine.count({
        where: {
          expiryDate: { gte: now, lte: expiryThreshold },
          stock: { gt: 0 },
        },
      }),
      prisma.sale.aggregate({
        where: { date: { gte: monthStart, lt: monthEnd } },
        _sum: { grandTotal: true },
      }),
      prisma.sale.aggregate({
        where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
        _sum: { balance: true },
      }),
    ]);

    return success(res, 'Dashboard stats fetched successfully', {
      todaySales: todaySalesAgg._sum.grandTotal || 0,
      todayBillCount: todaySalesAgg._count,
      totalMedicines,
      lowStockCount,
      expiringSoonCount,
      monthlyRevenue: monthlyRevenueAgg._sum.grandTotal || 0,
      pendingPayments: pendingAgg._sum.balance || 0,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/dashboard/recent-sales
 */
const getRecentSales = async (req, res, next) => {
  try {
    const sales = await prisma.sale.findMany({
      take: 10,
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    });

    return success(res, 'Recent sales fetched successfully', sales);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/dashboard/low-stock
 */
const getLowStockAlerts = async (req, res, next) => {
  try {
    const medicines = await prisma.medicine.findMany({
      where: { OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }] },
      orderBy: { stock: 'asc' },
      select: {
        id: true,
        name: true,
        stock: true,
        minStock: true,
        status: true,
        category: { select: { name: true } },
      },
    });

    return success(res, 'Low stock alerts fetched successfully', medicines);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/dashboard/expiry-alerts
 */
const getExpiryAlerts = async (req, res, next) => {
  try {
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + 30);

    const medicines = await prisma.medicine.findMany({
      where: {
        expiryDate: { gte: now, lte: threshold },
        stock: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
      select: {
        id: true,
        name: true,
        batchNo: true,
        stock: true,
        expiryDate: true,
        category: { select: { name: true } },
      },
    });

    return success(res, 'Expiry alerts fetched successfully', medicines);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/dashboard/revenue-chart?period=7|30
 */
const getRevenueChart = async (req, res, next) => {
  try {
    const period = parseInt(req.query.period) || 7;
    const days = Math.min(period, 90); // cap at 90 days

    const formatLocalDate = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);

    const sales = await prisma.sale.findMany({
      where: { date: { gte: startDate } },
      select: { date: true, grandTotal: true },
      orderBy: { date: 'asc' },
    });

    // Group by date
    const chartMap = {};

    // Initialize all dates with 0 (including today)
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = formatLocalDate(d);
      chartMap[key] = 0;
    }

    // Fill with actual data
    for (const sale of sales) {
      const key = formatLocalDate(new Date(sale.date));
      if (chartMap[key] !== undefined) {
        chartMap[key] += sale.grandTotal;
      }
    }

    const chartData = Object.entries(chartMap).map(([date, total]) => ({
      date,
      total: Math.round(total * 100) / 100,
    }));

    return success(res, 'Revenue chart data fetched successfully', chartData);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStats,
  getRecentSales,
  getLowStockAlerts,
  getExpiryAlerts,
  getRevenueChart,
};
