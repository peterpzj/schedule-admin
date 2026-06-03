<template>
  <el-container class="layout-root">
    <el-aside :width="collapsed ? '64px' : '220px'" class="aside">
      <div class="logo" :class="{ collapsed }">
        <span v-if="!collapsed">🏥 排班管理</span>
        <span v-else>🏥</span>
      </div>
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        background-color="#1b5e20"
        text-color="#e8f5e9"
        active-text-color="#fff"
      >
        <el-menu-item v-for="r in menuRoutes" :key="r.path" :index="r.path">
          <el-icon><component :is="r.meta.icon" /></el-icon>
          <template #title>{{ r.meta.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-button text @click="collapsed = !collapsed" :icon="collapsed ? 'Expand' : 'Fold'" />
        <div class="header-title">{{ route.meta.title || '诊室排班管理' }}</div>
        <el-dropdown @command="handleCommand">
          <span class="user-info">
            <el-icon><UserFilled /></el-icon>
            {{ auth.user?.name || auth.user?.username || '未登录' }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ auth.user?.role || 'guest' }}</el-dropdown-item>
              <el-dropdown-item command="settings">系统设置</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessageBox } from 'element-plus'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapsed = ref(false)

const menuRoutes = computed(() => {
  return router.options.routes.find(r => r.path === '/').children
    .filter(r => r.path !== '')
})

function handleCommand(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录？', '提示', { type: 'warning' })
      .then(() => {
        auth.logout()
        router.push('/login')
      })
      .catch(() => {})
  } else if (cmd === 'settings') {
    router.push('/settings')
  }
}
</script>

<style scoped>
.layout-root { height: 100vh; }
.aside {
  background: linear-gradient(180deg, #1b5e20 0%, #2e7d32 100%);
  color: #fff;
  transition: width 0.2s;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: rgba(0,0,0,0.15);
}
.logo.collapsed { font-size: 24px; }
.header {
  display: flex;
  align-items: center;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  padding: 0 20px;
}
.header-title {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  margin-left: 12px;
  color: #333;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #2e7d32;
  font-weight: 500;
}
.main {
  background: #f0f5f1;
  padding: 20px;
}
:deep(.el-menu) { border-right: 0; }
:deep(.el-menu-item.is-active) { background: #2e7d32 !important; }
</style>
