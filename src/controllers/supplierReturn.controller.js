const prisma = require('../config/db');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
};

/**
 * Generate return number: PR-0001, PR-0002, ...
 */
const generateReturnNo = async () => {
  const last = await prisma.supplierReturn.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { returnNo: true },
  });
  let next = 1;
  if (last && last.returnNo) {
    const num = parseInt(last.returnNo.replace('PR-', '')) || 0;
    next = num + 1;
  }
  return `PR-${String(next).padStart(4, '0')}`;
};

/**
 * POST /api/pharmacy/suppliers/:supplierId/return
 * Return medicines to supplier — deduct stock, update supplier totalPurchase
 */
const createSupplierReturn = async (req, res, next) => {
  try {
    const supplierId = req.params.id;
    const { items, reason } = req.body;

    // 1. Validate supplier exists
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    if (!supplier) {
      return error(res, 'Supplier not found.', 404);
    }

    // 2. Validate medicines belong to this supplier and have sufficient stock
    const medicineIds = items.map((i) => i.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds }, supplierId },
    });

    if (medicines.length !== medicineIds.length) {
      const foundIds = medicines.map((m) => m.id);
      const missing = medicineIds.filter((id) => !foundIds.includes(id));
      return error(res, `Medicine(s) not found or not linked to this supplier: ${missing.join(', ')}`, 400);
    }

    const medicineMap = {};
    for (const med of medicines) {
      medicineMap[med.id] = med;
    }

    let totalReturnAmount = 0;
    const returnItems = [];

    for (const item of items) {
      const med = medicineMap[item.medicineId];
      if (item.quantity < 1) {
        return error(res, `Return quantity for "${med.name}" must be at least 1.`, 400);
      }
      if (item.quantity > med.stock) {
        return error(
          res,
          `Insufficient stock for "${med.name}". Available: ${med.stock}, Return requested: ${item.quantity}`,
          400
        );
      }

      const unitPrice = med.unitPrice; // cost price
      const amount = item.quantity * unitPrice;
      totalReturnAmount += amount;

      returnItems.push({
        medicineId: item.medicineId,
        quantity: item.quantity,
        unitPrice,
        amount,
      });
    }

    // 3. Generate return number
    const returnNo = await generateReturnNo();

    // 4. Execute in transaction
    const supplierReturn = await prisma.$transaction(async (tx) => {
      // a. Create supplier return record
      const sr = await tx.supplierReturn.create({
        data: {
          returnNo,
          supplierId,
          totalAmount: totalReturnAmount,
          reason: reason || null,
        },
      });

      // b. Create return items
      await tx.supplierReturnItem.createMany({
        data: returnItems.map((item) => ({
          supplierReturnId: sr.id,
          ...item,
        })),
      });

      // c. Deduct stock for each returned medicine + create stock logs
      for (const item of returnItems) {
        const med = medicineMap[item.medicineId];
        const newStock = med.stock - item.quantity;

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
            type: 'SUPPLIER_RETURN',
            quantity: item.quantity,
            batchNo: med.batchNo,
            note: `Supplier return ${returnNo} — ${item.quantity} units returned to ${supplier.name}`,
          },
        });
      }

      // d. Update supplier totalPurchase (reduce by return amount)
      await tx.supplier.update({
        where: { id: supplierId },
        data: {
          totalPurchase: { decrement: totalReturnAmount },
        },
      });

      return sr;
    }, { timeout: 15000 });

    // Fetch full return
    const fullReturn = await prisma.supplierReturn.findUnique({
      where: { id: supplierReturn.id },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        items: {
          include: {
            medicine: { select: { id: true, name: true, batchNo: true } },
          },
        },
      },
    });

    return created(res, 'Supplier return processed successfully. Stock has been deducted.', fullReturn);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/pharmacy/suppliers/:supplierId/returns
 * Get all returns for a specific supplier
 */
const getSupplierReturns = async (req, res, next) => {
  try {
    const supplierId = req.params.id;

    const returns = await prisma.supplierReturn.findMany({
      where: { supplierId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: {
            medicine: { select: { id: true, name: true, batchNo: true } },
          },
        },
      },
    });

    return success(res, 'Supplier returns fetched successfully', returns);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSupplierReturn,
  getSupplierReturns,
};
