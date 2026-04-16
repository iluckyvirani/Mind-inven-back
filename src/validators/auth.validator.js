const { body } = require('express-validator');

const loginValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Email is required.')
    .isEmail()
    .withMessage('Please enter a valid email.'),
  body('password')
    .notEmpty()
    .withMessage('Password is required.'),
];

const changePasswordValidator = [
  body('oldPassword')
    .notEmpty()
    .withMessage('Current password is required.'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required.')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters.'),
];

module.exports = { loginValidator, changePasswordValidator };
