const prisma = require('../config/db');
const { success, error } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

/**
 * POST /api/customers
 */
const addCustomer = async (req, res, next) => {
  try {
    const { name, phone, age, address, email, bankName, accountNo, gstNo } = req.body;

    // Check if phone already exists
    const existing = await prisma.customer.findUnique({
      where: { phone },
    });

    if (existing) {
      return error(res, 'A customer with this phone number already exists.', 400);
    }

    const customer = await prisma.customer.create({
      data: {
        name,
        phone,
        age: age ? parseInt(age) : 0,
        address: address || '',
        email: email || null,
        bankName: bankName || null,
        accountNo: accountNo || null,
        gstNo: gstNo || null,
      },
    });

    return success(res, 'Customer created successfully', customer, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers?search&sort&page&limit
 */
const getCustomers = async (req, res, next) => {
  try {
    const { search, sort } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    let orderBy = { createdAt: 'desc' };
    if (sort === 'name-asc') orderBy = { name: 'asc' };
    if (sort === 'name-desc') orderBy = { name: 'desc' };
    if (sort === 'spent-asc') orderBy = { totalSpent: 'asc' };
    if (sort === 'spent-desc') orderBy = { totalSpent: 'desc' };
    if (sort === 'recent') orderBy = { updatedAt: 'desc' };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          _count: { select: { sales: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    // Compute live pendingAmount from actual sale balances
    const customerIds = customers.map(c => c.id);
    const pendingAgg = await prisma.sale.groupBy({
      by: ['customerId'],
      _sum: { balance: true },
      where: { customerId: { in: customerIds } },
    });
    const pendingMap = {};
    pendingAgg.forEach(a => { pendingMap[a.customerId] = a._sum.balance || 0; });

    const result = customers.map(c => ({
      ...c,
      pendingAmount: pendingMap[c.id] || 0,
    }));

    return success(res, 'Customers fetched successfully', result, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers/:id
 */
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!customer) {
      return error(res, 'Customer not found.', 404);
    }

    // Get first and last purchase dates
    const [firstPurchase, lastPurchase] = await Promise.all([
      prisma.sale.findFirst({
        where: { customerId: req.params.id },
        orderBy: { date: 'asc' },
        select: { date: true },
      }),
      prisma.sale.findFirst({
        where: { customerId: req.params.id },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
    ]);

    return success(res, 'Customer fetched successfully', {
      ...customer,
      firstPurchaseDate: firstPurchase?.date || null,
      lastPurchaseDate: lastPurchase?.date || null,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/customers/:id
 */
const updateCustomer = async (req, res, next) => {
  try {
    const existing = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Customer not found.', 404);
    }

    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.phone !== undefined) {
      // Check phone uniqueness
      if (req.body.phone !== existing.phone) {
        const phoneExists = await prisma.customer.findUnique({
          where: { phone: req.body.phone },
        });
        if (phoneExists) {
          return error(res, 'Phone number already in use by another customer.', 400);
        }
      }
      data.phone = req.body.phone;
    }
    if (req.body.age !== undefined) data.age = parseInt(req.body.age) || 0;
    if (req.body.address !== undefined) data.address = req.body.address || '';
    if (req.body.email !== undefined) data.email = req.body.email || null;
    if (req.body.bankName !== undefined) data.bankName = req.body.bankName || null;
    if (req.body.accountNo !== undefined) data.accountNo = req.body.accountNo || null;
    if (req.body.gstNo !== undefined) data.gstNo = req.body.gstNo || null;

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data,
    });

    return success(res, 'Customer updated successfully', customer);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/customers/:id
 */
const deleteCustomer = async (req, res, next) => {
  try {
    const existing = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { sales: { take: 1 } },
    });

    if (!existing) {
      return error(res, 'Customer not found.', 404);
    }

    if (existing.sales.length > 0) {
      return error(res, 'Cannot delete customer with sales history. Data integrity must be preserved.', 400);
    }

    await prisma.customer.delete({ where: { id: req.params.id } });

    return success(res, 'Customer deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/customers/:id/purchases?dateFrom&dateTo&page&limit
 */
const getPurchaseHistory = async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, phone: true, totalPurchases: true, totalSpent: true },
    });

    if (!customer) {
      return error(res, 'Customer not found.', 404);
    }

    const where = { customerId: req.params.id };

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              medicine: {
                select: { id: true, name: true, batchNo: true, genericName: true },
              },
            },
          },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return success(res, 'Purchase history fetched successfully', {
      customer,
      sales,
    }, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/customers/:id/payment
 * Collect payment from customer — distributes across oldest unpaid sales first
 */
const collectPayment = async (req, res, next) => {
  try {
    const { amount, paymentMode } = req.body;
    let remaining = parseFloat(amount);

    if (isNaN(remaining) || remaining <= 0) {
      return error(res, 'Invalid payment amount.', 400);
    }

    const pendingSales = await prisma.sale.findMany({
      where: {
        customerId: req.params.id,
        balance: { gt: 0 },
      },
      orderBy: { date: 'asc' },
    });

    if (pendingSales.length === 0) {
      return error(res, 'No pending balance for this customer.', 400);
    }

    const updates = [];
    for (const sale of pendingSales) {
      if (remaining <= 0) break;
      const paying = Math.min(remaining, sale.balance);
      const newPaid = sale.amountPaid + paying;
      const newBalance = Math.max(0, sale.grandTotal - newPaid);
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';
      updates.push(
        prisma.sale.update({
          where: { id: sale.id },
          data: {
            amountPaid: newPaid,
            balance: newBalance,
            paymentStatus: newStatus,
            ...(paymentMode ? { paymentMode: paymentMode.toUpperCase() } : {}),
          },
        })
      );
      remaining -= paying;
    }

    await prisma.$transaction(updates);

    return success(res, 'Payment collected successfully.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  getPurchaseHistory,
  collectPayment,
};
