import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'node:path'

// https://vite.dev/config/
// 库模式：`npm run build` 产出可导入的组件库（dist/）。
// 开发预览用 `npm run dev`（index.html + src/App.tsx demo）。
export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      exclude: ['src/main.tsx', 'src/App.tsx', 'src/assets'],
      tsconfigPath: './tsconfig.app.json',
      outDir: 'dist',
      rollupTypes: true,
    }),
  ],
  build: {
    lib: {
      entry: resolve(import.meta.dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'code-playground',
    },
    rollupOptions: {
      // react / react-dom / @monaco-editor/react 由使用方提供（peer / dependency），
      // 避免被打进库导致多个 React 实例引发 hooks dispatcher 冲突
      external: ['react', 'react-dom', 'react/jsx-runtime', '@monaco-editor/react'],
    },
    sourcemap: true,
  },
})
