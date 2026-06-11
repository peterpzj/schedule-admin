<template>
  <div class="forbidden-wrap">
    <div class="forbidden-card">
      <div class="forbidden-icon">🚫</div>
      <h2 class="forbidden-title">无权访问</h2>
      <p class="forbidden-text">{{ message }}</p>
      <div class="forbidden-actions">
        <el-button type="primary" @click="goHome">返回首页</el-button>
        <el-button @click="goLogin">切换账号</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const message = computed(() => {
  const from = route.query.from
  if (from) return `您的账号无权访问 ${from}，请联系管理员`
  return '您的账号无权访问该页面，请联系管理员'
})

function goHome() {
  router.push('/dashboard')
}
function goLogin() {
  // 清 token/user 走登录
  try {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  } catch (_) {}
  router.push('/login')
}
</script>

<style scoped>
.forbidden-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4ecf7 100%);
}
.forbidden-card {
  background: var(--bg-card, #fff);
  border-radius: 16px;
  padding: 48px 56px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  text-align: center;
  max-width: 420px;
}
.forbidden-icon {
  font-size: 72px;
  margin-bottom: 16px;
}
.forbidden-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  margin: 0 0 12px;
}
.forbidden-text {
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  line-height: 1.6;
  margin: 0 0 24px;
}
.forbidden-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>