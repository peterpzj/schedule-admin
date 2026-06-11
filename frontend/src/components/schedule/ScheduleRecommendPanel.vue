<!--
  ScheduleRecommendPanel
  智能推荐面板：按 (campus, doctor, day) 推荐 (room, slot) 组合
  父组件监听 @apply 事件以应用推荐结果
-->
<template>
  <div v-if="recommendations.length > 0" class="recommend-panel">
    <div class="recommend-title">
      <el-icon :size="14"><Aim /></el-icon>
      <span>智能推荐（按科室匹配 + 时段优先级排序）</span>
    </div>
    <div class="recommend-list">
      <div
        v-for="(r, i) in recommendations.slice(0, 8)"
        :key="i"
        class="recommend-item"
        @click="emit('apply', r)"
      >
        <div class="rec-room">
          <span class="rec-room-name">{{ r.roomName }}</span>
          <span class="rec-room-dept" v-if="r.department">{{ r.department }}</span>
        </div>
        <div class="rec-slot">
          <el-tag size="small" :type="periodTagType(r.period)" effect="light">{{ r.period }}</el-tag>
          <span class="rec-time">{{ r.startTime }}–{{ r.endTime }}</span>
        </div>
        <div class="rec-score">★ {{ r.score }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Aim } from '@element-plus/icons-vue'

const props = defineProps({
  recommendations: { type: Array, required: true }
})
const emit = defineEmits(['apply'])

function periodTagType(p) {
  if (p === '上午') return 'success'
  if (p === '中午') return 'warning'
  if (p === '下午') return 'primary'
  if (p === '夜班') return 'info'
  return ''
}
</script>

<style scoped>
.recommend-panel {
  background: linear-gradient(135deg, #f0f9ff 0%, #ecfeff 100%);
  border: 1px solid rgba(3, 105, 161, 0.2);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin: 0 24px 18px;
}
.recommend-title {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 700; color: var(--color-primary);
  margin-bottom: 10px;
}
.recommend-list {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
}
.recommend-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(3, 105, 161, 0.1);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  font-size: 12.5px;
}
.recommend-item:hover {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(3, 105, 161, 0.25);
}
.recommend-item:hover .rec-room-dept,
.recommend-item:hover .rec-score { color: rgba(255, 255, 255, 0.85); }
.recommend-item:hover .rec-time { color: rgba(255, 255, 255, 0.9); }
.rec-room { flex: 1; min-width: 0; }
.rec-room-name { font-weight: 600; }
.rec-room-dept { display: block; font-size: 10.5px; color: var(--text-muted); margin-top: 1px; }
.rec-slot { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.rec-time { color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.rec-score {
  color: #d97706; font-weight: 700; font-size: 11px;
  font-variant-numeric: tabular-nums; flex-shrink: 0;
}
</style>
