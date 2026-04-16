const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { success, error } = require('../utils/apiResponse');

// Generate JWT token
const generateToken = (user, expiresIn) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Strip password from user object
const sanitizeUser = (user) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email: username.toLowerCase() },
    });

    if (!user) {
      return error(res, 'Invalid email or password.', 401);
    }

    if (user.status !== 'ACTIVE') {
      return error(res, 'Account is inactive. Contact admin.', 403);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return error(res, 'Invalid email or password.', 401);
    }

    // Update lastLogin timestamp
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = generateToken(updatedUser);

    // Return user + token at root level (frontend authSlice expects response.data.user / response.data.token)
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user: sanitizeUser(updatedUser),
      token,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auth/me
 */
const getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return error(res, 'User not found.', 404);
    }

    return success(res, 'Profile fetched', sanitizeUser(user));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return error(res, 'User not found.', 404);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return error(res, 'Current password is incorrect.', 400);
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: hashedPassword },
    });

    return success(res, 'Password changed successfully');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh-token
 */
const refreshToken = async (req, res, next) => {
  try {
    // req.user is already set by auth middleware (token was valid)
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user || user.status !== 'ACTIVE') {
      return error(res, 'Unable to refresh token.', 401);
    }

    const token = generateToken(user);

    return success(res, 'Token refreshed', { token });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 */
const logout = async (req, res) => {
  // JWT is stateless — client removes token. Server just acknowledges.
  return success(res, 'Logged out successfully');
};

module.exports = { login, getProfile, changePassword, refreshToken, logout };
