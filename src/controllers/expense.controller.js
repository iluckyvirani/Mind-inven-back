const prisma = require('../config/db');
const { success, error, created } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');
const { EXPENSE_CATEGORIES } = require('../validators/expense.validator');

/**
 * GET /api/expenses?search&category&dateFrom&dateTo&paymentMode&page&limit
 */
const getExpenses = async (req, res, next) => {
  try {
    const { search, category, dateFrom, dateTo, paymentMode } = req.query;
    const { skip, take, page, limit } = getPagination(req.query);

    const where = {};

    if (search) {
      where.title = { contains: search, mode: 'insensitive' };
    }

    if (category) {
      where.category = category;
    }

    if (paymentMode) {
      where.paymentMode = paymentMode;
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

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
      }),
      prisma.expense.count({ where }),
    ]);

    return success(res, 'Expenses fetched successfully', expenses, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/expenses
 */
const createExpense = async (req, res, next) => {
  try {
    const {
      title, amount, category, date, paymentMode,
      isRecurring, recurringPeriod, note, receiptUrl,
    } = req.body;

    const expense = await prisma.expense.create({
      data: {
        title,
        amount: parseFloat(amount),
        category,
        date: new Date(date),
        paymentMode,
        isRecurring: isRecurring || false,
        recurringPeriod: isRecurring ? recurringPeriod : null,
        note: note || null,
        receiptUrl: receiptUrl || null,
      },
    });

    return created(res, 'Expense created successfully', expense);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/expenses/:id
 */
const updateExpense = async (req, res, next) => {
  try {
    const existing = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Expense not found.', 404);
    }

    const data = {};
    const stringFields = ['title', 'category', 'paymentMode', 'note', 'receiptUrl'];

    for (const field of stringFields) {
      if (req.body[field] !== undefined) {
        data[field] = req.body[field] || null;
      }
    }

    // Don't null required fields
    if (data.title === null) delete data.title;
    if (data.category === null) delete data.category;
    if (data.paymentMode === null) delete data.paymentMode;

    if (req.body.amount !== undefined) data.amount = parseFloat(req.body.amount);
    if (req.body.date !== undefined) data.date = new Date(req.body.date);
    if (req.body.isRecurring !== undefined) {
      data.isRecurring = req.body.isRecurring;
      if (!req.body.isRecurring) data.recurringPeriod = null;
    }
    if (req.body.recurringPeriod !== undefined) data.recurringPeriod = req.body.recurringPeriod;

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data,
    });

    return success(res, 'Expense updated successfully', expense);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/expenses/:id
 */
const deleteExpense = async (req, res, next) => {
  try {
    const existing = await prisma.expense.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return error(res, 'Expense not found.', 404);
    }

    await prisma.expense.delete({ where: { id: req.params.id } });

    return success(res, 'Expense deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/expenses/categories
 */
const getCategories = async (req, res) => {
  return success(res, 'Expense categories fetched successfully', EXPENSE_CATEGORIES);
};

module.exports = {
  getExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
  getCategories,
};
