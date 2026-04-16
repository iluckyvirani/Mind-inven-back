const { validationResult } = require('express-validator');
const { error } = require('../utils/apiResponse');

/**
 * Middleware to check express-validator results
 * Place after validation rules in route chain
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const messages = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return error(res, 'Validation failed.', 400, messages);
  }

  next();
};

module.exports = validate;
