const prisma = require('../config/db');
const PDFDocument = require('pdfkit');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');
const { generateInvoiceNo } = require('../utils/generateInvoice');

/**
 * Helper: compute medicine status from stock & minStock
 */
const computeStatus = (stock, minStock) => {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= minStock) return 'LOW_STOCK';
  return 'IN_STOCK';
};

/**
 * POST /api/sales
 * Create sale with inline customer find/create, stock deduction, invoice generation
 */
const createSale = async (req, res, next) => {
  try {
    const { customerName, customerPhone, customerAge, customerAddress, items, paymentMode, amountPaid, notes, prescribedBy } = req.body;
    const paidAmount = parseFloat(amountPaid) || 0;

    // 1. Validate all medicines exist and have sufficient stock
    const medicineIds = items.map((i) => i.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== medicineIds.length) {
      const foundIds = medicines.map((m) => m.id);
      const missing = medicineIds.filter((id) => !foundIds.includes(id));
      return error(res, `Medicine(s) not found: ${missing.join(', ')}`, 400);
    }

    // Check stock sufficiency
    const medicineMap = {};
    for (const med of medicines) {
      medicineMap[med.id] = med;
    }

    for (const item of items) {
      const med = medicineMap[item.medicineId];
      if (med.stock < item.quantity) {
        return error(
          res,
          `Insufficient stock for "${med.name}". Available: ${med.stock}, Requested: ${item.quantity}`,
          400
        );
      }
    }

    // 2. Calculate totals (including per-item GST)
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    const saleItems = items.map((item) => {
      const med = medicineMap[item.medicineId];
      const qty = parseInt(item.quantity);
      const price = parseFloat(item.unitPrice);
      const discountPct = parseFloat(item.discount) || 0;
      // Use gstPercent from request payload, fallback to medicine record
      const gstPct = parseFloat(item.gstPercent) || med.gstPercent || 0;
      const lineTotal = qty * price;
      const discountAmount = (lineTotal * discountPct) / 100;
      const afterDiscount = lineTotal - discountAmount;
      const gstAmount = afterDiscount * gstPct / 100;
      const amount = afterDiscount + gstAmount;

      subtotal += lineTotal;
      totalDiscount += discountAmount;
      totalTax += gstAmount;

      return {
        medicineId: item.medicineId,
        quantity: qty,
        unitPrice: price,
        discount: discountPct,
        amount,
      };
    });

    const grandTotal = subtotal - totalDiscount + totalTax;
    const balance = Math.max(0, grandTotal - paidAmount);
    let paymentStatus = 'PENDING';
    if (paidAmount >= grandTotal) paymentStatus = 'PAID';
    else if (paidAmount > 0) paymentStatus = 'PARTIAL';

    // 3. Generate invoice number
    const invoiceNo = await generateInvoiceNo();

    // 4. Execute everything in a transaction (increased timeout for Neon DB)
    const txResult = await prisma.$transaction(async (tx) => {
      // a. Find or create customer
      let customer = await tx.customer.findUnique({
        where: { phone: customerPhone },
      });

      let isNewCustomer = false;
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            name: customerName,
            phone: customerPhone,
            age: customerAge ? parseInt(customerAge) : null,
            address: customerAddress || null,
          },
        });
        isNewCustomer = true;
      }

      // b. Create sale
      const sale = await tx.sale.create({
        data: {
          invoiceNo,
          customerId: customer.id,
          createdById: req.user.id,
          subtotal,
          discount: totalDiscount,
          tax: totalTax,
          grandTotal,
          amountPaid: paidAmount,
          balance,
          paymentMode,
          paymentStatus,
          prescribedby: prescribedBy || null,
          notes: notes || null,
        },
      });

      // c. Create sale items
      await tx.saleItem.createMany({
        data: saleItems.map((item) => ({
          saleId: sale.id,
          ...item,
        })),
      });

      // d. Deduct stock + create stock logs for each medicine
      for (const item of saleItems) {
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
            type: 'DEDUCT',
            quantity: item.quantity,
            batchNo: med.batchNo,
            note: `Sold ${item.quantity} units — Invoice: ${invoiceNo}`,
          },
        });
      }

      // e. Update customer stats
      await tx.customer.update({
        where: { id: customer.id },
        data: {
          totalPurchases: { increment: 1 },
          totalSpent: { increment: grandTotal },
        },
      });

      return { saleId: sale.id, isNewCustomer };
    }, { timeout: 15000 });

    // Fetch full sale outside transaction to avoid timeout
    const fullSale = await prisma.sale.findUnique({
      where: { id: txResult.saleId },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, batchNo: true, genericName: true },
            },
          },
        },
      },
    });

    const result = { ...fullSale, customer: { ...fullSale.customer, isNew: txResult.isNewCustomer } };

    return created(res, 'Sale created successfully', result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales?search&dateFrom&dateTo&status&paymentMode&sort&page&limit
 */
const getSales = async (req, res, next) => {
  try {
    const { search, dateFrom, dateTo, status, paymentMode, sort } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.OR = [
        { invoiceNo: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        where.date.lte = end;
      }
    }

    if (status) where.paymentStatus = status;
    if (paymentMode) where.paymentMode = paymentMode;

    // Sort
    let orderBy = { date: 'desc' };
    if (sort === 'date-asc') orderBy = { date: 'asc' };
    if (sort === 'amount-asc') orderBy = { grandTotal: 'asc' };
    if (sort === 'amount-desc') orderBy = { grandTotal: 'desc' };
    if (sort === 'invoice-asc') orderBy = { invoiceNo: 'asc' };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return success(res, 'Sales fetched successfully', sales, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/:id
 */
const getSaleById = async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, batchNo: true, genericName: true, category: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!sale) {
      return error(res, 'Sale not found.', 404);
    }

    return success(res, 'Sale fetched successfully', sale);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/:id/receipt
 * Same as getSaleById but includes shop settings for receipt formatting
 */
const getReceipt = async (req, res, next) => {
  try {
    const [sale, shopSettings] = await Promise.all([
      prisma.sale.findUnique({
        where: { id: req.params.id },
        include: {
          customer: true,
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
      prisma.shopSettings.findFirst(),
    ]);

    if (!sale) {
      return error(res, 'Sale not found.', 404);
    }

    return success(res, 'Receipt fetched successfully', {
      shop: shopSettings,
      sale,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/sales/:id/payment
 * Add payment amount, recalculate balance & status
 */
const updatePayment = async (req, res, next) => {
  try {
    const { amount, paymentMode } = req.body;
    const paymentAmount = parseFloat(amount);

    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
    });

    if (!sale) {
      return error(res, 'Sale not found.', 404);
    }

    if (sale.paymentStatus === 'PAID') {
      return error(res, 'Sale is already fully paid.', 400);
    }

    const newAmountPaid = sale.amountPaid + paymentAmount;
    const newBalance = Math.max(0, sale.grandTotal - newAmountPaid);
    let newStatus = 'PARTIAL';
    if (newAmountPaid >= sale.grandTotal) newStatus = 'PAID';

    const data = {
      amountPaid: newAmountPaid,
      balance: newBalance,
      paymentStatus: newStatus,
    };

    if (paymentMode) data.paymentMode = paymentMode;

    const updatedSale = await prisma.sale.update({
      where: { id: req.params.id },
      data,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    return success(res, `Payment of ₹${paymentAmount} recorded. ${newStatus === 'PAID' ? 'Sale fully paid.' : `Balance: ₹${newBalance}`}`, updatedSale);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/summary/:date
 * Daily summary — total sales, bill count, cash/card/upi breakdown, pending
 */
const getDailySummary = async (req, res, next) => {
  try {
    const dateStr = req.params.date; // YYYY-MM-DD
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    if (isNaN(dayStart.getTime())) {
      return error(res, 'Invalid date format. Use YYYY-MM-DD.', 400);
    }

    const dateFilter = { date: { gte: dayStart, lte: dayEnd } };

    const [sales, cashSales, cardSales, upiSales, pendingSales] = await Promise.all([
      prisma.sale.aggregate({
        where: dateFilter,
        _sum: { grandTotal: true, amountPaid: true, balance: true, discount: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { ...dateFilter, paymentMode: 'CASH' },
        _sum: { amountPaid: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { ...dateFilter, paymentMode: 'CARD' },
        _sum: { amountPaid: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { ...dateFilter, paymentMode: 'UPI' },
        _sum: { amountPaid: true },
        _count: true,
      }),
      prisma.sale.aggregate({
        where: { ...dateFilter, paymentStatus: { in: ['PENDING', 'PARTIAL'] } },
        _sum: { balance: true },
        _count: true,
      }),
    ]);

    return success(res, 'Daily summary fetched successfully', {
      date: dateStr,
      totalSales: sales._sum.grandTotal || 0,
      totalCollected: sales._sum.amountPaid || 0,
      totalDiscount: sales._sum.discount || 0,
      totalBalance: sales._sum.balance || 0,
      billCount: sales._count,
      breakdown: {
        cash: { count: cashSales._count, amount: cashSales._sum.amountPaid || 0 },
        card: { count: cardSales._count, amount: cardSales._sum.amountPaid || 0 },
        upi: { count: upiSales._count, amount: upiSales._sum.amountPaid || 0 },
      },
      pending: {
        count: pendingSales._count,
        amount: pendingSales._sum.balance || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/by-phone/:phone?page&limit
 */
const getSalesByPhone = async (req, res, next) => {
  try {
    const { phone } = req.params;
    const { skip, take, page, limit } = getPagination(req.query);

    const customer = await prisma.customer.findUnique({
      where: { phone },
      select: { id: true, name: true, phone: true, totalPurchases: true, totalSpent: true },
    });

    if (!customer) {
      return error(res, 'No customer found with this phone number.', 404);
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: customer.id },
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.sale.count({ where: { customerId: customer.id } }),
    ]);

    return success(res, 'Sales fetched successfully', {
      customer,
      sales,
    }, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/sales/:id
 * Update sale items, recalculate totals, cascade stock & customer stats
 */
const updateSale = async (req, res, next) => {
  try {
    const { items, paymentMode, amountPaid, notes, prescribedBy } = req.body;
    const paidAmount = parseFloat(amountPaid) || 0;

    // 1. Fetch existing sale with items
    const existingSale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });

    if (!existingSale) {
      return error(res, 'Sale not found.', 404);
    }

    // 2. Validate new medicines exist and have enough stock (considering restoration)
    const medicineIds = items.map((i) => i.medicineId);
    const medicines = await prisma.medicine.findMany({
      where: { id: { in: medicineIds } },
    });

    if (medicines.length !== medicineIds.length) {
      const foundIds = medicines.map((m) => m.id);
      const missing = medicineIds.filter((id) => !foundIds.includes(id));
      return error(res, `Medicine(s) not found: ${missing.join(', ')}`, 400);
    }

    const medicineMap = {};
    for (const med of medicines) {
      medicineMap[med.id] = med;
    }

    // Build old quantity map for stock restoration
    const oldQtyMap = {};
    for (const item of existingSale.items) {
      oldQtyMap[item.medicineId] = (oldQtyMap[item.medicineId] || 0) + item.quantity;
    }

    // Check stock: available = current stock + old deducted - new requested
    for (const item of items) {
      const med = medicineMap[item.medicineId];
      const restoredQty = oldQtyMap[item.medicineId] || 0;
      const available = med.stock + restoredQty;
      if (available < item.quantity) {
        return error(
          res,
          `Insufficient stock for "${med.name}". Available: ${available}, Requested: ${item.quantity}`,
          400
        );
      }
    }

    // 3. Calculate new totals
    let subtotal = 0;
    let totalDiscount = 0;
    const saleItems = items.map((item) => {
      const qty = parseInt(item.quantity);
      const price = parseFloat(item.unitPrice);
      const discountPct = parseFloat(item.discount) || 0;
      const lineTotal = qty * price;
      const discountAmount = (lineTotal * discountPct) / 100;
      const amount = lineTotal - discountAmount;

      subtotal += lineTotal;
      totalDiscount += discountAmount;

      return {
        medicineId: item.medicineId,
        quantity: qty,
        unitPrice: price,
        discount: discountPct,
        amount,
      };
    });

    const grandTotal = subtotal - totalDiscount;
    const balance = Math.max(0, grandTotal - paidAmount);
    let paymentStatus = 'PENDING';
    if (paidAmount >= grandTotal) paymentStatus = 'PAID';
    else if (paidAmount > 0) paymentStatus = 'PARTIAL';

    // 4. Execute in transaction
    await prisma.$transaction(async (tx) => {
      // a. Restore old stock for previously sold items
      for (const oldItem of existingSale.items) {
        const med = await tx.medicine.findUnique({ where: { id: oldItem.medicineId } });
        if (med) {
          const restoredStock = med.stock + oldItem.quantity;
          await tx.medicine.update({
            where: { id: oldItem.medicineId },
            data: {
              stock: restoredStock,
              status: computeStatus(restoredStock, med.minStock),
            },
          });
        }
      }

      // b. Delete old sale items
      await tx.saleItem.deleteMany({ where: { saleId: existingSale.id } });

      // c. Create new sale items
      await tx.saleItem.createMany({
        data: saleItems.map((item) => ({
          saleId: existingSale.id,
          ...item,
        })),
      });

      // d. Deduct new stock + create stock logs
      for (const item of saleItems) {
        const med = await tx.medicine.findUnique({ where: { id: item.medicineId } });
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
            type: 'ADJUSTMENT',
            quantity: item.quantity,
            batchNo: med.batchNo,
            note: `Sale updated — Invoice: ${existingSale.invoiceNo}`,
          },
        });
      }

      // e. Update sale totals
      const data = {
        subtotal,
        discount: totalDiscount,
        grandTotal,
        amountPaid: paidAmount,
        balance,
        paymentStatus,
      };
      if (paymentMode) data.paymentMode = paymentMode;
      if (notes !== undefined) data.notes = notes || null;
      if (prescribedBy !== undefined) data.prescribedby = prescribedBy || null;

      await tx.sale.update({
        where: { id: existingSale.id },
        data,
      });

      // f. Update customer stats (adjust by difference)
      const grandTotalDiff = grandTotal - existingSale.grandTotal;
      await tx.customer.update({
        where: { id: existingSale.customerId },
        data: {
          totalSpent: { increment: grandTotalDiff },
        },
      });
    }, { timeout: 15000 });

    // Fetch updated sale
    const updatedSale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        createdBy: { select: { id: true, name: true } },
        items: {
          include: {
            medicine: {
              select: { id: true, name: true, batchNo: true, genericName: true },
            },
          },
        },
      },
    });

    return success(res, 'Sale updated successfully', updatedSale);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/sales/:id
 * Delete sale, restore stock, decrement customer stats
 */
const deleteSale = async (req, res, next) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        saleReturns: { include: { items: true } },
      },
    });

    if (!sale) {
      return error(res, 'Sale not found.', 404);
    }

    // Build a map of already-returned quantities per medicine (stock was already restored on return)
    const returnedQtyMap = {};
    for (const ret of sale.saleReturns) {
      for (const ri of ret.items) {
        returnedQtyMap[ri.medicineId] = (returnedQtyMap[ri.medicineId] || 0) + ri.quantity;
      }
    }

    await prisma.$transaction(async (tx) => {
      // a. Restore net stock for each sold item (exclude quantities already returned)
      for (const item of sale.items) {
        const alreadyReturned = returnedQtyMap[item.medicineId] || 0;
        const netRestore = item.quantity - alreadyReturned;
        if (netRestore <= 0) continue;

        const med = await tx.medicine.findUnique({ where: { id: item.medicineId } });
        if (med) {
          const restoredStock = med.stock + netRestore;
          await tx.medicine.update({
            where: { id: item.medicineId },
            data: {
              stock: restoredStock,
              status: computeStatus(restoredStock, med.minStock),
            },
          });

          await tx.stockLog.create({
            data: {
              medicineId: item.medicineId,
              type: 'ADJUSTMENT',
              quantity: netRestore,
              batchNo: med.batchNo,
              note: `Sale deleted — Invoice: ${sale.invoiceNo}, stock restored`,
            },
          });
        }
      }

      // b. Decrement customer stats
      await tx.customer.update({
        where: { id: sale.customerId },
        data: {
          totalPurchases: { decrement: 1 },
          totalSpent: { decrement: sale.grandTotal },
        },
      });

      // c. Delete linked sale returns first (SaleReturnItems cascade via schema)
      if (sale.saleReturns.length > 0) {
        await tx.saleReturn.deleteMany({
          where: { saleId: sale.id },
        });
      }

      // d. Delete sale (cascade deletes SaleItems via Prisma schema)
      await tx.sale.delete({ where: { id: sale.id } });
    }, { timeout: 15000 });

    return success(res, 'Sale deleted successfully. Stock has been restored.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/sales/export/pdf?dateFrom&dateTo&status&paymentMode&search
 * Export sales as PDF
 */
const exportSalesPdf = async (req, res, next) => {
  try {
    const { dateFrom, dateTo, status, paymentMode, search } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { invoiceNo: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) {
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        where.date.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        where.date.lte = to;
      }
    }

    if (status) where.paymentStatus = status;
    if (paymentMode) where.paymentMode = paymentMode;

    const sales = await prisma.sale.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        customer: { select: { name: true, phone: true, address: true } },
        createdBy: { select: { name: true } },
        items: {
          include: { medicine: { select: { name: true } } },
        },
      },
    });

    if (sales.length === 0) {
      return error(res, 'No sales found for the given filters.', 404);
    }

    // ── PDF Helpers ──
    const formatDate = (date) =>
      new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const drawTableHeader = (doc, headers, colWidths, startX, y) => {
      doc.fontSize(8).font('Helvetica-Bold');
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18).fill('#f1f5f9');
      doc.fillColor('#334155');
      let x = startX;
      headers.forEach((h, i) => {
        doc.text(h, x + 4, y + 5, { width: colWidths[i] - 8, align: 'left' });
        x += colWidths[i];
      });
      return y + 18;
    };

    const drawTableRow = (doc, cells, colWidths, startX, y, isAlt) => {
      const rowHeight = 20;
      if (isAlt) {
        doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#f8fafc');
      }
      doc.fillColor('#1e293b').fontSize(7).font('Helvetica');
      let x = startX;
      cells.forEach((cell, i) => {
        doc.text(String(cell ?? ''), x + 4, y + 6, {
          width: colWidths[i] - 8,
          align: 'left',
          lineBreak: false,
        });
        x += colWidths[i];
      });
      return y + rowHeight;
    };

    // ── Create PDF ──
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Sales_Report_${dateFrom || 'all'}_${dateTo || 'all'}.pdf`
    );
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e293b');
    doc.text('Deemag 2000', { align: 'center' });

    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#475569');
    doc.text('42/4 B, Billochpura, Mathura Road, Agra-2', { align: 'center' });

    doc.moveDown(0.1);
    doc.fontSize(8).font('Helvetica').fillColor('#64748b');
    doc.text('Ph: 74090 00917', { align: 'center' });

    doc.moveDown(0.4);
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#475569');
    doc.text('Sales Report', { align: 'center' });
    doc.moveDown(0.3);

    if (dateFrom || dateTo) {
      doc.fontSize(9).fillColor('#64748b');
      const range = dateFrom && dateTo
        ? `${formatDate(dateFrom)} — ${formatDate(dateTo)}`
        : dateFrom
          ? `From: ${formatDate(dateFrom)}`
          : `To: ${formatDate(dateTo)}`;
      doc.text(`Date Range: ${range}`, { align: 'center' });
    } else {
      doc.fontSize(9).fillColor('#64748b');
      doc.text('All Records', { align: 'center' });
    }

    doc.moveDown(0.3);
    doc.fontSize(8).fillColor('#94a3b8');
    doc.text(`Generated on: ${formatDate(new Date())}`, { align: 'center' });
    doc.moveDown(1);

    // ── Summary ──
    const totalSales = sales.reduce((sum, s) => sum + s.grandTotal, 0);
    const totalPaid = sales.reduce((sum, s) => sum + s.amountPaid, 0);
    const totalBalance = sales.reduce((sum, s) => sum + s.balance, 0);
    const paidCount = sales.filter((s) => s.paymentStatus === 'PAID').length;
    const pendingCount = sales.filter((s) => s.paymentStatus === 'PENDING').length;
    const partialCount = sales.filter((s) => s.paymentStatus === 'PARTIAL').length;

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155');
    doc.text(
      `Total Bills: ${sales.length}  |  Paid: ${paidCount}  |  Partial: ${partialCount}  |  Pending: ${pendingCount}  |  Total: ₹${totalSales.toLocaleString('en-IN')}  |  Received: ₹${totalPaid.toLocaleString('en-IN')}  |  Balance: ₹${totalBalance.toLocaleString('en-IN')}`,
      { align: 'center' }
    );
    doc.moveDown(0.8);

    // ── Table ──
    const headers = ['#', 'Invoice', 'Date', 'Customer', 'Phone', 'Address', 'Items', 'Subtotal', 'Discount', 'Grand Total', 'Paid', 'Balance', 'Mode', 'Status', 'Billed By'];
    const colWidths = [20, 55, 55, 65, 60, 70, 30, 50, 40, 55, 50, 45, 38, 45, 54];
    const startX = 30;
    let y = doc.y;

    y = drawTableHeader(doc, headers, colWidths, startX, y);

    sales.forEach((sale, idx) => {
      if (y > 520) {
        doc.addPage({ size: 'A4', layout: 'landscape', margin: 30 });
        y = 30;
        y = drawTableHeader(doc, headers, colWidths, startX, y);
      }

      const totalItems = sale.items.reduce((sum, item) => sum + item.quantity, 0);

      const cells = [
        idx + 1,
        sale.invoiceNo,
        formatDate(sale.date),
        sale.customer?.name || '',
        sale.customer?.phone || '',
        sale.customer?.address || '',
        totalItems,
        `₹${sale.subtotal.toLocaleString('en-IN')}`,
        `₹${sale.discount.toLocaleString('en-IN')}`,
        `₹${sale.grandTotal.toLocaleString('en-IN')}`,
        `₹${sale.amountPaid.toLocaleString('en-IN')}`,
        `₹${sale.balance.toLocaleString('en-IN')}`,
        sale.paymentMode,
        sale.paymentStatus,
        sale.createdBy?.name || '',
      ];

      y = drawTableRow(doc, cells, colWidths, startX, y, idx % 2 === 1);
    });

    doc.end();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createSale,
  getSales,
  getSaleById,
  getReceipt,
  updatePayment,
  updateSale,
  deleteSale,
  getDailySummary,
  getSalesByPhone,
  exportSalesPdf,
};
