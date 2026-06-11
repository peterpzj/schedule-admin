<template>
  <div class="not-found-page">
    <div class="not-found-card">
      <div class="error-code">404</div>
      <h2 class="not-found-title">页面不存在</h2>
      <p class="not-found-text">
        你访问的路径 <code class="path-text">{{ currentPath }}</code> 不存在或已被移除。
      </p>
      <div class="not-found-actions">
        <el-button type="primary" @click="goHome">返回数据看板</el-button>
        <el-button @click="goBack">返回上一页</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const currentPath = computed(() => route.fullPath)

function goHome() {
  router.replace('/dashboard')
}
function goBack() {
  // 优先 history.back；没有历史时跳首页
  if (window.history.length > 1) router.back()
  else router.replace('/dashboard')
}
</script>

<style scoped>
.not-found-page {
  min-height: calc(100vh - 64px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4ecf7 100%);
}
.not-found-card {
  background: var(--bg-card, #fff);
  border-radius: 16px;
  padding: 56px 64px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  max-width: 520px;
}
.error-code {
  font-size: 96px;
  font-weight: 900;
  line-height: 1;
  background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  color: transparent;
  font-variant-numeric: tabular-nums;
  letter-spacing: -2px;
  margin-bottom: 12px;
}
.not-found-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary, #1f2937);
  margin: 0 0 12px;
}
.not-found-text {
  font-size: 14px;
  color: var(--text-muted, #6b7280);
  line-height: 1.6;
  margin: 0 0 24px;
}
.path-text {
  background: var(--bg-muted, #f3f4f6);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
  color: var(--color-primary-dark, #075985);
}
.not-found-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}
</style>