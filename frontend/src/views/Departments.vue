<template>
  <div class="view-wrap">
    <generic-crud
      endpoint="/departments"
      entity-name="科室"
      :columns="columns"
      :form-fields="formFields"
    />
  </div>
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

// #问题2：删除冗余 ID 列
// #问题3：minWidth 提到 100+
const columns = [
  { prop: 'name', label: '科室名称', sortable: true, minWidth: 140 },
  { prop: 'code', label: '科室代码', minWidth: 120 }
]

const formFields = [
  { prop: 'name', label: '科室名称', required: true },
  { prop: 'code', label: '科室代码', required: true }
]
</script>
