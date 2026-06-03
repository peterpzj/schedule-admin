import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('token') || '')
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  async function login(username, password) {
    const res = await api.post('/auth/login', { username, password })
    if (res.success) {
      token.value = res.token
      user.value = res.user
      localStorage.setItem('token', res.token)
      localStorage.setItem('user', JSON.stringify(res.user))
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
    if (u) user.value = JSON.parse(u)
  }

  return { token, user, isLoggedIn, login, logout, restore }
})
