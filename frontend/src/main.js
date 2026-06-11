import { createApp } from 'vue'
import { createPinia } from 'pinia'
// 图标按需注册：只白名单内会用到的几个 + 解析代码里出现的组件名
import {
  Odometer, DataAnalysis, OfficeBuilding, Files, FirstAidKit,
  Grid, House, Clock, UserFilled, Calendar, Upload, Ticket, Setting,
  Plus, Refresh, Expand, Fold, ArrowDown, SwitchButton, Search,
  Edit, Delete, View, Check, Close, Warning, QuestionFilled,
  Star, Flag, Promotion, ChatLineRound, Bell, Lock, Unlock, Key, InfoFilled
} from '@element-plus/icons-vue'

import App from './App.vue'
import router from './router'
import './styles/global.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

// 按需注册图标组件（避免全量注册 400+ 图标撑大 bundle）
const ICONS = [
  Odometer, DataAnalysis, OfficeBuilding, Files, FirstAidKit,
  Grid, House, Clock, UserFilled, Calendar, Upload, Ticket, Setting,
  Plus, Refresh, Expand, Fold, ArrowDown, SwitchButton, Search,
  Edit, Delete, View, Check, Close, Warning, QuestionFilled,
  Star, Flag, Promotion, ChatLineRound, Bell, Lock, Unlock, Key, InfoFilled
]
for (const comp of ICONS) {
  if (comp && comp.name) app.component(comp.name, comp)
}

app.mount('#app')
