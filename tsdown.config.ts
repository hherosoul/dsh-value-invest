import { defineConfig } from 'tsdown'

// prepare 必须自包含：直接转译 src/，不依赖项目引用，也不做类型检查。
// 官方要求：git 安装后由 pnpm 运行 prepare 产出发布入口，
// 所以不能假设旁边有一份 monorepo checkout。
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'],
  dts: false,
})
