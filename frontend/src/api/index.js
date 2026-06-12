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
  // #Audit#17：记录请求开始时间用于 4xx/5xx 日志外发
  config.metadata = { startedAt: Date.now() }
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

// 响应拦截器：统一处理错误 + opt-in 列表解包
//   #Audit#21 修复：去掉隐式"smart unwrap" — 之前凡是 body.data.data 数组就解包
//     是隐式契约，后端一改字段就静默丢数据
//   之后：仅当后端在 body 里显式 { __unwrapList: true } 时解包；老接口保持行为
api.interceptors.response.use(
  (resp) => {
    const body = resp.data
    if (body && body.__unwrapList && body.data && typeof body.data === 'object' && Array.isArray(body.data.data)) {
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
    const status = err.response?.status
    const url = err.config?.url || ''
    const method = (err.config?.method || 'GET').toUpperCase()
    const startedAt = err.config?.metadata?.startedAt || Date.now()
    const ms = Date.now() - startedAt

    // #Audit#17 修复：4xx/5xx 自动外发客户端日志（best-effort，独立 navigator.sendBeacon 通道）
    //   之前：控制台一行 — 现场崩溃没线索
    //   之后：sendBeacon POST /api/client-log 静默送达，body 包含 method/url/status/ms/ua
    if (status && status >= 400) {
      try {
        const payload = JSON.stringify({
          level: status >= 500 ? 'error' : 'warn',
          source: 'api',
          method, url, status, code, ms,
          ua: navigator.userAgent,
          ts: new Date().toISOString()
        })
        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/client-log', new Blob([payload], { type: 'application/json' }))
        }
      } catch (_) {}
    }

    // #Audit#18 修复：调用方希望自己处理错误时，置 config.skipToast，拦截器只外发日志不弹 toast
    const skipToast = err.config?.skipToast
    if (status === 401 || TOKEN_EXPIRED_CODES.has(code)) {
      handleTokenExpired(err.config)
    } else if (status === 403 || code === 'AUTHZ_FORBIDDEN' || code === 'AUTHZ_ROLE_REQUIRED') {
      if (!skipToast) ElMessage.error(CODE_MESSAGE_FALLBACK[code] || '无权限执行此操作')
    } else if (status >= 500) {
      // #Audit#10 修复：5xx 不暴露 serverMsg（可能含 /uploads/xxx.xlsx 路径、SQL 错误）
      console.error('[api] 5xx', { method, url, status, serverMsg, code })
      if (!skipToast) ElMessage.error('服务器开小差，请稍后重试')
    } else if (code && CODE_MESSAGE_FALLBACK[code]) {
      if (!skipToast) ElMessage.error(CODE_MESSAGE_FALLBACK[code])
    } else if (serverMsg && status >= 400) {
      if (!skipToast) ElMessage.error(serverMsg)
    } else {
      if (!skipToast) ElMessage.error('网络错误：' + (err.message || '未知'))
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
  // #P1-8 修复：4xx/5xx 时 body 是 Blob 错误体（{code, error, message}），
  //   通用响应拦截器看到的 err.response.data 是 Blob，data?.code 是 undefined，
  //   只会弹通用"网络错误"。这里手动把 Blob 读成文本再 JSON.parse，
  //   提取真正的错误码 / 错误消息抛出。
  if (resp.status >= 400) {
    let errMsg = `下载失败 HTTP ${resp.status}`
    let code = 'DOWNLOAD_FAILED'
    try {
      const data = resp.data
      const text = (data && typeof data.text === 'function') ? await data.text() : ''
      if (text) {
        try {
          const j = JSON.parse(text)
          if (j.error) errMsg = j.error
          if (j.message) errMsg = j.message
          if (j.code) code = j.code
        } catch (_) {
          // 文本不是 JSON，沿用 HTTP 状态消息
        }
      }
    } catch (_) { /* 读取 Blob 失败，保持 errMsg */ }
    try { ElMessage.error(errMsg) } catch (_) {}
    const err = new Error(errMsg)
    err.code = code
    err.status = resp.status
    throw err
  }
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
