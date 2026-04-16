const prisma = require('../config/db');
const { success, error } = require('../utils/apiResponse');

/**
 * Helper: parse dateFrom / dateTo from query
 */
const parseDateRange = (query) => {
  const where = {};
  if (query.dateFrom) where.gte = new Date(query.dateFrom);
  if (query.dateTo) {
    const to = new Date(query.dateTo);
    to.setHours(23, 59, 59, 999);
    where.lte = to;
  }
  return Object.keys(where).length ? where : null;
};

/**
 * Helper: format local date as YYYY-MM-DD
 */
const formatLocalDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// =============================================
// 9.1  daily-sales
// =============================================
const dailySales = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const sales = await prisma.sale.findMany({
    where,
    select: { date: true, grandTotal: true },
    orderBy: { date: 'asc' },
  });

  const grouped = {};
  for (const s of sales) {
    const key = formatLocalDate(new Date(s.date));
    if (!grouped[key]) grouped[key] = { date: key, totalSales: 0, billCount: 0 };
    grouped[key].totalSales += s.grandTotal;
    grouped[key].billCount += 1;
  }

  return Object.values(grouped);
};

// =============================================
// 9.2  monthly-sales
// =============================================
const monthlySales = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const sales = await prisma.sale.findMany({
    where,
    select: { date: true, grandTotal: true },
    orderBy: { date: 'asc' },
  });

  const grouped = {};
  for (const s of sales) {
    const d = new Date(s.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = { month: key, totalSales: 0, billCount: 0 };
    grouped[key].totalSales += s.grandTotal;
    grouped[key].billCount += 1;
  }

  return Object.values(grouped);
};

// =============================================
// 9.3  sales-by-customer
// =============================================
const salesByCustomer = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const sales = await prisma.sale.findMany({
    where,
    select: {
      grandTotal: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  const grouped = {};
  for (const s of sales) {
    const cid = s.customer.id;
    if (!grouped[cid]) {
      grouped[cid] = {
        customerId: cid,
        customerName: s.customer.name,
        phone: s.customer.phone,
        totalSpent: 0,
        purchaseCount: 0,
      };
    }
    grouped[cid].totalSpent += s.grandTotal;
    grouped[cid].purchaseCount += 1;
  }

  return Object.values(grouped).sort((a, b) => b.totalSpent - a.totalSpent);
};

// =============================================
// 9.4  sales-by-medicine
// =============================================
const salesByMedicine = async (dateRange) => {
  const saleWhere = dateRange ? { sale: { date: dateRange } } : {};

  const items = await prisma.saleItem.findMany({
    where: saleWhere,
    select: {
      quantity: true,
      amount: true,
      medicine: { select: { id: true, name: true, category: { select: { name: true } } } },
    },
  });

  const grouped = {};
  for (const item of items) {
    const mid = item.medicine.id;
    if (!grouped[mid]) {
      grouped[mid] = {
        medicineId: mid,
        medicineName: item.medicine.name,
        category: item.medicine.category.name,
        totalQuantity: 0,
        totalAmount: 0,
      };
    }
    grouped[mid].totalQuantity += item.quantity;
    grouped[mid].totalAmount += item.amount;
  }

  return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
};

// =============================================
// 9.5  payment-mode-summary
// =============================================
const paymentModeSummary = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const sales = await prisma.sale.findMany({
    where,
    select: { paymentMode: true, grandTotal: true },
  });

  const grouped = {};
  for (const s of sales) {
    const mode = s.paymentMode;
    if (!grouped[mode]) grouped[mode] = { paymentMode: mode, totalAmount: 0, count: 0 };
    grouped[mode].totalAmount += s.grandTotal;
    grouped[mode].count += 1;
  }

  return Object.values(grouped);
};

// =============================================
// 9.6  current-stock
// =============================================
const currentStock = async () => {
  const medicines = await prisma.medicine.findMany({
    select: {
      id: true,
      name: true,
      stock: true,
      unitPrice: true,
      sellingPrice: true,
      status: true,
      category: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });

  return medicines.map((m) => ({
    ...m,
    category: m.category.name,
    totalValue: Math.round(m.stock * m.unitPrice * 100) / 100,
  }));
};

// =============================================
// 9.7  low-stock
// =============================================
const lowStock = async () => {
  const medicines = await prisma.medicine.findMany({
    where: { OR: [{ status: 'LOW_STOCK' }, { status: 'OUT_OF_STOCK' }] },
    select: {
      id: true,
      name: true,
      stock: true,
      minStock: true,
      status: true,
      category: { select: { name: true } },
      supplier: { select: { name: true } },
    },
    orderBy: { stock: 'asc' },
  });

  return medicines.map((m) => ({
    ...m,
    category: m.category.name,
    supplier: m.supplier?.name || null,
  }));
};

// =============================================
// 9.8  expiring-medicines
// =============================================
const expiringMedicines = async (dateRange) => {
  const now = new Date();
  const defaultThreshold = new Date();
  defaultThreshold.setDate(defaultThreshold.getDate() + 90);

  const where = {
    expiryDate: dateRange || { gte: now, lte: defaultThreshold },
    stock: { gt: 0 },
  };

  const medicines = await prisma.medicine.findMany({
    where,
    select: {
      id: true,
      name: true,
      batchNo: true,
      stock: true,
      expiryDate: true,
      sellingPrice: true,
      category: { select: { name: true } },
    },
    orderBy: { expiryDate: 'asc' },
  });

  return medicines.map((m) => ({
    ...m,
    category: m.category.name,
    daysUntilExpiry: Math.ceil((new Date(m.expiryDate) - now) / (1000 * 60 * 60 * 24)),
  }));
};

// =============================================
// 9.9  category-stock-value
// =============================================
const categoryStockValue = async () => {
  const medicines = await prisma.medicine.findMany({
    select: {
      stock: true,
      unitPrice: true,
      category: { select: { id: true, name: true } },
    },
  });

  const grouped = {};
  for (const m of medicines) {
    const cid = m.category.id;
    if (!grouped[cid]) {
      grouped[cid] = { categoryId: cid, categoryName: m.category.name, medicineCount: 0, totalValue: 0 };
    }
    grouped[cid].medicineCount += 1;
    grouped[cid].totalValue += m.stock * m.unitPrice;
  }

  return Object.values(grouped).map((c) => ({
    ...c,
    totalValue: Math.round(c.totalValue * 100) / 100,
  }));
};

// =============================================
// 9.10  income-statement
// =============================================
const incomeStatement = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const [salesAgg, expenseAgg] = await Promise.all([
    prisma.sale.aggregate({ where, _sum: { grandTotal: true }, _count: true }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
  ]);

  const totalRevenue = salesAgg._sum.grandTotal || 0;
  const totalExpenses = expenseAgg._sum.amount || 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalSalesCount: salesAgg._count,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    totalExpenseCount: expenseAgg._count,
    netIncome: Math.round((totalRevenue - totalExpenses) * 100) / 100,
  };
};

// =============================================
// 9.11  expense-report
// =============================================
const expenseReport = async (dateRange) => {
  const where = dateRange ? { date: dateRange } : {};

  const expenses = await prisma.expense.findMany({
    where,
    select: { category: true, amount: true },
  });

  const grouped = {};
  for (const e of expenses) {
    if (!grouped[e.category]) grouped[e.category] = { category: e.category, totalAmount: 0, count: 0 };
    grouped[e.category].totalAmount += e.amount;
    grouped[e.category].count += 1;
  }

  return Object.values(grouped).sort((a, b) => b.totalAmount - a.totalAmount);
};

// =============================================
// 9.12  profit-loss
// =============================================
const profitLoss = async (dateRange) => {
  const saleWhere = dateRange ? { date: dateRange } : {};
  const saleItemWhere = dateRange ? { sale: { date: dateRange } } : {};
  const expenseWhere = dateRange ? { date: dateRange } : {};

  const [salesAgg, saleItems, expenseAgg] = await Promise.all([
    prisma.sale.aggregate({ where: saleWhere, _sum: { grandTotal: true } }),
    prisma.saleItem.findMany({
      where: saleItemWhere,
      select: { quantity: true, unitPrice: true, amount: true },
    }),
    prisma.expense.aggregate({ where: expenseWhere, _sum: { amount: true } }),
  ]);

  const totalRevenue = salesAgg._sum.grandTotal || 0;
  const cogs = saleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const totalExpenses = expenseAgg._sum.amount || 0;
  const grossProfit = totalRevenue - cogs;
  const netProfit = grossProfit - totalExpenses;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    costOfGoodsSold: Math.round(cogs * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalExpenses: Math.round(totalExpenses * 100) / 100,
    netProfit: Math.round(netProfit * 100) / 100,
    profitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
  };
};

// =============================================
// 9.13  outstanding-payments
// =============================================
const outstandingPayments = async () => {
  const sales = await prisma.sale.findMany({
    where: { paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
    select: {
      id: true,
      invoiceNo: true,
      grandTotal: true,
      amountPaid: true,
      balance: true,
      paymentStatus: true,
      date: true,
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { date: 'desc' },
  });

  const totalOutstanding = sales.reduce((sum, s) => sum + s.balance, 0);

  return {
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    count: sales.length,
    sales,
  };
};

// =============================================
// 9.14  supplier-purchases
// =============================================
const supplierPurchases = async () => {
  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      totalPurchase: true,
      totalPaid: true,
      _count: { select: { medicines: true } },
    },
    orderBy: { totalPurchase: 'desc' },
  });

  return suppliers.map((s) => ({
    supplierId: s.id,
    supplierName: s.name,
    medicineCount: s._count.medicines,
    totalPurchase: s.totalPurchase,
    totalPaid: s.totalPaid,
    balance: Math.round((s.totalPurchase - s.totalPaid) * 100) / 100,
  }));
};

// =============================================
// REPORT HANDLER MAP
// =============================================
const reportHandlers = {
  'daily-sales': (dr) => dailySales(dr),
  'monthly-sales': (dr) => monthlySales(dr),
  'sales-by-customer': (dr) => salesByCustomer(dr),
  'sales-by-medicine': (dr) => salesByMedicine(dr),
  'payment-mode-summary': (dr) => paymentModeSummary(dr),
  'current-stock': () => currentStock(),
  'low-stock': () => lowStock(),
  'expiring-medicines': (dr) => expiringMedicines(dr),
  'category-stock-value': () => categoryStockValue(),
  'income-statement': (dr) => incomeStatement(dr),
  'expense-report': (dr) => expenseReport(dr),
  'profit-loss': (dr) => profitLoss(dr),
  'outstanding-payments': () => outstandingPayments(),
  'supplier-purchases': () => supplierPurchases(),
};

/**
 * GET /api/reports/:type?dateFrom&dateTo
 */
const getReport = async (req, res, next) => {
  try {
    const { type } = req.params;

    const handler = reportHandlers[type];
    if (!handler) {
      return error(res, `Unknown report type: ${type}. Available types: ${Object.keys(reportHandlers).join(', ')}`, 400);
    }

    const dateRange = parseDateRange(req.query);
    const data = await handler(dateRange);

    return success(res, `Report "${type}" generated successfully`, {
      reportType: type,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      data,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getReport };
