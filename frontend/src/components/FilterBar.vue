<!--
  FilterBar
  统一过滤栏容器：白色卡片 + 内联 el-form
  用法：
    <FilterBar>
      <el-form-item label="操作人">...</el-form-item>
      <el-form-item><el-button @click="onSearch">查询</el-button></el-form-item>
    </FilterBar>
  注：内部样式复用 global.css 中的 .panel
-->
<template>
  <div class="panel filter-bar-wrap" :style="wrapStyle">
    <slot />
  </div>
</template>

<script setup>
defineProps({
  // 透传 marginBottom 等内联样式
  wrapStyle: { type: String, default: 'margin-bottom: 16px;' }
})
</script>
