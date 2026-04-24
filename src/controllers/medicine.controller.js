const prisma = require('../config/db');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

/**
 * Helper: compute medicine status from stock & minStock
 */
const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
};

/**
 * GET /api/pharmacy/medicines?search&category&status&page&limit
 */
const getMedicines = async (req, res, next) => {
  try {
    const { search, category, status, sort } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { genericName: { contains: search, mode: 'insensitive' } },
        { batchNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.categoryId = category;
    }

    if (status) {
      where.status = status;
    }

    // Sort
    let orderBy = { createdAt: 'desc' };
    if (sort === 'name-asc') orderBy = { name: 'asc' };
    if (sort === 'name-desc') orderBy = { name: 'desc' };
    if (sort === 'stock-asc') orderBy = { stock: 'asc' };
    if (sort === 'stock-desc') orderBy = { stock: 'desc' };
    if (sort === 'price-asc') orderBy = { sellingPrice: 'asc' };
    if (sort === 'price-desc') orderBy = { sellingPrice: 'desc' };
    if (sort === 'expiry-asc') orderBy = { expiryDate: 'asc' };

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
      prisma.medicine.count({ where }),
    ]);

    return success(res, 'Medicines fetched successfully', medicines, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/medicines/:id
 */
const getMedicineById = async (req, res, next) => {
  try {
    const medicine = await prisma.medicine.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        stockLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!medicine) {
      return error(res, 'Medicine not found.', 404);
    }

    return success(res, 'Medicine fetched successfully', medicine);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/pharmacy/medicines
 */
const addMedicine = async (req, res, next) => {
  try {
    const {
      name, genericName, categoryId, batchNo, barcode,
      supplierId, stock, minStock, unitPrice, sellingPrice,
      expiryDate, manufacturer, description,
      form, mrp, rackNo, hsnCode, gstPercent,
    } = req.body;

    const stockVal = parseInt(stock) || 0;
    const minStockVal = parseInt(minStock) || 10;

    // Auto-generate medicineCode
    const lastMed = await prisma.medicine.findFirst({
      where: { medicineCode: { not: null } },
      orderBy: { medicineCode: 'desc' },
      select: { medicineCode: true },
    });
    let nextCode = 'MED-001';
    if (lastMed && lastMed.medicineCode) {
      const num = parseInt(lastMed.medicineCode.replace('MED-', '')) || 0;
      nextCode = `MED-${String(num + 1).padStart(3, '0')}`;
    }

    const medicine = await prisma.medicine.create({
      data: {
        medicineCode: nextCode,
        name,
        genericName: genericName || null,
        categoryId,
        batchNo,
        barcode: barcode || null,
        supplierId: supplierId || null,
        stock: stockVal,
        minStock: minStockVal,
        unitPrice: parseFloat(unitPrice),
        sellingPrice: parseFloat(sellingPrice),
        mrp: mrp !== undefined ? parseFloat(mrp) : null,
        expiryDate: new Date(expiryDate),
        manufacturer: manufacturer || null,
        description: description || null,
        form: form || null,
        rackNo: rackNo || null,
        hsnCode: hsnCode || null,
        gstPercent: gstPercent !== undefined ? parseFloat(gstPercent) : 0,
        status: computeStatus(stockVal, minStockVal),
      },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    // Create initial stock log
    if (stockVal > 0) {
      await prisma.stockLog.create({
        data: {
          medicineId: medicine.id,
          type: 'ADD',
          quantity: stockVal,
          batchNo,
          note: 'Initial stock on medicine creation',
        },
      });
    }

    // Update supplier totalPurchase and lastPurchaseDate (include GST)
    if (supplierId && stockVal > 0) {
      const gst = gstPercent !== undefined ? parseFloat(gstPercent) : 0;
      const subtotal = stockVal * parseFloat(unitPrice);
      const purchaseAmount = subtotal * (1 + gst / 100);
      await prisma.supplier.update({
        where: { id: supplierId },
        data: {
          totalPurchase: { increment: purchaseAmount },
          lastPurchaseDate: new Date(),
        },
      });
    }

    return created(res, 'Medicine added successfully', medicine);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/pharmacy/medicines/:id
 */
const updateMedicine = async (req, res, next) => {
  try {
    const existing = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Medicine not found.', 404);
    }

    const data = {};
    const fields = [
      'name', 'genericName', 'categoryId', 'batchNo', 'barcode',
      'supplierId', 'manufacturer', 'description',
      'form', 'rackNo', 'hsnCode',
    ];

    for (const field of fields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field] || null;
      }
    }

    if (req.body.stock !== undefined) data.stock = parseInt(req.body.stock);
    if (req.body.minStock !== undefined) data.minStock = parseInt(req.body.minStock);
    if (req.body.unitPrice !== undefined) data.unitPrice = parseFloat(req.body.unitPrice);
    if (req.body.sellingPrice !== undefined) data.sellingPrice = parseFloat(req.body.sellingPrice);
    if (req.body.mrp !== undefined) data.mrp = req.body.mrp !== null ? parseFloat(req.body.mrp) : null;
    if (req.body.gstPercent !== undefined) data.gstPercent = parseFloat(req.body.gstPercent);
    if (req.body.expiryDate !== undefined) data.expiryDate = new Date(req.body.expiryDate);

    // Recompute status
    const finalStock = data.stock !== undefined ? data.stock : existing.stock;
    const finalMinStock = data.minStock !== undefined ? data.minStock : existing.minStock;
    data.status = computeStatus(finalStock, finalMinStock);

    const medicine = await prisma.medicine.update({
      where: { id: req.params.id },
      data,
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return success(res, 'Medicine updated successfully', medicine);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/pharmacy/medicines/:id
 */
const deleteMedicine = async (req, res, next) => {
  try {
    const existing = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Medicine not found.', 404);
    }

    const medicineId = req.params.id;

    await prisma.$transaction(async (tx) => {
      // 1. Delete supplier return items referencing this medicine
      await tx.supplierReturnItem.deleteMany({ where: { medicineId } });

      // 2. Delete sale return items referencing this medicine
      await tx.saleReturnItem.deleteMany({ where: { medicineId } });

      // 3. Delete sale items referencing this medicine
      await tx.saleItem.deleteMany({ where: { medicineId } });

      // 4. Delete stock logs
      await tx.stockLog.deleteMany({ where: { medicineId } });

      // 5. Delete the medicine itself
      await tx.medicine.delete({ where: { id: medicineId } });
    });

    return success(res, 'Medicine and all related records deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/pharmacy/medicines/:id/stock
 */
const addStock = async (req, res, next) => {
  try {
    const { quantity, batchNo, note } = req.body;
    const qty = parseInt(quantity);

    const medicine = await prisma.medicine.findUnique({
      where: { id: req.params.id },
    });

    if (!medicine) {
      return error(res, 'Medicine not found.', 404);
    }

    const newStock = medicine.stock + qty;

    // Update stock + status + create log in a transaction
    const [updatedMedicine, stockLog] = await prisma.$transaction([
      prisma.medicine.update({
        where: { id: req.params.id },
        data: {
          stock: newStock,
          batchNo: batchNo || medicine.batchNo,
          status: computeStatus(newStock, medicine.minStock),
        },
        include: {
          category: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
      prisma.stockLog.create({
        data: {
          medicineId: req.params.id,
          type: 'ADD',
          quantity: qty,
          batchNo: batchNo || medicine.batchNo,
          note: note || `Added ${qty} units`,
        },
      }),
    ]);

    // Update supplier totalPurchase and lastPurchaseDate (include GST)
    if (medicine.supplierId && qty > 0) {
      const subtotal = qty * medicine.unitPrice;
      const purchaseAmount = subtotal * (1 + (medicine.gstPercent || 0) / 100);
      await prisma.supplier.update({
        where: { id: medicine.supplierId },
        data: {
          totalPurchase: { increment: purchaseAmount },
          lastPurchaseDate: new Date(),
        },
      });
    }

    return success(res, `${qty} units added successfully. New stock: ${newStock}`, updatedMedicine);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/categories
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });

    return success(res, 'Categories fetched successfully', categories);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/medicines/expiring?days=30
 */
const getExpiringMedicines = async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(now.getDate() + days);

    const medicines = await prisma.medicine.findMany({
      where: {
        expiryDate: {
          gte: now,
          lte: futureDate,
        },
        stock: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return success(res, 'Expiring medicines fetched successfully', medicines);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/medicines/low-stock
 */
const getLowStockMedicines = async (req, res, next) => {
  try {
    const medicines = await prisma.medicine.findMany({
      where: {
        OR: [
          { status: 'LOW_STOCK' },
          { status: 'OUT_OF_STOCK' },
        ],
      },
      orderBy: { stock: 'asc' },
      include: {
        category: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });

    return success(res, 'Low stock medicines fetched successfully', medicines);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMedicines,
  getMedicineById,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  addStock,
  getCategories,
  getExpiringMedicines,
  getLowStockMedicines,
};
