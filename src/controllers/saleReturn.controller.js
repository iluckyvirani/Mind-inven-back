const prisma = require('../config/db');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
};

/**
 * Generate return number: SR-0001, SR-0002, ...
 */
const generateReturnNo = async () => {
  const last = await prisma.saleReturn.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { returnNo: true },
  });
  let next = 1;
  if (last && last.returnNo) {
    const num = parseInt(last.returnNo.replace('SR-', '')) || 0;
    next = num + 1;
  }
  return `SR-${String(next).padStart(4, '0')}`;
};

/**
 * POST /api/sales/:saleId/return
 * Process a sale return — add items back to stock, update customer stats, create ledger entry
 */
const createSaleReturn = async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const { items, reason } = req.body;

    // 1. Fetch the sale with its items
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: { include: { medicine: true } },
        customer: true,
      },
    });

    if (!sale) {
      return error(res, 'Sale not found.', 404);
    }

    // 2. Fetch previous returns for this sale to calculate already-returned quantities
    const previousReturns = await prisma.saleReturn.findMany({
      where: { saleId },
      include: { items: true },
    });

    const alreadyReturnedMap = {};
    for (const ret of previousReturns) {
      for (const ri of ret.items) {
        alreadyReturnedMap[ri.medicineId] = (alreadyReturnedMap[ri.medicineId] || 0) + ri.quantity;
      }
    }

    // 3. Build a map of sale items for validation
    const saleItemMap = {};
    for (const si of sale.items) {
      saleItemMap[si.medicineId] = si;
    }

    // 4. Validate return items against remaining returnable qty
    let totalReturnAmount = 0;
    const returnItems = [];

    for (const item of items) {
      const saleItem = saleItemMap[item.medicineId];
      if (!saleItem) {
        return error(res, `Medicine ${item.medicineId} was not part of this sale.`, 400);
      }
      const alreadyReturned = alreadyReturnedMap[item.medicineId] || 0;
      const remainingQty = saleItem.quantity - alreadyReturned;
      if (remainingQty <= 0) {
        return error(
          res,
          `All units of "${saleItem.medicine.name}" have already been returned.`,
          400
        );
      }
      if (item.quantity < 1 || item.quantity > remainingQty) {
        return error(
          res,
          `Return quantity for "${saleItem.medicine.name}" must be between 1 and ${remainingQty} (${alreadyReturned} already returned).`,
          400
        );
      }

      const unitPrice = saleItem.unitPrice;
      const discountPct = saleItem.discount || 0;
      const lineTotal = item.quantity * unitPrice;
      const discountAmount = (lineTotal * discountPct) / 100;
      const amount = lineTotal - discountAmount;

      totalReturnAmount += amount;
      returnItems.push({
        medicineId: item.medicineId,
        quantity: item.quantity,
        unitPrice,
        amount,
      });
    }

    // 5. Generate return number
    const returnNo = await generateReturnNo();

    // 6. Execute in transaction
    const saleReturn = await prisma.$transaction(async (tx) => {
      // a. Create sale return record
      const sr = await tx.saleReturn.create({
        data: {
          returnNo,
          saleId: sale.id,
          customerId: sale.customerId,
          totalAmount: totalReturnAmount,
          reason: reason || null,
        },
      });

      // b. Create return items
      await tx.saleReturnItem.createMany({
        data: returnItems.map((item) => ({
          saleReturnId: sr.id,
          ...item,
        })),
      });

      // c. Add stock back for each returned medicine + create stock logs
      for (const item of returnItems) {
        const med = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        const newStock = med.stock + item.quantity;

        await tx.medicine.update({
          where: { id: item.medicineId },
          data: {
            stock: newStock,
            status: computeStatus(newStock, med.minStock),
          },
        });

        await tx.stockLog.create({
          data: {
            medicineId: item.medicineId,
            type: 'SALE_RETURN',
            quantity: item.quantity,
            batchNo: med.batchNo,
            note: `Sale return ${returnNo} — ${item.quantity} units returned from Invoice ${sale.invoiceNo}`,
          },
        });
      }

      // d. Update sale totals
      const newGrandTotal = sale.grandTotal - totalReturnAmount;
      const newBalance = Math.max(0, newGrandTotal - sale.amountPaid);
      let newStatus = 'PENDING';
      if (sale.amountPaid >= newGrandTotal) newStatus = 'PAID';
      else if (sale.amountPaid > 0) newStatus = 'PARTIAL';

      await tx.sale.update({
        where: { id: sale.id },
        data: {
          grandTotal: newGrandTotal,
          subtotal: sale.subtotal - totalReturnAmount,
          balance: newBalance,
          paymentStatus: newStatus,
        },
      });

      // e. Update customer stats
      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          totalSpent: { decrement: totalReturnAmount },
        },
      });

      return sr;
    }, { timeout: 15000 });

    // Fetch full return
    const fullReturn = await prisma.saleReturn.findUnique({
      where: { id: saleReturn.id },
      include: {
        sale: { select: { invoiceNo: true } },
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true, batchNo: true } },
          },
        },
      },
    });

    return created(res, 'Sale return processed successfully. Stock has been restored.', fullReturn);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/:saleId/returns
 * Get all returns for a specific sale
 */
const getSaleReturns = async (req, res, next) => {
  try {
    const saleId = req.params.id;

    const returns = await prisma.saleReturn.findMany({
      where: { saleId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            medicine: { select: { id: true, name: true, batchNo: true } },
          },
        },
      },
    });

    return success(res, 'Sale returns fetched successfully', returns);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sale-returns?search&customerId&dateFrom&dateTo&page&limit
 * List all sale returns
 */
const getAllSaleReturns = async (req, res, next) => {
  try {
    const { search, customerId, dateFrom, dateTo } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.OR = [
        { returnNo: { contains: search, mode: 'insensitive' } },
        { sale: { invoiceNo: { contains: search, mode: 'insensitive' } } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (customerId) where.customerId = customerId;

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    const [returns, total] = await Promise.all([
      prisma.saleReturn.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          sale: { select: { invoiceNo: true } },
          customer: { select: { id: true, name: true, phone: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.saleReturn.count({ where }),
    ]);

    return success(res, 'Sale returns fetched successfully', returns, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSaleReturn,
  getSaleReturns,
  getAllSaleReturns,
};
