/**
 * CodePlayground 库入口。
 *
 * 用法：
 * ```ts
 * import { CodePlayground, registerDefaults } from 'code-playground'
 * import 'code-playground/styles.css'
 *
 * registerDefaults()
 * <CodePlayground />
 * ```
 */

import './styles.css'

export { CodePlayground } from './components/CodePlayground'
export type { CodePlaygroundProps } from './components/CodePlayground'

export {
  registerDefaults,
  engineRegistry,
  languageRegistry,
  XccCEngine,
  GodboltEngine,
  RustPlaygroundEngine,
} from './engines'
export type { PlaygroundOptions } from './engines'

export { getCapabilityMatrix, capabilityMatrixToMarkdown } from './core/capabilityMatrix'

export type {
  CompilerEngine,
  EngineCapabilities,
  EngineKind,
  LanguageSpec,
  RunRequest,
  RunResult,
  RunStage,
} from './core/types'
