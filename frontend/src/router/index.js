import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 角色常量集中定义，便于复用
export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer'
}

/**
 * meta 扩展字段：
 *  - public:    是否免登录（仅 /login）
 *  - roles:     允许的角色列表；不写 = 所有登录用户可访问
 *               例如 meta: { roles: [ROLES.ADMIN] } 表示仅管理员
 */
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
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '数据看板', icon: 'Odometer', subtitle: '门诊排班运营概览' } },
      // #问题2：新增排班时间轴视图，按院区→诊区→星期几查某天的诊室×时间×医生分布
      { path: 'timeline', name: 'ScheduleTimeline', component: () => import('@/views/ScheduleTimeline.vue'), meta: { title: '排班时间轴', icon: 'Clock', subtitle: '横向诊室 × 纵向时间 — 看医生出诊安排' } },
      { path: 'statistics', name: 'Statistics', component: () => import('@/views/Statistics.vue'), meta: { title: '统计报表', icon: 'DataAnalysis', subtitle: '可视化图表 + 数据导出', roles: [ROLES.ADMIN, ROLES.EDITOR] } },
      { path: 'campuses', name: 'Campuses', component: () => import('@/views/Campuses.vue'), meta: { title: '院区管理', icon: 'OfficeBuilding', subtitle: '维护医院的院区信息', roles: [ROLES.ADMIN] } },
      { path: 'departments', name: 'Departments', component: () => import('@/views/Departments.vue'), meta: { title: '科室管理', icon: 'Files', subtitle: '维护医院科室信息', roles: [ROLES.ADMIN] } },
      { path: 'clinicTypes', name: 'ClinicTypes', component: () => import('@/views/ClinicTypes.vue'), meta: { title: '门诊类型', icon: 'FirstAidKit', subtitle: '维护门诊类型（如普通门诊/特需/专家）', roles: [ROLES.ADMIN] } },
      { path: 'zones', name: 'Zones', component: () => import('@/views/Zones.vue'), meta: { title: '诊区管理', icon: 'Grid', subtitle: '维护各院区下的诊区', roles: [ROLES.ADMIN] } },
      { path: 'rooms', name: 'Rooms', component: () => import('@/views/Rooms.vue'), meta: { title: '诊室管理', icon: 'House', subtitle: '维护诊区下的诊室', roles: [ROLES.ADMIN] } },
      { path: 'timeSlots', name: 'TimeSlots', component: () => import('@/views/TimeSlots.vue'), meta: { title: '时段管理', icon: 'Clock', subtitle: '维护门诊时段（上午/下午/夜班等）', roles: [ROLES.ADMIN] } },
      { path: 'doctors', name: 'Doctors', component: () => import('@/views/Doctors.vue'), meta: { title: '医生管理', icon: 'UserFilled', subtitle: '维护医生档案', roles: [ROLES.ADMIN] } },
      { path: 'schedules', name: 'Schedules', component: () => import('@/views/Schedules.vue'), meta: { title: '排班管理', icon: 'Calendar', subtitle: '按院区 + 周次维护周排班模板', roles: [ROLES.ADMIN, ROLES.EDITOR] } },
      { path: 'importExport', name: 'ImportExport', component: () => import('@/views/ImportExport.vue'), meta: { title: '导入导出', icon: 'Upload', subtitle: '批量上传 Excel / 备份数据', roles: [ROLES.ADMIN] } },
      { path: 'auditLogs', name: 'AuditLogs', component: () => import('@/views/AuditLogs.vue'), meta: { title: '操作日志', icon: 'Ticket', subtitle: '审计后台所有操作记录', roles: [ROLES.ADMIN] } },
      { path: 'settings', name: 'Settings', component: () => import('@/views/Settings.vue'), meta: { title: '系统设置', icon: 'Setting', subtitle: '账号、密码与系统信息' } }
    ]
  },
  {
    path: '/forbidden',
    name: 'Forbidden',
    component: () => import('@/views/Forbidden.vue'),
    meta: { public: true }
  },
  // #P2-14 修复：catch-all 404 路由，输错 URL 不再白屏
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: () => import('@/views/NotFound.vue'), meta: { public: true, title: '页面不存在' } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const auth = useAuthStore()

  // 公开页直接放行
  if (to.meta && to.meta.public) return next()

  // 未登录 → /login（保留来源 URL 以便登录后跳回）
  if (!auth.isLoggedIn) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }

  // 角色检查
  if (to.meta && Array.isArray(to.meta.roles) && to.meta.roles.length > 0) {
    if (!auth.hasRole(to.meta.roles)) {
      // 没权限：跳到 /forbidden 或 dashboard
      return next({ path: '/forbidden', query: { from: to.fullPath } })
    }
  }

  next()
})

export default router
