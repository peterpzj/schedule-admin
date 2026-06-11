<template>
  <el-container class="layout-root">

    <!-- ============== 侧栏（深蓝黑 + 青色强调）============== -->
    <el-aside :width="collapsed ? '68px' : '230px'" class="aside">
      <!-- Logo -->
      <div class="logo" :class="{ collapsed }">
        <AppIcon name="hospital" :size="26" class="logo-icon" aria-label="医院图标" />
        <transition name="fade">
          <span v-if="!collapsed" class="logo-text">排班管理</span>
        </transition>
      </div>

      <!-- 导航菜单 -->
      <el-menu
        :default-active="route.path"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        background-color="transparent"
        text-color="#94a3b8"
        active-text-color="#38bdf8"
        class="aside-menu"
      >
        <el-menu-item
          v-for="r in menuRoutes"
          :key="r.path"
          :index="r.path"
          class="menu-item"
        >
          <el-icon class="menu-icon"><component :is="r.meta.icon" /></el-icon>
          <transition name="fade">
            <span v-if="!collapsed" class="menu-label">{{ r.meta.title }}</span>
          </transition>
          <div v-if="route.path === r.path" class="active-bar" />
        </el-menu-item>
      </el-menu>
    </el-aside>

    <!-- ============== 主容器 ============== -->
    <el-container>

      <!-- 顶部栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-button
            text
            class="collapse-btn"
            :aria-label="collapsed ? '展开侧栏' : '收起侧栏'"
            @click="collapsed = !collapsed"
          >
            <el-icon :size="18"><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon>
          </el-button>

          <el-breadcrumb separator="/" class="breadcrumb">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="route.meta?.title">{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="header-right">
          <div class="header-date">
            <el-icon :size="14"><Calendar /></el-icon>
            <span>{{ todayText }}</span>
          </div>

          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-trigger">
              <div class="user-avatar">{{ (auth.user?.name || auth.user?.username || 'U').slice(0, 1) }}</div>
              <div class="user-info">
                <span class="user-name">{{ auth.user?.name || auth.user?.username }}</span>
                <el-tag
                  v-if="auth.user?.role"
                  size="small"
                  :type="auth.user.role === 'admin' ? 'primary' : 'info'"
                  effect="dark"
                  class="user-role-tag"
                >
                  {{ auth.user.role === 'admin' ? '管理员' : '用户' }}
                </el-tag>
              </div>
              <el-icon :size="14" class="user-chevron"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu class="user-dropdown">
                <el-dropdown-item disabled>
                  <el-icon><UserFilled /></el-icon>
                  账号：{{ auth.user?.username }}
                </el-dropdown-item>
                <el-dropdown-item divided command="settings">
                  <el-icon><Setting /></el-icon>
                  系统设置
                </el-dropdown-item>
                <el-dropdown-item command="logout" class="logout-item">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 页面主体 -->
      <el-main class="main">
        <!-- #P2-A1 a11y: 跳过导航链接（键盘 Tab 第一个焦点） -->
        <a href="#main-content" class="skip-link">跳到主要内容</a>
        <!--
          #问题4-C 修复：:key 从 r.path 改成 r.matched[0].path
            - 之前用 r.path：同父路由换 query (?code=YX → ?code=HP) 也强制 unmount+remount
              → 每次切换都重新打所有 API，页面卡顿
            - 现在用 r.matched[0].path：key 只在顶层路由切换时变化（campuses → doctors）
              同组件复用，watch / onMounted 不重跑，仅响应 query 变化
            - 副作用：同组件 query 变化时需要子页面自己 watch query 重新加载（已实现）
        -->
        <router-view v-slot="{ Component, route: r }">
          <transition name="page" mode="out-in">
            <component :is="Component" :key="r.matched[0].path" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ElMessageBox, ElMessage } from 'element-plus'
import AppIcon from '@/components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const collapsed = ref(false)

const menuRoutes = computed(() => {
  return router.options.routes.find(r => r.path === '/').children.filter(r => r.path !== '')
})

const todayText = ref('')
let dateTimer = null
function updateDate() {
  const d = new Date()
  const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  todayText.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${wk[d.getDay()]}`
}
onMounted(() => { updateDate(); dateTimer = setInterval(updateDate, 60000) })
onUnmounted(() => clearInterval(dateTimer))

function handleCommand(cmd) {
  if (cmd === 'logout') {
    ElMessageBox.confirm('确定退出登录？', '提示', { type: 'warning', confirmButtonText: '确认退出' })
      .then(() => { auth.logout(); ElMessage.success('已退出'); router.push('/login') })
      .catch(() => {})
  } else if (cmd === 'settings') {
    router.push('/settings')
  }
}
</script>

<style scoped>
.layout-root { height: 100vh; overflow: hidden; }

/* ===== 侧栏 ===== */
.aside {
  background: #0f172a;
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 2px 0 20px rgba(0,0,0,0.4);
}

/* Logo */
.logo {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  flex-shrink: 0;
  overflow: hidden;
}
.logo-icon { font-size: 26px; flex-shrink: 0; filter: drop-shadow(0 2px 4px rgba(14,165,233,0.3)); }
.logo-text { font-size: 15px; font-weight: 700; color: #f1f5f9; white-space: nowrap; letter-spacing: 0.5px; }
.logo.collapsed { justify-content: center; padding: 0; }

/* 菜单 */
.aside-menu { flex: 1; overflow-y: auto; padding: 10px 0; }
.aside-menu :deep(.el-menu-item) {
  height: 44px; line-height: 44px; margin: 3px 8px; border-radius: 10px;
  padding-left: 16px !important; position: relative;
  transition: all var(--duration-fast) var(--ease-out);
  font-size: 13.5px; font-weight: 500; color: #94a3b8;
}
.aside-menu :deep(.el-menu-item:hover) {
  background: rgba(255,255,255,0.06) !important;
  color: #f1f5f9;
}
.aside-menu :deep(.el-menu-item.is-active) {
  background: rgba(3, 105, 161, 0.3) !important;
  color: #38bdf8 !important;
  font-weight: 600;
}
.aside-menu :deep(.el-menu-item.is-active):hover {
  background: rgba(3, 105, 161, 0.35) !important;
}

.active-bar {
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  width: 3px; height: 22px; background: #0ea5e9; border-radius: 0 2px 2px 0;
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.6);
}

.menu-icon { font-size: 16px; flex-shrink: 0; width: 20px; }
.menu-label { margin-left: 10px; white-space: nowrap; overflow: hidden; }

/* ===== Header ===== */
.header {
  height: 64px; display: flex; align-items: center; justify-content: space-between;
  background: #fff; border-bottom: 1px solid #e2e8f0; padding: 0 24px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); z-index: 10; flex-shrink: 0;
}
.header-left { display: flex; align-items: center; gap: 16px; }
.collapse-btn {
  width: 36px; height: 36px; border-radius: 8px; color: #64748b;
  transition: all var(--duration-fast) var(--ease-out);
}
.collapse-btn:hover { background: #f1f5f9; color: #0369a1; }

.breadcrumb { font-size: 13px; }
.breadcrumb :deep(.el-breadcrumb__inner) { color: #64748b; }
.breadcrumb :deep(.el-breadcrumb__inner:last-child) { color: #0369a1; font-weight: 600; }

.header-right { display: flex; align-items: center; gap: 16px; }
.header-date {
  display: flex; align-items: center; gap: 6px; font-size: 12px; color: #94a3b8;
  padding: 5px 12px; background: #f8fafc; border-radius: 20px; border: 1px solid #e2e8f0; font-weight: 500;
}

.user-trigger {
  display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px;
  border-radius: 24px; cursor: pointer; transition: all var(--duration-fast) var(--ease-out);
  border: 1px solid transparent;
}
.user-trigger:hover { background: #f8fafc; border-color: #e2e8f0; }
.user-avatar {
  width: 32px; height: 32px;
  background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%);
  color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 13px; font-weight: 700; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(3,105,161,0.35);
}
.user-info { display: flex; flex-direction: column; gap: 2px; }
.user-name { font-size: 13px; font-weight: 600; color: #0f172a; line-height: 1; }
.user-role-tag { font-size: 10px; height: 16px; line-height: 16px; }
.user-chevron { color: #94a3b8; }

/* ===== Main ===== */
.main { background: var(--bg-base); overflow-y: auto; padding: 0; }

/* ===== 过渡 ===== */
.page-enter-active, .page-leave-active { transition: opacity var(--duration-base), transform var(--duration-base); }
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }
.fade-enter-active, .fade-leave-active { transition: opacity var(--duration-base); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 用户下拉 */
.user-dropdown { min-width: 200px; }
.logout-item { color: #dc2626 !important; }
.logout-item:hover { background: #fff1f0 !important; color: #dc2626 !important; }
</style>
