<template>
  <div class="view-wrap">
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card header="修改密码">
          <el-form :model="passwordForm" :rules="rules" ref="pwdFormRef" label-width="100px">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="passwordForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="passwordForm.newPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="确认新密码" prop="confirmPassword">
              <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
            </el-form-item>
            <el-button type="primary" :loading="changing" @click="onChangePassword">修改密码</el-button>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="12">
        <el-card header="账号管理（仅管理员）">
          <div v-if="auth.user?.role === 'admin'">
            <el-button type="primary" :icon="Plus" @click="onAddUser">新建账号</el-button>
            <el-table :data="users" class="mt-20" stripe>
              <el-table-column prop="id" label="ID" width="60" />
              <el-table-column prop="username" label="账号" />
              <el-table-column prop="name" label="姓名" />
              <el-table-column prop="role" label="角色" />
              <el-table-column prop="status" label="状态" />
              <el-table-column prop="last_login_at" label="最后登录" />
            </el-table>
          </div>
          <el-alert v-else title="仅管理员可管理账号" type="warning" :closable="false" />
        </el-card>

        <el-card header="系统信息" class="mt-20">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="API 地址">{{ apiBase }}</el-descriptions-item>
            <el-descriptions-item label="当前账号">{{ auth.user?.username }}</el-descriptions-item>
            <el-descriptions-item label="角色">{{ auth.user?.role }}</el-descriptions-item>
            <el-descriptions-item label="登录时间">{{ loginTime }}</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <!-- 新建账号弹窗 -->
    <el-dialog v-model="addUserVisible" title="新建账号" width="500px">
      <el-form :model="newUser" label-width="100px">
        <el-form-item label="账号" required>
          <el-input v-model="newUser.username" />
        </el-form-item>
        <el-form-item label="密码" required>
          <el-input v-model="newUser.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="姓名">
          <el-input v-model="newUser.name" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="newUser.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addUserVisible = false">取消</el-button>
        <el-button type="primary" @click="onCreateUser">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const pwdFormRef = ref()
const changing = ref(false)
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const rules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ required: true, min: 6, message: '至少 6 位', trigger: 'blur' }],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    { validator: (rule, val, cb) => val === passwordForm.newPassword ? cb() : cb(new Error('两次密码不一致')), trigger: 'blur' }
  ]
}

const apiBase = window.location.origin + '/api'
const loginTime = ref(localStorage.getItem('loginTime') || new Date().toISOString())

const users = ref([])
const addUserVisible = ref(false)
const newUser = reactive({ username: '', password: '', name: '', role: 'user' })

async function onChangePassword() {
  await pwdFormRef.value.validate()
  changing.value = true
  try {
    const res = await api.post('/auth/change-password', passwordForm)
    if (res.success) {
      ElMessage.success('密码已修改')
      passwordForm.oldPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
    }
  } finally {
    changing.value = false
  }
}

async function loadUsers() {
  const res = await api.get('/auth/users')
  if (res.success) users.value = res.data
}

function onAddUser() {
  Object.assign(newUser, { username: '', password: '', name: '', role: 'user' })
  addUserVisible.value = true
}

async function onCreateUser() {
  if (!newUser.username || !newUser.password) {
    ElMessage.error('账号和密码必填')
    return
  }
  const res = await api.post('/auth/users', newUser)
  if (res.success) {
    ElMessage.success('已创建')
    addUserVisible.value = false
    loadUsers()
  }
}

onMounted(() => {
  if (auth.user?.role === 'admin') loadUsers()
})
</script>

<style scoped>
.mt-20 { margin-top: 20px; }
</style>
