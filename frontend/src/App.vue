<template>
  <router-view />
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { onMounted } from 'vue'

const auth = useAuthStore()
onMounted(async () => {
  // 启动时先用 localStorage 恢复 token/user（同步、立即生效）
  auth.restore()
  // 再异步调 /api/auth/me 校验 token 有效性：
  //   - 成功：用后端的最新 user 覆盖本地（角色可能已变更）
  //   - 401：拦截器会清 token + 跳 /login
  // 这一步解决 #20 「刷新页面后保持登录」+ 「角色变更后下一次刷新生效」
  await auth.bootstrap().catch(() => {})
})
</script>
