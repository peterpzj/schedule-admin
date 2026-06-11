/**
 * requireRole 中间件
 *
 * 在 requireAuth 之后挂载：
 *   router.post('/foo', requireAuth, requireRole([ROLES.ADMIN, ROLES.EDITOR]), handler)
 *
 * - 用户未登录 → requireAuth 抛 401
 * - 用户已登录但 role 不在 allowed 列表 → 抛 AUTHZ_FORBIDDEN（403）
 * - allowed 为空数组 = 任何登录用户都可访问（等价于仅 requireAuth）
 */

const { hasRole } = require('../lib/roles')
const { biz, ERR } = require('../lib/errors')

function requireRole(allowed) {
  return function (req, res, next) {
    if (!req.user) {
      // requireAuth 没挂或被绕过了
      return next(biz(ERR.AUTH_TOKEN_MISSING, '未登录'))
    }
    if (!hasRole(req.user, allowed)) {
      const need = Array.isArray(allowed) ? allowed.join(',') : String(allowed)
      return next(biz(ERR.AUTHZ_FORBIDDEN, '当前角色无权访问（需要 ' + need + '）'))
    }
    next()
  }
}

module.exports = requireRole