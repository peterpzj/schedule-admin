/**
 * 自定义字段组件注册表
 *
 * 当 schema 里 type: 'custom' 时，FieldRenderer 会通过 component 名
 * 在这里查 Vue 组件。集中注册便于审计 + 测试。
 */
import { markRaw } from 'vue'

// 占位：实际项目里像 import MyComp from '@/components/MyComp.vue'
const registry = {
  // 'MyComp': markRaw(MyComp),
}

export function getFieldComponent(name) {
  return registry[name] || null
}

export function registerFieldComponent(name, comp) {
  registry[name] = markRaw(comp)
}

export default registry