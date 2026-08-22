import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// ESM 下没有 __dirname，用 import.meta.url 派生
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// router-plugin 必须先于 react 执行：先扫描 routes/ 生成 routeTree.gen.ts，再让 react 处理 JSX
const routerPlugin = TanStackRouterVite({
  target: 'react',
  autoCodeSplitting: true,
  routesDirectory: './src/routes',
  generatedRouteTree: './src/routeTree.gen.ts',
  // 本项目 vite 为 rolldown 分支，与 router-plugin 声明的 Plugin 类型存在版本错位，
  // 只能以 any 中转（rolldown 与 rollup 的 PluginContextMeta 不兼容）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

export default defineConfig({
  plugins: [
    routerPlugin,
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发期把 /api 转发到 backend，避免 CORS 与 cookie 域问题（refresh token cookie path=/api/auth）
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    css: true,
    // 排除 E2E 测试目录：playwright spec 不应被 vitest 执行。
    // （node_modules / dist / cypress 为 vitest 默认排除，此处显式声明以避免
    // 数组覆盖行为导致默认值丢失）
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/cypress/**'],
  },
  build: {
    rollupOptions: {
      output: {
        // 用函数式而非对象式：node_modules 中可能不存在的包不会触发拼写错误
        // id 在 vite 里统一规范化为 unix 风格，跨平台安全
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor'
          }
          if (id.includes('@tanstack')) return 'tanstack-vendor'
          if (id.includes('@radix-ui')) return 'radix-vendor'
          if (id.includes('lucide-react')) return 'lucide-vendor'
          if (id.includes('/node_modules/sonner/')) return 'sonner-vendor'
        },
      },
    },
  },
})
