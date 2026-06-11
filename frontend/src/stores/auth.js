import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)
  // 角色：'admin' | 'editor' | 'viewer' | null
  const role = computed(() => user.value?.role || null)
  const isAdmin = computed(() => role.value === 'admin')

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    if (res.success) {
      // 新错误码体系：登录返回 { success, data: { token, user } }
      const d = res.data || res
      token.value = d.token
      user.value = d.user
      localStorage.setItem('token', d.token)
      localStorage.setItem('user', JSON.stringify(d.user))
      return true
    }
    return false
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  function restore() {
    const t = localStorage.getItem('token')
    if (t) token.value = t
    const u = localStorage.getItem('user')
    if (u) {
      try {
        user.value = JSON.parse(u)
      } catch (_) {
        user.value = null
        localStorage.removeItem('user')
      }
    }
  }

  /**
   * 启动时调用：用 localStorage 的 token 调 /api/auth/me，
   * 成功 → 刷新 user 字段（角色等可能已变更），
   * 401 → 清除 token + user，跳登录页。
   * 这就是 #20 「刷新后保持登录」的核心：token 在 localStorage，但 user 字段
   * 可能过期/角色被改，必须后端确认。
   */
  let inflight = null
  async function bootstrap() {
    if (!token.value) return false
    if (inflight) return inflight
    inflight = (async () => {
      try {
        const res = await api.get('/auth/me')
        if (res && res.success && res.data && res.data.user) {
          user.value = res.data.user
          localStorage.setItem('user', JSON.stringify(res.data.user))
          return true
        }
        logout()
        return false
      } catch (e) {
        // 401 已被拦截器处理（清 token + 跳 login）；其他错误保留 token 不影响用户操作
        if (e && e.response && e.response.status === 401) return false
        return !!token.value
      } finally {
        inflight = null
      }
    })()
    return inflight
  }

  /** #22 路由 role 守卫辅助 */
  function hasRole(allowed) {
    if (!Array.isArray(allowed) || allowed.length === 0) return true
    if (!user.value) return false
    return allowed.includes(role.value)
  }

  // #4 跨 tab 同步：监听 localStorage 的 token / user 变化
  // - tab A 登录后 localStorage 自动跨 tab 同步（浏览器原生 storage 事件）
  // - 本 tab 监听后调用 restore() 让 store 立即反应
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', function (e) {
      if (e.key === 'token' || e.key === 'user') {
        // 由其他 tab 触发的变化（自己的写入不会触发）
        restore()
      }
    })
  }

  return { token, user, isLoggedIn, role, isAdmin, login, logout, restore, bootstrap, hasRole }
})
