<template>
  <router-view />
</template>

<script setup>
import { useAuthStore } from '@/stores/auth'
import { onMounted } from 'vue'

const auth = useAuthStore()
onMounted(() => {
  // 启动时尝试恢复登录态
  auth.restore()
})
</script>
