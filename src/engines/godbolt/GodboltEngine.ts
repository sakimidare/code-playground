import type {
  CompilerEngine,
  EngineCapabilities,
  RunRequest,
  RunResult,
} from '../../core/types'
import { makeCapabilities } from '../../core/capabilities'

const GODBOLT_BASE = 'https://godbolt.org'

interface CeCompilerInfo {
  id: string
  name: string
  lang: string
  semver: string
}

interface CeTextBlock {
  text: string
}

interface CeCompileResponse {
  code: number
  didExecute: boolean
  timedOut: boolean
  stdout?: CeTextBlock[]
  stderr?: CeTextBlock[]
  execTime?: number
  buildResult?: {
    code: number
    stderr?: CeTextBlock[]
  }
}

export interface GodboltEngineOptions {
  baseUrl?: string
  /** 请求超时（默认 30s，Godbolt 服务端执行限制约 5s） */
  requestTimeoutMs?: number
}

const compilerCache = new Map<string, Promise<CeCompilerInfo | undefined>>()

/**
 * 在线编译引擎：调用 Compiler Explorer (godbolt.org) 公开 API。
 * 免费、无需注册、开放 CORS、支持 stdin/执行/超时/退出码判定。
 */
export class GodboltEngine implements CompilerEngine {
  readonly id = 'godbolt'
  readonly name = '在线编译 (Godbolt)'
  readonly kind = 'online' as const
  readonly description = '调用 Compiler Explorer 公开 API 在线编译运行，免费无 key，需要网络'
  readonly supportedLanguages = ['cpp', 'c', 'python', 'rust'] as const
  readonly supportsStdin = true

  private readonly baseUrl: string
  private readonly requestTimeoutMs: number

  private readonly caps: (languageId: string) => EngineCapabilities = makeCapabilities(
    { stdin: true, limitationHint: '在线编译，排队较慢' },
    {
      cpp: { stdin: true, limitationHint: '在线编译，排队较慢' },
      c: { stdin: true, limitationHint: '在线编译，排队较慢' },
      python: { stdin: true, limitationHint: '在线编译，排队较慢' },
      rust: { stdin: true, limitationHint: '在线编译，排队较慢' },
    },
  )

  capabilitiesFor(languageId: string): EngineCapabilities {
    return this.caps(languageId)
  }

  constructor(options: GodboltEngineOptions = {}) {
    this.baseUrl = options.baseUrl ?? GODBOLT_BASE
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
  }

  async run(request: RunRequest): Promise<RunResult> {
    const start = Date.now()
    const progress = request.onProgress
    const lang = this.mapLanguage(request.languageId)
    progress?.('downloading', `查询 ${lang} 编译器…`)
    const compilerInfo = await this.pickCompiler(lang)
    if (!compilerInfo) {
      return {
        stdout: '',
        stderr: `Godbolt 未找到 ${request.languageId} 的可用编译器`,
        exitCode: null,
        timedOut: false,
        compileError: true,
        compileMessage: `Godbolt 未找到 ${request.languageId} 的可用编译器`,
        durationMs: Date.now() - start,
      }
    }
    const compilerId = compilerInfo.id

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      progress?.('uploading', '提交到 Godbolt 编译执行…')
      const res = await fetch(`${this.baseUrl}/api/compiler/${compilerId}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          source: request.code,
          options: {
            userArguments: '',
            executeParameters: {
              args: [],
              stdin: request.stdin ?? '',
              runtimeTools: [],
            },
            compilerOptions: { executorRequest: true },
            filters: { execute: true },
            tools: [],
            libraries: [],
          },
          lang,
          allowStoreCodeDebug: false,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Godbolt API 请求失败：HTTP ${res.status}`)
      }

      const data = (await res.json()) as CeCompileResponse
      const stdout = joinText(data.stdout)
      const stderr = joinText(data.stderr)

      if (data.timedOut) {
        return {
          stdout,
          stderr: stderr || '执行超时',
          exitCode: data.code,
          timedOut: true,
          compileError: false,
          durationMs: Date.now() - start,
        }
      }

      if (!data.didExecute && data.code !== 0) {
        // 编译错误：具体错误在 buildResult.stderr（顶层 stderr 通常只有 "Build failed"）
        const buildErr = joinText(data.buildResult?.stderr)
        const compileMessage = stripAnsi(buildErr || stderr)
        return {
          stdout,
          stderr: compileMessage,
          exitCode: null,
          timedOut: false,
          compileError: true,
          compileMessage,
          durationMs: Date.now() - start,
        }
      }

      return {
        stdout,
        stderr,
        exitCode: data.code,
        timedOut: false,
        compileError: false,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return {
          stdout: '',
          stderr: '请求超时（Godbolt 服务不可用或网络问题）',
          exitCode: null,
          timedOut: true,
          compileError: false,
          durationMs: this.requestTimeoutMs,
        }
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private mapLanguage(languageId: string): string {
    const lang =
      languageId === 'cpp' ? 'c++' : languageId === 'c' || languageId === 'python' ? languageId : languageId
    return lang
  }

  private pickCompiler(lang: string): Promise<CeCompilerInfo | undefined> {
    let cached = compilerCache.get(lang)
    if (!cached) {
      cached = this.fetchCompiler(lang).then((info) => {
        compilerCache.set(lang, Promise.resolve(info))
        return info
      })
      compilerCache.set(lang, cached)
    }
    return cached
  }

  private async fetchCompiler(lang: string): Promise<CeCompilerInfo | undefined> {
    const res = await fetch(`${this.baseUrl}/api/compilers/${lang}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return undefined
    const compilers = (await res.json()) as CeCompilerInfo[]
    if (lang === 'python') {
      // 标准 CPython 在 Godbolt 中的名字是 "Python x.y"，排除 MicroPython/Codon/PyPy
      const pythons = compilers.filter((c) => /^Python \d+\.\d+/.test(c.name))
      pythons.sort((a, b) => compareSemver(b.semver, a.semver))
      return pythons[0]
    }
    if (lang === 'rust') {
      // 选择最新稳定版 rustc（排除 nightly / trunk / 非标准 fork）
      const rustcs = compilers.filter(
        (c) => /^rustc \d+\.\d+/.test(c.name) && !/nightly|trunk|assertions|unknown/i.test(c.name),
      )
      rustcs.sort((a, b) => compareSemver(b.semver, a.semver))
      return rustcs[0]
    }
    const candidates = compilers.filter(
      (c) => /x86-64 gcc/i.test(c.name) && !/assertions/i.test(c.name) && !/unknown/i.test(c.name),
    )
    candidates.sort((a, b) => compareSemver(b.semver, a.semver))
    return candidates[0] ?? compilers.find((c) => /gcc/i.test(c.name))
  }
}

function joinText(blocks?: CeTextBlock[]): string {
  // Godbolt 对部分语言（如 Rust）按行分块，text 内不含换行；
  // 对 C/C++ 则是整段含换行。统一补换行避免拼接后挤在一起。
  return (blocks ?? [])
    .map((b) => (b.text.endsWith('\n') ? b.text : b.text + '\n'))
    .join('')
}

// CSI 转义序列：ESC [ 参数... 终结符（含 SGR 颜色 m、清行 K 等）
const ANSI_ESCAPE = /\u001b\[[0-9;?]*[a-zA-Z]/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, '')
}

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
