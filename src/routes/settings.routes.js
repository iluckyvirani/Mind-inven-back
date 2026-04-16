const router = require('express').Router();
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/role');
const validate = require('../middleware/validate');
const {
  updateShopValidator,
  addTeamValidator,
  updateTeamValidator,
  changeTeamPasswordValidator,
} = require('../validators/settings.validator');
const {
  getShop,
  updateShop,
  getTeam,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
  changeTeamPassword,
} = require('../controllers/settings.controller');

// All routes require auth
router.use(authenticate);

// Shop settings — getShop accessible to all authenticated users
router.get('/shop', getShop);
router.put('/shop', authorize('ADMIN'), updateShopValidator, validate, updateShop);

// Team management — ADMIN only
router.get('/team', authorize('ADMIN'), getTeam);
router.post('/team', authorize('ADMIN'), addTeamValidator, validate, addTeamMember);
router.put('/team/:id', authorize('ADMIN'), updateTeamValidator, validate, updateTeamMember);
router.put('/team/:id/password', authorize('ADMIN'), changeTeamPasswordValidator, validate, changeTeamPassword);
router.delete('/team/:id', authorize('ADMIN'), deleteTeamMember);

module.exports = router;
