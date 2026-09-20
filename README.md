# Code Playground

可嵌入教学博客的 React 代码编辑 / 编译 / 运行组件。

## 安装

```sh
npm install code-playground react react-dom @monaco-editor/react
```

## 使用

```tsx
import { CodePlayground, registerDefaults } from 'code-playground'
import 'code-playground/styles.css'

registerDefaults() // 注册默认语言与引擎（XCC 本地 + Godbolt / Rust Playground 在线）

function Blog() {
  return <CodePlayground initialLanguage="c" />
}
```

### CodePlayground Props

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `initialLanguage` | `string` | `'cpp'` | 初始语言 id |
| `lockLanguage` | `boolean` | `false` | 固定语言：隐藏语言下拉框，始终使用 `initialLanguage` |
| `defaultEngine` | `string` | 首个 | 默认引擎 id（未指定时取该语言第一个引擎） |
| `lockEngine` | `boolean` | `false` | 固定引擎：隐藏引擎下拉框 |
| `defaultCode` | `string` | 语言模板 | 默认代码 |
| `defaultStdin` | `string` | — | 默认 stdin 输入 |
| `readOnly` | `boolean` | `false` | 代码只读（不可编辑） |
| `disableStdin` | `boolean` | `false` | 禁用并隐藏 stdin 输入框 |
| `onRunComplete` | `(RunResult) => void` | — | 运行完成回调 |
| `className` | `string` | — | 附加到根容器的 class |

示例：

```tsx
// 指定默认引擎（所有语言都优先用 Godbolt）
<CodePlayground defaultEngine="godbolt" />

// 固定展示一段只读 C++ 代码（Godbolt 在线编译）
<CodePlayground
  initialLanguage="cpp"
  defaultEngine="godbolt"
  defaultCode={'#include <iostream>\nint main() { std::cout << "hi"; }'}
  readOnly
  lockLanguage
  lockEngine
/>
```

### Vite 消费方配置（必需）

组件依赖 React 作为 peer，为避免多个 React 实例引发 hooks 冲突，请在消费方 `vite.config.ts` 强制去重：

```ts
export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
})
```

### 开发预览本仓库

```sh
npm run dev     # demo 应用（源码直连）
npm run build   # 构建可发布库（dist/）
```

## 功能

- Monaco 编辑器，支持 C / C++ / Python / Rust
- 编译器引擎**插件化**：本地（XCC）与在线（Godbolt / Rust Playground）可下拉切换
- 支持 stdin 输入，编译错误 / 运行输出完整展示
- 每个 `<语言-引擎>` 组合有独立的局限提示（显示在引擎下拉框右侧）

## 引擎能力矩阵

| 语言 | 引擎 | 支持 stdin |
| --- | --- | --- |
| C++ | 在线编译 (Godbolt) | ✅ |
| C | 本地编译 (XCC) | ✅ |
| C | 在线编译 (Godbolt) | ✅ |
| Python | 在线编译 (Godbolt) | ✅ |
| Rust | 在线编译 (Godbolt) | ✅ |
| Rust | 在线编译 (Rust Playground) | ✅ |

> Rust Playground 引擎通过 WebSocket 交互协议支持 stdin（有输入时自动走 WebSocket，无输入走 evaluate.json）。

## 架构

```
src/
├── core/
│   ├── types.ts            # CompilerEngine / LanguageSpec / EngineCapabilities / RunResult ...
│   ├── registry.ts         # 引擎注册表 + 语言注册表（插件化）
│   ├── capabilities.ts     # 引擎能力声明辅助（makeCapabilities）
│   └── capabilityMatrix.ts # 导出 <语言-引擎> 能力矩阵
├── engines/
│   ├── xcc/                # 本地引擎：XCC C 编译器（WASM，~130KB，毫秒级）
│   │   ├── XccCEngine.ts   #   主线程引擎（Worker + 超时）
│   │   ├── xcc.worker.ts   #   Worker：编译 + 运行（含 FileSystem / stdin）
│   │   └── libcContent.ts  #   内置 libc 头文件（含补充的 scanf）
│   ├── godbolt/            # 在线引擎：Compiler Explorer API（免费无 key）
│   └── rust/               # 在线引擎：Rust 官方 Playground API
├── languages/              # 语言规格（模板 / Monaco id / 引擎映射）
└── components/             # CodePlayground / Toolbar / OutputPanel
```

## 新增引擎（插件化）

实现 `CompilerEngine` 接口并注册即可，UI 无需改动：

```ts
class MyEngine implements CompilerEngine {
  readonly id = 'my-engine'
  readonly name = '我的引擎'
  readonly kind = 'online'
  readonly supportedLanguages = ['cpp']
  readonly supportsStdin = true
  readonly supportsJudge = true

  capabilitiesFor(languageId: string): EngineCapabilities {
    // 返回 { stdin, judge, stdinHint?, judgeHint? }
    return { stdin: true, judge: true }
  }

  async run(request: RunRequest): Promise<RunResult> {
    // 编译 + 运行，返回 stdout/stderr/exitCode/compileError/timedOut
  }
}

registerDefaults({ extraEngines: [new MyEngine()] })
```

## 新增语言

在 `src/languages/index.ts` 注册 `LanguageSpec`（含默认模板、Monaco id、各引擎的语言映射 id），并在支持的引擎 `supportedLanguages` 中声明。

## 本地引擎说明（XCC）

- XCC 是轻量 C 编译器（WASM ~130KB），**仅支持 C**，编译毫秒级，无需下载重型工具链
- 已补充 `scanf` / `fscanf` / `sscanf` 实现
- `math.h`（sqrt/pow/sin/cos/log/floor…）、`string.h`（strcpy/strlen/strcmp/memcpy…）、`stdlib.h`、`ctype.h` 均可用
- 运行在 Web Worker 中，死循环通过超时 terminate 判定为 TLE

## 部署要求

在线引擎（Godbolt / Rust Playground）需要能访问外网。本地 XCC 引擎完全离线（wasm 与 libc 均已打包）。
