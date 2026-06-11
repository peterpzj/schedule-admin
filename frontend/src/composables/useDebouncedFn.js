/**
 * useDebouncedFn
 *
 * 通用防抖组合式函数 — 用于搜索/筛选等高频触发的异步操作
 * 解决"按字查询导致每次按键都打一次后端"的问题
 *
 * 用法：
 *   const debouncedSearch = useDebouncedFn(loadList, 350)
 *   function onInput() { debouncedSearch() }
 *
 * 也支持取消/立即执行：
 *   const debounced = useDebouncedFn(fn, 300)
 *   debounced.cancel()   // 取消待执行的任务
 *   debounced.flush()    // 立即执行（不等防抖窗口）
 */
import { onUnmounted } from 'vue'

export function useDebouncedFn (fn, delay = 300) {
  let timer = null

  function debounced (...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () {
      timer = null
      fn.apply(null, args)
    }, delay)
  }

  debounced.cancel = function () {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  debounced.flush = function (...args) {
    debounced.cancel()
    fn.apply(null, args)
  }

  // 组件卸载时自动清理，避免内存泄漏 + "组件已卸载还触发 setState" 警告
  onUnmounted(debounced.cancel)

  return debounced
}
