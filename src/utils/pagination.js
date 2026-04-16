/**
 * Pagination helper
 * Usage: const { skip, take, page, limit } = getPagination(req.query);
 */

const getPagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;

  return { skip, take: limit, page, limit };
};

const getPaginationMeta = (total, page, limit) => {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
};

module.exports = { getPagination, getPaginationMeta };
