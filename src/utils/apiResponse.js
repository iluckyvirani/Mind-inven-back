/**
 * Standardized API response helpers
 */

const success = (res, message, data = null, statusCode = 200, pagination = null) => {
  const response = {
    success: true,
    message,
  };
  if (data !== null) response.data = data;
  if (pagination) response.pagination = pagination;
  return res.status(statusCode).json(response);
};

const error = (res, message, statusCode = 500, errors = []) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
  });
};

const created = (res, message, data = null) => {
  return success(res, message, data, 201);
};

module.exports = { success, error, created };
