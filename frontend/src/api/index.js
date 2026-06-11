import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import router from '@/router'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000
})

// 请求拦截器：附加 token
//  - 优先用 store 的 token（响应式）
//  - store 为空时回退 localStorage（处理 Pinia 初始化时机问题）
api.interceptors.request.use((config) => {
  let token = ''
  try {
    const auth = useAuthStore()
    if (auth && auth.token) token = auth.token
  } catch (_) {}
  if (!token) token = localStorage.getItem('token') || ''
  if (token) {
    config.headers.Authorization = 'Bearer ' + token
  }
  return config
})

// 错误码 → 用户消息映射（可被项目覆盖）
// 服务端返回 { success: false, code, error, details }
const CODE_MESSAGE_FALLBACK = {
  AUTH_TOKEN_MISSING: '登录已过期，请重新登录',
  AUTH_TOKEN_INVALID: '登录已过期，请重新登录',
  AUTH_TOKEN_EXPIRED: '登录已过期，请重新登录',
  AUTH_LOGIN_FAILED: '账号或密码错误',
  AUTH_USER_DISABLED: '账号已停用',
  AUTHZ_FORBIDDEN: '无权限执行此操作',
  AUTHZ_ROLE_REQUIRED: '需要更高权限',
  VAL_REQUIRED: '请填写完整信息',
  VAL_INVALID: '输入内容不合法',
  SCH_CONFLICT: '该诊室该周次该时段已有排班',
  SCH_DOCTOR_BUSY: '该医生该周次该时段已安排其他诊室',
  META_HAS_REFERENCES: '仍被其他数据引用，无法删除',
  DB_DUPLICATE: '数据重复',
  SYS_RATE_LIMITED: '请求过于频繁，请稍后再试',
  SYS_INTERNAL: '服务器内部错误',
  EXC_PARSE_FAILED: 'Excel 解析失败',
  EXC_INVALID_HEADERS: 'Excel 表头不符合要求',
  EXC_EMPTY: 'Excel 内容为空',
  EXC_TOO_LARGE: 'Excel 文件过大'
}

const TOKEN_EXPIRED_CODES = new Set(['AUTH_TOKEN_MISSING', 'AUTH_TOKEN_INVALID', 'AUTH_TOKEN_EXPIRED'])

// 响应拦截器：统一处理错误 + 智能解包列表响应
//  - 标准 { success, data, ... }：原样返回
//  - 列表 { success, data: { data: [...], total, page } }：自动解包为 { success, data: [...], total, page }
//    这样旧的 res.data 取数组的写法无需改动
api.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && body.success && body.data && typeof body.data === 'object' && Array.isArray(body.data.data)) {
      // 列表响应：把内层 data 提到外层
      return {
        success: body.success,
        data: body.data.data,
        total: body.data.total,
        page: body.data.page,
        pageSize: body.data.pageSize,
        _truncated: body.data._truncated,
        warnings: body.data.warnings
      }
    }
    return body
  },
  (err) => {
    const data = err.response?.data
    const code = data?.code
    const serverMsg = data?.error

    if (err.response?.status === 401 || TOKEN_EXPIRED_CODES.has(code)) {
      handleTokenExpired(err.config)
    } else if (err.response?.status === 403 || code === 'AUTHZ_FORBIDDEN' || code === 'AUTHZ_ROLE_REQUIRED') {
      // #22 角色守卫的兜底：前端用 v-if 隐藏的同时，被绕过时弹明确提示
      ElMessage.error(CODE_MESSAGE_FALLBACK[code] || '无权限执行此操作')
      // 不跳路由（可能是某按钮被点了，让用户自己回去）
    } else if (code && CODE_MESSAGE_FALLBACK[code]) {
      ElMessage.error(CODE_MESSAGE_FALLBACK[code])
    } else if (serverMsg) {
      ElMessage.error(serverMsg)
    } else {
      ElMessage.error('网络错误：' + (err.message || '未知'))
    }
    return Promise.reject(err)
  }
)

/**
 * #21 静默 401 → 弹登录
 * 同一个会话里只提示一次（防止批量并发请求刷屏弹 toast）。
 * 用 sessionStorage 而不是模块级变量，避免 hard reload 后还残留标记
 * 影响新会话的体验。
 */
// #36 修复：sessionStorage 真正起作用——跨 tab 同步 401 抑制
// 启动时如果 sessionStorage 里有 tokenExpiredAt，预置 tokenExpiredHandled=true
let tokenExpiredHandled = (function () {
  try { return !!sessionStorage.getItem('tokenExpiredAt') } catch (_) { return false }
})()

function handleTokenExpired(config) {
  // 登录接口本身的 401 不走这个分支（让 Login.vue 自己处理）
  if (config && config.url && config.url.includes('/auth/login')) return

  // 标记 + 清登录态
  if (!tokenExpiredHandled) {
    tokenExpiredHandled = true
    try { sessionStorage.setItem('tokenExpiredAt', String(Date.now())) } catch (_) {}
    ElMessage.error(CODE_MESSAGE_FALLBACK.AUTH_TOKEN_EXPIRED)
  }
  try {
    const auth = useAuthStore()
    auth.logout()
  } catch (_) {}

  // 用 router.replace 而不是 window.location.href，避免整页刷新丢状态
  const cur = router.currentRoute.value
  if (cur && cur.path !== '/login') {
    router.replace({ path: '/login', query: { expired: '1', redirect: cur.fullPath } })
  }
}

// 监听 storage 事件：其他 tab 登录成功后会清 tokenExpiredAt，本 tab 也要同步
try {
  window.addEventListener('storage', function (e) {
    if (e.key === 'tokenExpiredAt' && !e.newValue) {
      tokenExpiredHandled = false
    }
  })
} catch (_) {}

// 登录成功后清标记
export function clearTokenExpiredFlag() {
  tokenExpiredHandled = false
  try { sessionStorage.removeItem('tokenExpiredAt') } catch (_) {}
}

export default api
export { CODE_MESSAGE_FALLBACK }

/**
 * apiDownload(url, params) — 走 api 拦截器（自动带 token + 统一错误处理），
 * 但返回 raw Blob（不走 smart unwrap）
 * 用法：
 *   const blob = await apiDownload('/schedules/export', { campus: 'X' })
 *   saveAs(blob, 'export.csv')
 */
export async function apiDownload (url, params) {
  const resp = await api.get(url, {
    params,
    responseType: 'blob',
    // 跳过响应拦截器的"列表自动解包"逻辑：直接拿原始 axios response
    transformResponse: undefined
  })
  return resp.data
}

/**
 * apiUpload(url, formData) — 用 FormData 上传（POST），
 * 走 api 拦截器（自动带 token + 统一错误处理）
 * 错误码如 202（文件过大提示）会作为正常响应返回，由调用方处理
 * 返回的是响应拦截器解包后的 body（已 unwrap 列表响应）
 */
export async function apiUpload (url, formData) {
  // 上传时必须让 axios 自己设置 Content-Type（含 boundary），不能手动指定
  return api.post(url, formData)
}

/**
 * 浏览器端保存 Blob 为文件
 * 用法：saveBlob(blob, 'export.csv')
 */
export function saveBlob (blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
