<script setup>
/**
 * 通用表单项渲染器
 *
 * 接收 field schema 和 modelValue，渲染对应的 Element Plus 表单控件。
 *
 * 支持的类型（field.type）：
 *   text（默认）  - el-input
 *   password      - el-input type=password
 *   number        - el-input-number
 *   textarea      - el-input type=textarea
 *   select        - el-select（单选）
 *   multiselect   - el-select multiple
 *   cascader      - el-cascader
 *   date          - el-date-picker type=date
 *   datetime      - el-date-picker type=datetime
 *   daterange     - el-date-picker type=daterange（值为 [start, end]）
 *   switch        - el-switch
 *   autocomplete  - el-autocomplete
 *   static        - 只读展示
 *   radio         - el-radio-group
 *   checkbox      - el-checkbox-group
 *   custom        - 自定义组件（field.component），用于动态脚本场景
 *
 * options 来源：
 *   - field.options: 静态 [{label, value, disabled?}, ...]
 *   - field.optionsUrl: API 地址，自动 fetch 后解析
 *     field.valueKey（默认 'value'）/ field.labelKey（默认 'label'）
 *   - field.optionsDependsOn: 依赖字段名（如 ['campusCode']），当依赖字段
 *     变化时重新拉取 options，并把依赖值作为 query 一起带过去
 *     field.optionsUrlParams: 函数(props) -> 额外 query
 *   - field.optionsMapper: 函数(items, props) -> items，用于在拉取后
 *     做映射 / 过滤（如把 doctors 按 campus_code 过滤）
 *
 * 自定义脚本（field.script）：
 *   当需要更复杂的渲染/校验逻辑，schema 里直接挂一段 JS：
 *     { type: 'custom', component: 'MyComp', script: 'validate: v=>v>0' }
 *   启动时由 components/fields/scripts/* 注入到 window 字段脚本表，
 *   FieldRenderer 在挂载/更新时执行这些钩子。
 */
import { ref, computed, onMounted, watch, inject, h } from 'vue'
import api from '@/api'
import { runFieldScript } from '@/components/fields/scriptRuntime'

const props = defineProps({
  field: { type: Object, required: true },
  modelValue: { default: undefined },
  disabled: { type: Boolean, default: false },
  /** 表单整对象，用于联动场景的依赖字段读取 */
  formData: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['update:modelValue', 'change'])

const innerValue = computed({
  get: function () { return props.modelValue },
  set: function (v) { emit('update:modelValue', v); emit('change', v) }
})

const options = ref([])
const loadingOptions = ref(false)
const errorMsg = ref('')

function normalizeOptions(raw, valueKey, labelKey) {
  valueKey = valueKey || 'value'
  labelKey = labelKey || 'label'
  if (!Array.isArray(raw)) return []
  return raw.map(function (item) {
    if (item && typeof item === 'object' && 'label' in item && 'value' in item) return item
    return { label: item[labelKey], value: item[valueKey] }
  })
}

/**
 * 从 formData 中读取 field.optionsDependsOn 声明的依赖字段值，
 * 拼成 { foo: bar } 形式传给后端（或供 optionsMapper 使用）
 */
function buildDependParams() {
  const deps = props.field.optionsDependsOn
  if (!Array.isArray(deps) || deps.length === 0) return {}
  const out = {}
  for (const k of deps) {
    out[k] = props.formData ? props.formData[k] : undefined
  }
  // 用户可以额外定义 optionsUrlParams 拿到这些值后再加工
  if (typeof props.field.optionsUrlParams === 'function') {
    try {
      const extra = props.field.optionsUrlParams({ formData: props.formData, field: props.field }) || {}
      Object.assign(out, extra)
    } catch (_) { /* ignore */ }
  }
  return out
}

async function loadOptions() {
  if (!props.field.optionsUrl) return
  loadingOptions.value = true
  errorMsg.value = ''
  try {
    const params = buildDependParams()
    const res = await api.get(props.field.optionsUrl, params)
    let raw = []
    if (res && res.success) raw = res.data || []
    else if (Array.isArray(res)) raw = res
    // mapper hook：把后端数据加工成 options
    if (typeof props.field.optionsMapper === 'function') {
      try { raw = props.field.optionsMapper(raw, { formData: props.formData, field: props.field }) || [] }
      catch (_) { /* ignore mapper error */ }
    }
    options.value = normalizeOptions(raw, props.field.valueKey, props.field.labelKey)
  } catch (e) {
    options.value = []
    errorMsg.value = (e && e.message) || '加载选项失败'
  } finally {
    loadingOptions.value = false
  }
}

onMounted(function () {
  if (props.field.options && Array.isArray(props.field.options)) {
    options.value = props.field.options
  } else if (props.field.optionsUrl) {
    loadOptions()
  }
  // 字段脚本：onMount 钩子
  runFieldScript(props.field, 'onMount', { field: props.field, formData: props.formData })
})

watch(function () { return props.field.options }, function (v) {
  if (Array.isArray(v)) options.value = v
})

// 依赖字段变化 → 重拉 options
watch(function () {
  const deps = props.field.optionsDependsOn
  if (!Array.isArray(deps) || deps.length === 0) return null
  return deps.map(k => props.formData ? props.formData[k] : undefined).join('|')
}, function () {
  if (props.field.optionsUrl) loadOptions()
})

const isReadOnly = computed(function () { return props.disabled || props.field.disabled === true || props.field.readOnly === true })

// 校验结果（来自 field.script 里的 validate 钩子）
const validateError = ref('')
async function validateValue() {
  if (!props.field.script) { validateError.value = ''; return true }
  const r = await runFieldScript(props.field, 'validate', { value: innerValue.value, formData: props.formData })
  if (r && r.ok === false) validateError.value = r.message || ''
  else validateError.value = ''
  return !validateError.value
}
watch(innerValue, () => { validateValue() })

defineExpose({ validate: validateValue })
</script>

<template>
  <div class="field-renderer">
    <template v-if="!field.type || field.type === 'text'">
      <el-input v-model="innerValue" :placeholder="field.placeholder || ('请输入' + field.label)" :disabled="isReadOnly" :clearable="field.clearable !== false" :maxlength="field.maxLength" :show-word-limit="field.maxLength" @blur="validateValue" />
    </template>

    <template v-else-if="field.type === 'password'">
      <el-input v-model="innerValue" type="password" :placeholder="field.placeholder || ('请输入' + field.label)" :disabled="isReadOnly" :clearable="field.clearable !== false" show-password />
    </template>

    <template v-else-if="field.type === 'number'">
      <el-input-number v-model="innerValue" :min="field.min" :max="field.max" :step="field.step || 1" :precision="field.precision" :disabled="isReadOnly" :placeholder="field.placeholder" style="width: 100%" controls-position="right" />
    </template>

    <template v-else-if="field.type === 'textarea'">
      <el-input v-model="innerValue" type="textarea" :rows="field.rows || 3" :placeholder="field.placeholder" :disabled="isReadOnly" :maxlength="field.maxLength" />
    </template>

    <template v-else-if="field.type === 'select'">
      <el-select v-model="innerValue" :placeholder="field.placeholder || ('请选择' + field.label)" :disabled="isReadOnly" :clearable="field.clearable !== false" :filterable="field.filterable !== false" :loading="loadingOptions" style="width: 100%">
        <el-option v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" :disabled="opt.disabled" />
      </el-select>
    </template>

    <template v-else-if="field.type === 'multiselect'">
      <el-select v-model="innerValue" multiple collapse-tags collapse-tags-tooltip :placeholder="field.placeholder || ('请选择' + field.label)" :disabled="isReadOnly" :clearable="field.clearable !== false" :filterable="field.filterable !== false" style="width: 100%">
        <el-option v-for="opt in options" :key="opt.value" :label="opt.label" :value="opt.value" :disabled="opt.disabled" />
      </el-select>
    </template>

    <template v-else-if="field.type === 'cascader'">
      <el-cascader v-model="innerValue" :options="options" :props="field.cascaderProps || {}" :placeholder="field.placeholder" :disabled="isReadOnly" :clearable="field.clearable !== false" style="width: 100%" />
    </template>

    <template v-else-if="field.type === 'date'">
      <el-date-picker v-model="innerValue" type="date" :placeholder="field.placeholder || ('请选择' + field.label)" :disabled="isReadOnly" :value-format="field.valueFormat || 'YYYY-MM-DD'" style="width: 100%" />
    </template>

    <template v-else-if="field.type === 'datetime'">
      <el-date-picker v-model="innerValue" type="datetime" :placeholder="field.placeholder || ('请选择' + field.label)" :disabled="isReadOnly" :value-format="field.valueFormat || 'YYYY-MM-DD HH:mm:ss'" style="width: 100%" />
    </template>

    <template v-else-if="field.type === 'daterange'">
      <el-date-picker v-model="innerValue" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" :disabled="isReadOnly" :value-format="field.valueFormat || 'YYYY-MM-DD'" style="width: 100%" />
    </template>

    <template v-else-if="field.type === 'switch'">
      <el-switch v-model="innerValue" :disabled="isReadOnly" :active-text="field.activeText" :inactive-text="field.inactiveText" :active-value="field.activeValue !== undefined ? field.activeValue : true" :inactive-value="field.inactiveValue !== undefined ? field.inactiveValue : false" />
    </template>

    <template v-else-if="field.type === 'autocomplete'">
      <el-autocomplete v-model="innerValue" :fetch-suggestions="field.suggestions || (function (q, cb) { cb(options.value.filter(function (o) { return String(o.label).indexOf(q) >= 0; })); })" :placeholder="field.placeholder" :disabled="isReadOnly" :clearable="true" style="width: 100%" />
    </template>

    <template v-else-if="field.type === 'radio'">
      <el-radio-group v-model="innerValue" :disabled="isReadOnly">
        <el-radio v-for="opt in options" :key="opt.value" :label="opt.value">{{ opt.label }}</el-radio>
      </el-radio-group>
    </template>

    <template v-else-if="field.type === 'checkbox'">
      <el-checkbox-group v-model="innerValue" :disabled="isReadOnly">
        <el-checkbox v-for="opt in options" :key="opt.value" :label="opt.value">{{ opt.label }}</el-checkbox>
      </el-checkbox-group>
    </template>

    <template v-else-if="field.type === 'custom'">
      <!-- 自定义组件：通过 field.component 字符串名从全局查找组件（fields/_registry 中注册） -->
      <component
        :is="field.component"
        v-model="innerValue"
        v-bind="field.props || {}"
        :field="field"
        :form-data="formData"
        @change="(v) => emit('change', v)"
      />
    </template>

    <template v-else-if="field.type === 'static'">
      <span class="field-static">{{ modelValue }}</span>
    </template>

    <template v-else>
      <el-input v-model="innerValue" :placeholder="field.placeholder" :disabled="isReadOnly" />
    </template>

    <div v-if="validateError" class="field-error">{{ validateError }}</div>
    <div v-else-if="errorMsg" class="field-error">{{ errorMsg }}</div>
  </div>
</template>

<style scoped>
.field-renderer { width: 100%; }
.field-static { color: var(--text-secondary); font-size: 13px; }
.field-error {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-color-danger, #f56c6c);
  line-height: 1.4;
}
</style>