export type EngineKind = 'local' | 'online'

export interface LanguageSpec {
  /** 唯一 id，如 'cpp'、'c'、'python' */
  id: string
  /** 显示名，如 'C++' */
  label: string
  /** Monaco 编辑器语言 id */
  monacoLanguage: string
  /** 源码文件扩展名（不带点） */
  extension: string
  /** Piston API 的语言 id（在线引擎使用） */
  pistonLanguage?: string
  /** Godbolt (Compiler Explorer) 的语言 id */
  godboltLanguage?: string
  /** 新建文件时的默认模板 */
  template: string
}

export interface RunRequest {
  languageId: string
  code: string
  stdin?: string
  /** 超时毫秒，默认由引擎决定 */
  timeoutMs?: number
  /** 阶段进度回调（UI 显示用），由引擎在关键阶段调用 */
  onProgress?: (stage: RunStage, detail?: string) => void
}

export type RunStage = 'downloading' | 'compiling' | 'running' | 'uploading' | 'waiting'

export interface RunResult {
  stdout: string
  stderr: string
  /** 退出码；编译失败时为 null */
  exitCode: number | null
  /** 是否超时（被强制终止） */
  timedOut: boolean
  /** 是否编译失败 */
  compileError: boolean
  /** 编译错误详情（compileError 时可用） */
  compileMessage?: string
  /** 耗时毫秒 */
  durationMs: number
}

/**
 * 某个 <语言-引擎> 组合的能力配置。
 */
export interface EngineCapabilities {
  /** 该引擎对此语言是否支持 stdin 输入 */
  stdin: boolean
  /** 不支持 stdin 时的提示文案 */
  stdinHint?: string
  /** 引擎局限性提示（显示在引擎下拉框右侧，如 "不支持 stdin"、"在线排队较慢"） */
  limitationHint?: string
}

/**
 * 编译器引擎接口（插件）。
 *
 * 新增引擎（如 Judge0、Wandbox、Pyodide）只需实现此接口并注册到
 * EngineRegistry，UI 无需改动。
 */
export interface CompilerEngine {
  readonly id: string
  /** 下拉框中显示的名字，如 '本地编译 (XCC)' */
  readonly name: string
  readonly kind: EngineKind
  readonly description: string
  /** 该引擎支持的语言 id 列表；空数组表示不支持任何语言 */
  readonly supportedLanguages: readonly string[]
  /** 是否支持 stdin 输入 */
  readonly supportsStdin: boolean

  /**
   * 返回某个语言在该引擎上的能力配置（stdin 支持情况）。
   * 引擎可按语言细分能力；未声明时回退到引擎级 supportsStdin。
   */
  capabilitiesFor(languageId: string): EngineCapabilities

  /** 编译并运行一段代码 */
  run(request: RunRequest): Promise<RunResult>
}
