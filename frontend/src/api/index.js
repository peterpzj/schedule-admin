import axios from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 30000
})

// 请求拦截器：附加 token
api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = 'Bearer ' + auth.token
  }
  return config
})

// 响应拦截器：统一处理错误
api.interceptors.response.use(
  (resp) => resp.data,
  (err) => {
    if (err.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      ElMessage.error('登录已过期')
      window.location.href = '/login'
    } else if (err.response?.data?.error) {
      ElMessage.error(err.response.data.error)
    } else {
      ElMessage.error('网络错误：' + (err.message || '未知'))
    }
    return Promise.reject(err)
  }
)

export default api
