const { error } = require('../utils/apiResponse');

/**
 * Global error handler — catches all unhandled errors
 */
const errorHandler = (err, req, res, _next) => {
  console.error('Error:', err.message);

  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    const field = err.meta?.target?.[0] || 'field';
    return error(res, `A record with this ${field} already exists.`, 409);
  }

  if (err.code === 'P2025') {
    return error(res, 'Record not found.', 404);
  }

  // JWT errors (backup — auth middleware handles most)
  if (err.name === 'JsonWebTokenError') {
    return error(res, 'Invalid token.', 401);
  }

  if (err.name === 'TokenExpiredError') {
    return error(res, 'Token expired.', 401);
  }

  // Default
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error.'
    : err.message || 'Internal server error.';

  return error(res, message, statusCode);
};

module.exports = errorHandler;
