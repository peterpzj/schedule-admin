<template>
  <div class="view-wrap">
    <generic-crud
      endpoint="/clinicTypes"
      entity-name="门诊类型"
      :columns="columns"
      :form-fields="formFields"
    />
  </div>
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

// #问题2：删除冗余 ID 列
const columns = [
  { prop: 'name', label: '门诊类型', sortable: true, minWidth: 140 },
  { prop: 'code', label: '类型代码', minWidth: 120 },
  { prop: 'sort_order', label: '排序', minWidth: 80 }
]

const formFields = [
  { prop: 'name', label: '门诊类型', required: true },
  { prop: 'code', label: '类型代码', required: true },
  { prop: 'sort_order', label: '排序', type: 'number' }
]
</script>
