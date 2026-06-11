/**
 * 角色定义（三角色：admin | editor | viewer）
 *
 * 权限矩阵：
 *   - admin   全部权限（CRUD + 用户管理 + 系统设置 + 操作日志查看）
 *   - editor  业务数据写权限（排班/医生/诊室/时段 CRUD）+ 只读统计/操作日志
 *   - viewer  仅查看（GET 列表/详情）
 *
 * 与前端 admin/frontend/src/router/index.js 的 ROLES 常量对应。
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer'
})

const ALL_ROLES = Object.freeze([ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER])

function isValidRole(r) {
  return ALL_ROLES.indexOf(r) >= 0
}

/** 兜底：把任意未知 role 降级为 viewer */
function normalizeRole(r) {
  return isValidRole(r) ? r : ROLES.VIEWER
}

/**
 * 权限检查：user.role 是否在 allowed 列表里
 * - allowed 为空数组 = 任何登录用户都可访问（默认 requireAuth 已通过）
 */
function hasRole(user, allowed) {
  if (!user) return false
  if (!Array.isArray(allowed) || allowed.length === 0) return true
  return allowed.indexOf(normalizeRole(user.role)) >= 0
}

/**
 * 权限位（语义层面）
 *   WRITE_BUSINESS = 排班/医生/诊室/时段/诊区/院区/门诊类型/科室 CRUD
 *   ADMIN_SYSTEM   = 用户管理 / 操作日志查看 / 系统设置
 *   READ_ALL       = 全部读权限
 */
const PERMISSIONS = Object.freeze({
  WRITE_BUSINESS: [ROLES.ADMIN, ROLES.EDITOR],
  ADMIN_SYSTEM: [ROLES.ADMIN],
  READ_ALL: [ROLES.ADMIN, ROLES.EDITOR, ROLES.VIEWER]
})

module.exports = { ROLES, ALL_ROLES, PERMISSIONS, isValidRole, normalizeRole, hasRole }