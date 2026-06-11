<!--
  PageHeader
  统一页面头：图标 + 标题 + 副标题 + 右侧操作区
  用法：
    <PageHeader title="操作日志" subtitle="记录后台所有操作行为" icon="Ticket">
      <el-button @click="loadList">刷新</el-button>
    </PageHeader>
-->
<template>
  <div class="page-header">
    <div class="page-header-left">
      <div class="page-title-row">
        <el-icon v-if="icon" class="page-title-icon"><component :is="icon" /></el-icon>
        <h1 class="page-title">{{ title }}</h1>
      </div>
      <p v-if="subtitle" class="page-subtitle">{{ subtitle }}</p>
    </div>
    <div class="page-header-right">
      <slot />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title:    { type: String, required: true },
  subtitle: { type: String, default: '' },
  icon:     { type: String, default: '' }
})
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 20px 24px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-light);
  margin-bottom: 0;
}
.page-header-left { min-width: 0; }
.page-title-row { display: flex; align-items: center; gap: 10px; }
.page-title-icon { font-size: 22px; color: var(--color-primary); }
.page-title { font-size: 20px; font-weight: 700; margin: 0; }
.page-subtitle { font-size: 12px; color: var(--text-muted); margin: 2px 0 0; }
.page-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
</style>
