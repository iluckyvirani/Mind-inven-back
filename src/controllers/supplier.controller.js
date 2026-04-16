const prisma = require('../config/db');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

/**
 * GET /api/pharmacy/suppliers?search&status&page&limit
 */
const getSuppliers = async (req, res, next) => {
  try {
    const { search, status } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactPerson: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { medicines: true, payments: true } },
        },
      }),
      prisma.supplier.count({ where }),
    ]);

    // Add balance field
    const data = suppliers.map((s) => ({
      ...s,
      balance: s.totalPurchase - s.totalPaid,
    }));

    return success(res, 'Suppliers fetched successfully', data, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/suppliers/:id
 */
const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        medicines: {
          select: {
            id: true,
            name: true,
            batchNo: true,
            stock: true,
            status: true,
            sellingPrice: true,
          },
          orderBy: { name: 'asc' },
        },
        payments: {
          orderBy: { date: 'desc' },
          take: 50,
        },
        _count: { select: { medicines: true, payments: true } },
      },
    });

    if (!supplier) {
      return error(res, 'Supplier not found.', 404);
    }

    return success(res, 'Supplier fetched successfully', {
      ...supplier,
      balance: supplier.totalPurchase - supplier.totalPaid,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/pharmacy/suppliers
 */
const addSupplier = async (req, res, next) => {
  try {
    const {
      name, contactPerson, phone, email, address,
      bankName, accountNo, ifscCode, gstNo, panNo,
    } = req.body;

    // Auto-generate supplierCode
    const lastSup = await prisma.supplier.findFirst({
      where: { supplierCode: { not: null } },
      orderBy: { supplierCode: 'desc' },
      select: { supplierCode: true },
    });
    let nextCode = 'SUP-001';
    if (lastSup && lastSup.supplierCode) {
      const num = parseInt(lastSup.supplierCode.replace('SUP-', '')) || 0;
      nextCode = `SUP-${String(num + 1).padStart(3, '0')}`;
    }

    const supplier = await prisma.supplier.create({
      data: {
        supplierCode: nextCode,
        name,
        contactPerson: contactPerson || null,
        phone,
        email: email || null,
        address: address || null,
        bankName: bankName || null,
        accountNo: accountNo || null,
        ifscCode: ifscCode || null,
        gstNo: gstNo || null,
        panNo: panNo || null,
      },
    });

    return created(res, 'Supplier added successfully', supplier);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/pharmacy/suppliers/:id
 */
const updateSupplier = async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Supplier not found.', 404);
    }

    const data = {};
    const fields = [
      'name', 'contactPerson', 'phone', 'email', 'address',
      'bankName', 'accountNo', 'ifscCode', 'gstNo', 'panNo', 'status',
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field] || null;
      }
    }

    // Don't null-ify required fields
    if (data.name === null) delete data.name;
    if (data.phone === null) delete data.phone;
    if (data.status === null) delete data.status;

    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data,
    });

    return success(res, 'Supplier updated successfully', {
      ...supplier,
      balance: supplier.totalPurchase - supplier.totalPaid,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/pharmacy/suppliers/:id
 */
const deleteSupplier = async (req, res, next) => {
  try {
    const existing = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      include: {
        medicines: { take: 1 },
        payments: { take: 1 },
      },
    });

    if (!existing) {
      return error(res, 'Supplier not found.', 404);
    }

    if (existing.medicines.length > 0) {
      return error(res, 'Cannot delete supplier linked to medicines. Remove medicine associations first.', 400);
    }

    if (existing.payments.length > 0) {
      return error(res, 'Cannot delete supplier with payment records.', 400);
    }

    await prisma.supplier.delete({ where: { id: req.params.id } });

    return success(res, 'Supplier deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/pharmacy/suppliers/:id/payment
 */
const addPayment = async (req, res, next) => {
  try {
    const { amount, paymentMode, note, date } = req.body;
    const paymentAmount = parseFloat(amount);

    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
    });

    if (!supplier) {
      return error(res, 'Supplier not found.', 404);
    }

    // Transaction: create payment + update supplier totalPaid
    const [payment, updatedSupplier] = await prisma.$transaction([
      prisma.supplierPayment.create({
        data: {
          supplierId: req.params.id,
          amount: paymentAmount,
          paymentMode,
          note: note || null,
          date: date ? new Date(date) : new Date(),
        },
      }),
      prisma.supplier.update({
        where: { id: req.params.id },
        data: {
          totalPaid: { increment: paymentAmount },
        },
      }),
    ]);

    return created(res, 'Payment recorded successfully', {
      payment,
      supplier: {
        id: updatedSupplier.id,
        name: updatedSupplier.name,
        totalPurchase: updatedSupplier.totalPurchase,
        totalPaid: updatedSupplier.totalPaid,
        balance: updatedSupplier.totalPurchase - updatedSupplier.totalPaid,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/suppliers/:id/payments
 */
const getPayments = async (req, res, next) => {
  try {
    const { skip, take, page, limit } = getPagination(req.query);

    const supplier = await prisma.supplier.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, totalPurchase: true, totalPaid: true },
    });

    if (!supplier) {
      return error(res, 'Supplier not found.', 404);
    }

    const [payments, total] = await Promise.all([
      prisma.supplierPayment.findMany({
        where: { supplierId: req.params.id },
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      prisma.supplierPayment.count({ where: { supplierId: req.params.id } }),
    ]);

    return success(res, 'Payments fetched successfully', {
      supplier: {
        ...supplier,
        balance: supplier.totalPurchase - supplier.totalPaid,
      },
      payments,
    }, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  addSupplier,
  updateSupplier,
  deleteSupplier,
  addPayment,
  getPayments,
};
