<template>
  <div class="login-page">
    <div class="login-bg"></div>

    <div class="login-card">
      <div class="logo" aria-hidden="true">
        <AppIcon name="hospital" :size="56" />
      </div>
      <h1 class="title">诊室排班管理后台</h1>
      <p class="subtitle">请使用管理员账号登录</p>

      <!-- #P0-5 修复：识别 ?expired=1 与 ?redirect= -->
      <el-alert
        v-if="isExpired"
        type="warning"
        :closable="false"
        show-icon
        title="登录已过期，请重新登录"
        description="您的会话已失效（可能是 token 过期或在其他设备被登出）。"
        style="margin-bottom: 16px"
      />

      <el-form ref="formRef" :model="form" :rules="rules" class="form" @submit.prevent>
        <el-form-item prop="username">
          <label for="login-username" class="field-label">账号</label>
          <el-input
            id="login-username"
            v-model="form.username"
            placeholder="请输入登录账号"
            size="large"
            :prefix-icon="User"
            clearable
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item prop="password">
          <label for="login-password" class="field-label">密码</label>
          <el-input
            id="login-password"
            v-model="form.password"
            type="password"
            placeholder="请输入登录密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
            @keyup="onKeyUp"
            @keydown="onKeyDown"
            @keyup.enter="onLogin"
          />
          <!-- #P1-L3 修复：CapsLock 状态提示（误触大写密码导致登录失败） -->
          <transition name="capslock-fade">
            <div v-if="capsLockOn" class="capslock-warning" role="status" aria-live="polite">
              <AppIcon name="warning" :size="14" />
              <span>大写锁定已开启，密码可能输入有误</span>
            </div>
          </transition>
        </el-form-item>
        <el-button
          type="primary"
          :loading="loading"
          class="login-btn"
          size="large"
          aria-label="登录"
          @click="onLogin"
        >登 录</el-button>

        <!-- 开发环境快捷登录：仅 import.meta.env.DEV 为 true 时渲染 -->
        <div
          v-if="isDev"
          class="quick-fill"
          role="button"
          tabindex="0"
          aria-label="开发模式：填充测试账号"
          @click="onQuickFill"
          @keyup.enter="onQuickFill"
        >
          <AppIcon name="info" :size="14" />
          <span>开发模式：点击填充测试账号</span>
        </div>
      </el-form>

      <p class="footer">遇到问题请联系系统管理员</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock, InfoFilled } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { clearTokenExpiredFlag } from '@/api'
import AppIcon from '@/components/AppIcon.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

// 仅在 Vite 开发模式（npm run dev）下启用快速登录辅助
// 生产环境构建后 isDev = false，"开发模式"按钮 + 默认账号都不会出现
const isDev = import.meta.env.DEV

// #P0-8 修复：开发账号密码从 .env 读取，避免明文密码被打进生产 bundle
//   之前 const DEV_USERNAME = 'mzb' / DEV_PASSWORD = 'Mzb87343232' 是源码字面量
//   Vite 静态 const 会被 Rollup 静态分析保留，'grep Mzb87343232 dist/*.js' 能命中
//   现在用 import.meta.env.VITE_DEV_USER / VITE_DEV_PASS 读取 .env.development
//   生产构建时这些变量不会被注入（只在 .env / .env.development 定义）
const DEV_USERNAME = import.meta.env.VITE_DEV_USER || ''
const DEV_PASSWORD = import.meta.env.VITE_DEV_PASS || ''

// #P0-5 修复：识别 ?expired=1（401 跳转带过来）和 ?redirect=（登录后回跳）
const isExpired = computed(() => route.query.expired === '1')
const redirectTarget = computed(() => {
  const r = route.query.redirect
  // 安全检查：仅接受站内路径，防止 open redirect
  if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//')) return '/dashboard'
  return r
})

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// #P1-L3：CapsLock 检测
//   - getModifierState 在密码输入框上监听
//   - 仅在输入框聚焦时显示提示
const capsLockOn = ref(false)
function onKeyDown(e) {
  if (e && typeof e.getModifierState === 'function') {
    capsLockOn.value = e.getModifierState('CapsLock')
  }
}
function onKeyUp(e) {
  if (e && typeof e.getModifierState === 'function') {
    capsLockOn.value = e.getModifierState('CapsLock')
  }
}
// 兜底：全局监听器（密码框失焦也能感知到开关切换）
function onGlobalKey(e) {
  // 只在登录页生效
  if (e && typeof e.getModifierState === 'function') {
    capsLockOn.value = e.getModifierState('CapsLock')
  }
}
onMounted(() => {
  document.addEventListener('keydown', onGlobalKey)
  document.addEventListener('keyup', onGlobalKey)
})
onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKey)
  document.removeEventListener('keyup', onGlobalKey)
})

async function onLogin() {
  await formRef.value.validate()
  loading.value = true
  try {
    const ok = await auth.login(form.username, form.password)
    if (ok) {
      // #P0-5 修复：登录成功清 401 标记，让后续 401 能再次触发跳登录
      try { clearTokenExpiredFlag() } catch (_) {}
      ElMessage.success('登录成功')
      router.replace(redirectTarget.value)
    }
  } finally {
    loading.value = false
  }
}

function onQuickFill() {
  // 仅开发环境可达；模板上 v-if="isDev" 保证生产环境不会渲染该按钮
  form.username = DEV_USERNAME
  form.password = DEV_PASSWORD
  ElMessage.info('已自动填充测试账号，请点击登录')
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  overflow: hidden;
}

/* 装饰性渐变背景 */
.login-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(3, 105, 161, 0.4) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(14, 165, 233, 0.2) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(3, 105, 161, 0.15) 0%, transparent 70%);
  pointer-events: none;
  animation: bgPulse 8s ease-in-out infinite;
}

@keyframes bgPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

/* 背景网格纹理 */
.login-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

/* 浮动粒子效果 */
.login-bg::after {
  content: '';
  position: absolute;
  width: 600px;
  height: 600px;
  top: -200px;
  right: -200px;
  background: radial-gradient(circle, rgba(14, 165, 233, 0.08) 0%, transparent 70%);
  animation: floatParticle 12s ease-in-out infinite;
}

@keyframes floatParticle {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-30px, 30px) scale(1.1); }
}

.login-card {
  position: relative;
  z-index: 2;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(24px);
  border-radius: 24px;
  padding: 48px 40px;
  width: 420px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.15),
    0 25px 50px -12px rgba(0, 0, 0, 0.5),
    0 0 100px rgba(3, 105, 161, 0.2);
  animation: cardEntrance 0.5s var(--ease-out) both;
}

@keyframes cardEntrance {
  from { opacity: 0; transform: translateY(20px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.logo {
  font-size: 56px;
  text-align: center;
  margin-bottom: 18px;
  filter: drop-shadow(0 4px 12px rgba(3,105,161,0.25));
  animation: logoFloat 3s ease-in-out infinite;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* #P1-L3 CapsLock 提示 */
.capslock-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: #92400e;
  background: #fef3c7;
  border: 1px solid #fde68a;
  border-radius: var(--radius-sm);
  font-weight: 500;
}
.capslock-fade-enter-active, .capslock-fade-leave-active {
  transition: opacity 0.18s var(--ease-out), transform 0.18s var(--ease-out);
}
.capslock-fade-enter-from, .capslock-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@keyframes logoFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.title {
  font-size: 24px;
  font-weight: 800;
  background: linear-gradient(135deg, #0f172a 0%, #0369a1 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-align: center;
  margin: 0 0 10px;
  letter-spacing: 0.5px;
}
.subtitle {
  text-align: center;
  color: var(--text-muted);
  margin: 0 0 36px;
  font-size: 13.5px;
  font-weight: 500;
}
.form { width: 100%; }

/* 字段标签 - 让 placeholder 更清晰 */
.field-label {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 6px;
  letter-spacing: 0.3px;
}

/* 一键填充提示 */
.quick-fill {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 14px;
  padding: 8px 12px;
  background: var(--color-primary-bg);
  border: 1px dashed rgba(3, 105, 161, 0.3);
  border-radius: var(--radius-md);
  font-size: 12px;
  color: var(--color-primary-dark);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  user-select: none;
}
.quick-fill:hover {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  border-style: solid;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(3, 105, 161, 0.25);
}

.login-btn {
  width: 100%;
  height: 50px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 4px;
  border: none;
  border-radius: 14px;
  margin-top: 8px;
  transition: all var(--duration-base) var(--ease-out);
  box-shadow: 0 4px 16px rgba(3, 105, 161, 0.4);
  background: linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%);
}
.login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 28px rgba(3, 105, 161, 0.5);
}
.login-btn:active {
  transform: translateY(0);
}
.login-btn:disabled {
  opacity: 0.6;
  transform: none;
}

.footer {
  text-align: center;
  color: var(--text-muted);
  font-size: 11.5px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-light);
}
</style>
