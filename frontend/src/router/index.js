import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '数据看板', icon: 'Odometer' } },
      { path: 'campuses', name: 'Campuses', component: () => import('@/views/Campuses.vue'), meta: { title: '院区管理', icon: 'OfficeBuilding' } },
      { path: 'departments', name: 'Departments', component: () => import('@/views/Departments.vue'), meta: { title: '科室管理', icon: 'Files' } },
      { path: 'clinicTypes', name: 'ClinicTypes', component: () => import('@/views/ClinicTypes.vue'), meta: { title: '门诊类型', icon: 'FirstAidKit' } },
      { path: 'zones', name: 'Zones', component: () => import('@/views/Zones.vue'), meta: { title: '诊区管理', icon: 'Grid' } },
      { path: 'rooms', name: 'Rooms', component: () => import('@/views/Rooms.vue'), meta: { title: '诊室管理', icon: 'House' } },
      { path: 'timeSlots', name: 'TimeSlots', component: () => import('@/views/TimeSlots.vue'), meta: { title: '时段管理', icon: 'Clock' } },
      { path: 'doctors', name: 'Doctors', component: () => import('@/views/Doctors.vue'), meta: { title: '医生管理', icon: 'UserFilled' } },
      { path: 'schedules', name: 'Schedules', component: () => import('@/views/Schedules.vue'), meta: { title: '排班管理', icon: 'Calendar' } },
      { path: 'importExport', name: 'ImportExport', component: () => import('@/views/ImportExport.vue'), meta: { title: '导入导出', icon: 'Upload' } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: '系统设置', icon: 'Setting' } }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()
  if (to.meta.public) return next()
  if (!auth.isLoggedIn) return next('/login')
  next()
})

export default router
