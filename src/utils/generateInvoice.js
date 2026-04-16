/**
 * Generate invoice number: INV-YYYY-NNNN
 * Auto-increments based on existing sales count for the current year
 */

const prisma = require('../config/db');

const generateInvoiceNo = async () => {
  const year = new Date().getFullYear();
  const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
  const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const count = await prisma.sale.count({
    where: {
      createdAt: {
        gte: yearStart,
        lt: yearEnd,
      },
    },
  });

  const nextNum = String(count + 1).padStart(4, '0');
  return `INV-${year}-${nextNum}`;
};

module.exports = { generateInvoiceNo };
