<template>
  <div class="view-wrap">
    <generic-crud
      endpoint="/doctors"
      entity-name="医生"
      :columns="columns"
      :form-fields="formFields"
    />
  </div>
</template>

<script setup>
import GenericCrud from '@/components/GenericCrud.vue'

// #问题2：删除冗余 ID 列
const columns = [
  { prop: 'name', label: '姓名', sortable: true, minWidth: 100 },
  { prop: 'work_id', label: '工号', minWidth: 100 },
  { prop: 'department', label: '科室', minWidth: 120, sortable: true },
  { prop: 'title', label: '职称', minWidth: 100 },
  { prop: 'other_title', label: '其他职称', minWidth: 120 },
  { prop: 'primary_campus', label: '主院区', minWidth: 100 }
]

const formFields = [
  { prop: 'name', label: '姓名', required: true },
  { prop: 'work_id', label: '工号', required: true },
  { prop: 'department', label: '科室', required: true },
  { prop: 'title', label: '职称' },
  { prop: 'other_title', label: '其他职称' },
  { prop: 'primary_campus', label: '主院区代码' }
]
</script>
