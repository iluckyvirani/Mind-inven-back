const prisma = require('../config/db');
const bcrypt = require('bcryptjs');
const { success, error } = require('../utils/apiResponse');
const { getPagination, getPaginationMeta } = require('../utils/pagination');

// =============================================
// SHOP SETTINGS
// =============================================

/**
 * GET /api/settings/shop
 */
const getShop = async (req, res, next) => {
  try {
    let shop = await prisma.shopSettings.findFirst();

    // Create default if not exists
    if (!shop) {
      shop = await prisma.shopSettings.create({ data: {} });
    }

    return success(res, 'Shop settings fetched successfully', shop);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/settings/shop
 */
const updateShop = async (req, res, next) => {
  try {
    let shop = await prisma.shopSettings.findFirst();

    if (!shop) {
      shop = await prisma.shopSettings.create({ data: {} });
    }

    const {
      name, address, city, state, pincode,
      phone, mobile, email, website, gstin, licenseNo,
      tagline, printHeader, printFooter, logoUrl, taxRate,
    } = req.body;

    const updated = await prisma.shopSettings.update({
      where: { id: shop.id },
      data: {
        ...(name !== undefined && { name }),
        ...(tagline !== undefined && { tagline }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(pincode !== undefined && { pincode }),
        ...(phone !== undefined && { phone }),
        ...(mobile !== undefined && { mobile }),
        ...(email !== undefined && { email }),
        ...(website !== undefined && { website }),
        ...(gstin !== undefined && { gstin }),
        ...(licenseNo !== undefined && { licenseNo }),
        ...(printHeader !== undefined && { printHeader }),
        ...(printFooter !== undefined && { printFooter }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(taxRate !== undefined && { taxRate: parseFloat(taxRate) }),
      },
    });

    return success(res, 'Shop settings updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

// =============================================
// TEAM MANAGEMENT
// =============================================

/**
 * GET /api/settings/team?page&limit
 */
const getTeam = async (req, res, next) => {
  try {
    const { skip, take, page, limit } = getPagination(req.query);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          status: true,
          lastLogin: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count(),
    ]);

    return success(res, 'Team members fetched successfully', users, 200, getPaginationMeta(total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/settings/team
 */
const addTeamMember = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return error(res, 'A user with this email already exists.', 409);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, phone, password: hashedPassword, role },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    return success(res, 'Team member added successfully', user, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/settings/team/:id
 */
const updateTeamMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, phone, password, role, status } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return error(res, 'Team member not found.', 404);
    }

    // Check email uniqueness if changing email
    if (email && email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return error(res, 'A user with this email already exists.', 409);
      }
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (phone !== undefined) data.phone = phone;
    if (role !== undefined) data.role = role;
    if (status !== undefined) data.status = status;
    if (password) data.password = await bcrypt.hash(password, 10);

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return success(res, 'Team member updated successfully', updated);
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/settings/team/:id
 */
const deleteTeamMember = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Cannot delete self
    if (id === req.user.id) {
      return error(res, 'You cannot delete your own account.', 400);
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return error(res, 'Team member not found.', 404);
    }

    // Cannot delete last ADMIN
    if (user.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return error(res, 'Cannot delete the last admin account.', 400);
      }
    }

    await prisma.user.delete({ where: { id } });

    return success(res, 'Team member deleted successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/settings/team/:id/password
 */
const changeTeamPassword = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    const member = await prisma.user.findUnique({ where: { id } });
    if (!member) {
      return error(res, 'Team member not found.', 404);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return success(res, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getShop,
  updateShop,
  getTeam,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
  changeTeamPassword,
};
