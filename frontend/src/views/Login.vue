<template>
  <div class="login-page">
    <div class="bg-circle bg-circle-1"></div>
    <div class="bg-circle bg-circle-2"></div>
    <div class="bg-circle bg-circle-3"></div>

    <div class="login-card">
      <div class="logo">🏥</div>
      <h1 class="title">诊室排班管理后台</h1>
      <p class="subtitle">请使用管理员账号登录</p>

      <el-form ref="formRef" :model="form" :rules="rules" class="form" @submit.prevent>
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="账号"
            size="large"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="onLogin"
          />
        </el-form-item>
        <el-button
          type="primary"
          :loading="loading"
          class="login-btn"
          size="large"
          @click="onLogin"
        >登 录</el-button>
      </el-form>

      <p class="footer">默认账号：admin / admin123（请在「系统设置」修改）</p>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref()
const loading = ref(false)
const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function onLogin() {
  await formRef.value.validate()
  loading.value = true
  try {
    const ok = await auth.login(form.username, form.password)
    if (ok) {
      ElMessage.success('登录成功')
      router.push('/dashboard')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #11998e 0%, #38a169 50%, #68d391 100%);
  overflow: hidden;
}
.bg-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255,255,255,0.1);
}
.bg-circle-1 { width: 500rpx; height: 500rpx; top: -100rpx; right: -150rpx; }
.bg-circle-2 { width: 400rpx; height: 400rpx; bottom: -100rpx; left: -100rpx; }
.bg-circle-3 { width: 300rpx; height: 300rpx; top: 50%; left: 50%; transform: translate(-50%, -50%); }

.login-card {
  position: relative;
  z-index: 2;
  background: #fff;
  border-radius: 16px;
  padding: 48px 40px;
  width: 400px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.logo { font-size: 56px; text-align: center; margin-bottom: 16px; }
.title { font-size: 24px; font-weight: 700; color: #2e7d32; text-align: center; margin: 0 0 8px; }
.subtitle { text-align: center; color: #999; margin: 0 0 32px; font-size: 14px; }
.form { width: 100%; }
.login-btn {
  width: 100%;
  background: linear-gradient(135deg, #2e7d32 0%, #4caf50 100%);
  border: none;
  font-size: 16px;
  height: 48px;
  margin-top: 12px;
}
.footer { text-align: center; color: #999; font-size: 12px; margin-top: 24px; }
</style>
