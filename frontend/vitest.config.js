/**
 * 前端 Vitest 配置（占位，本轮不写测试用例）
 *   - 等真正需要测组件逻辑时再补
 *   - 当前仅作 npm test 跑通的空配置
 */
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.js', 'src/**/*.spec.js'],
    exclude: ['node_modules/**', 'dist/**']
  }
})