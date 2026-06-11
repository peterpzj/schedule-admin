<!--
  ScheduleFormDialog
  排班新增/编辑弹窗
  - 接收表单数据 v-model:editing、字典数据、过滤后的 options
  - 暴露 validate() / reset() 方法供父组件调用
  - 内嵌 ScheduleRecommendPanel
-->
<template>
  <el-dialog
    :model-value="visible"
    :title="editing.id ? '编辑排班' : '新增排班'"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="onDialogUpdate"
  >
    <el-form
      ref="formRef"
      :model="editing"
      :rules="formRules"
      label-width="100px"
    >
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="医生" prop="doctor_id">
            <el-select v-model="editing.doctor_id" placeholder="请选择医生" filterable style="width: 100%" @change="emit('doctorChange', editing.doctor_id)">
              <el-option
                v-for="d in doctors"
                :key="d.id"
                :label="`${d.name} (${d.work_id} · ${d.department || '未分配'})`"
                :value="d.id"
              />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="院区" prop="campus_code">
            <el-select v-model="editing.campus_code" placeholder="请选择院区" style="width: 100%" @change="emit('campusChange')">
              <el-option v-for="c in campuses" :key="c.code" :label="c.name" :value="c.code" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="诊区" prop="zone_code">
            <el-select v-model="editing.zone_code" placeholder="请选择诊区" filterable style="width: 100%" @change="emit('zoneChange')">
              <el-option v-for="z in filteredZones" :key="z.code" :label="z.name" :value="z.code" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="诊室" prop="room_id">
            <el-select v-model="editing.room_id" placeholder="请选择诊室" filterable style="width: 100%">
              <el-option v-for="r in filteredRooms" :key="r.room_id" :label="`${r.room_name} (${r.room_id})`" :value="r.room_id" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="门诊类型" prop="clinic_type_code">
            <el-select v-model="editing.clinic_type_code" placeholder="请选择" style="width: 100%" @change="emit('clinicTypeChange')">
              <el-option v-for="c in clinicTypes" :key="c.code" :label="c.name" :value="c.code" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="时段" prop="time_slot_code">
            <el-select v-model="editing.time_slot_code" placeholder="请选择时段" filterable style="width: 100%" @change="emit('slotChange', editing.time_slot_code)">
              <el-option v-for="t in filteredSlots" :key="t.code" :label="`${t.name} (${t.start_time}-${t.end_time})`" :value="t.code" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="周次" prop="day_of_week">
            <el-select v-model="editing.day_of_week" placeholder="请选择" style="width: 100%">
              <el-option v-for="(d, i) in weekdays" :key="i+1" :label="d" :value="i+1" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="限号数">
            <el-input-number v-model="editing.patient_limit" :min="0" :max="999" style="width: 100%" placeholder="留空 = 不限号" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-form-item label="备注">
        <el-input v-model="editing.remark" type="textarea" :rows="2" placeholder="选填，如『专家号』『特需』" />
      </el-form-item>
    </el-form>

    <ScheduleRecommendPanel
      :recommendations="recommendations"
      @apply="onApplyRecommend"
    />

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import ScheduleRecommendPanel from './ScheduleRecommendPanel.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  editing: { type: Object, required: true },
  doctors: { type: Array, default: () => [] },
  campuses: { type: Array, default: () => [] },
  clinicTypes: { type: Array, default: () => [] },
  filteredZones: { type: Array, default: () => [] },
  filteredRooms: { type: Array, default: () => [] },
  filteredSlots: { type: Array, default: () => [] },
  recommendations: { type: Array, default: () => [] },
  weekdays: { type: Array, required: true },
  saving: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update:visible',
  'save',
  'doctorChange',
  'campusChange',
  'zoneChange',
  'clinicTypeChange',
  'slotChange',
  'applyRecommend'
])

const formRef = ref()

const formRules = {
  doctor_id:        [{ required: true, message: '请选择医生',     trigger: 'change' }],
  campus_code:      [{ required: true, message: '请选择院区',     trigger: 'change' }],
  zone_code:        [{ required: true, message: '请选择诊区',     trigger: 'change' }],
  room_id:          [{ required: true, message: '请选择诊室',     trigger: 'change' }],
  clinic_type_code: [{ required: true, message: '请选择门诊类型', trigger: 'change' }],
  time_slot_code:   [{ required: true, message: '请选择时段',     trigger: 'change' }],
  day_of_week:      [{ required: true, message: '请选择周次',     trigger: 'change' }]
}

function onDialogUpdate(val) { emit('update:visible', val) }

async function onSave() {
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  emit('save')
}

function onApplyRecommend(r) { emit('applyRecommend', r) }

defineExpose({ formRef })
</script>
