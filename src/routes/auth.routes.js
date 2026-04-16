const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const auth = require('../middleware/auth');
const validate = require('../middleware/validate');
const { loginValidator, changePasswordValidator } = require('../validators/auth.validator');
const { login, getProfile, changePassword, refreshToken, logout } = require('../controllers/auth.controller');

// Rate limit login: 5 attempts per 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, loginValidator, validate, login);
router.get('/me', auth, getProfile);
router.post('/change-password', auth, changePasswordValidator, validate, changePassword);
router.post('/refresh-token', auth, refreshToken);
router.post('/logout', auth, logout);

module.exports = router;
