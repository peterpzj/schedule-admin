<template>
  <div class="view-wrap">
    <generic-crud
      endpoint="/campuses"
      entity-name="院区"
      :columns="columns"
      :form-fields="formFields"
    />
  </div>
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

// #问题2 修复：删除冗余 ID 列（GenericCrud 已经渲染 type="index" "#" 列）
// #问题3 修复：minWidth 80 + showOverflowTooltip，长业务码（如 code）也不截断
const columns = [
  { prop: 'name', label: '院区名称', sortable: true, minWidth: 120, showOverflowTooltip: true },
  { prop: 'code', label: '院区代码', minWidth: 100, showOverflowTooltip: true },
  { prop: 'sort_order', label: '排序', minWidth: 80 }
]

const formFields = [
  { prop: 'name', label: '院区名称', required: true },
  { prop: 'code', label: '院区代码', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]
</script>
