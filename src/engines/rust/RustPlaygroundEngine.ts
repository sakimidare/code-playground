import type {
  CompilerEngine,
  EngineCapabilities,
  RunRequest,
  RunResult,
} from '../../core/types'
import { makeCapabilities } from '../../core/capabilities'

const RUST_PLAY_ENDPOINT = 'https://play.rust-lang.org/evaluate.json'
const RUST_WS_URL = 'wss://play.rust-lang.org/websocket'

export type RustChannel = 'stable' | 'beta' | 'nightly'
export type RustEdition = '2015' | '2018' | '2021' | '2024'
export type RustOptimize = '0' | '1' | '2' | '3' | 's' | 'z'

export interface RustPlaygroundEngineOptions {
  endpoint?: string
  /** WebSocket 地址（默认官方） */
  wsUrl?: string
  /** 通道：stable / beta / nightly，默认 stable */
  channel?: RustChannel
  /** 编译优化级别，默认 '0'（debug） */
  optimize?: RustOptimize
  /** 请求超时（默认 60s，首次编译较慢） */
  requestTimeoutMs?: number
}

interface EvaluateResponse {
  result?: string
  error?: string | null
}

/**
 * 在线编译引擎：Rust 官方 Playground（play.rust-lang.org）。
 *
 * - 有 stdin 时走 WebSocket 交互（支持标准输入）
 * - 无 stdin 时走 evaluate.json（简单稳定）
 * - 通过 result / error 或 ws 消息区分成功、编译错误、运行时 panic
 */
export class RustPlaygroundEngine implements CompilerEngine {
  readonly id = 'rust-play'
  readonly name = '在线编译 (Rust Playground)'
  readonly kind = 'online' as const
  readonly description = '调用 Rust 官方 Playground 在线编译运行，支持 stdin（WebSocket）'
  readonly supportedLanguages = ['rust'] as const
  readonly supportsStdin = true

  private readonly endpoint: string
  private readonly wsUrl: string
  private readonly channel: RustChannel
  private readonly optimize: RustOptimize
  private readonly requestTimeoutMs: number

  private readonly caps: (languageId: string) => EngineCapabilities = makeCapabilities(
    { stdin: true },
    {
      rust: {
        stdin: true,
        stdinHint: 'Rust Playground 通过 WebSocket 支持 stdin 输入',
        limitationHint: '在线编译，排队较慢',
      },
    },
  )

  capabilitiesFor(languageId: string): EngineCapabilities {
    return this.caps(languageId)
  }

  constructor(options: RustPlaygroundEngineOptions = {}) {
    this.endpoint = options.endpoint ?? RUST_PLAY_ENDPOINT
    this.wsUrl = options.wsUrl ?? RUST_WS_URL
    this.channel = options.channel ?? 'stable'
    this.optimize = options.optimize ?? '0'
    this.requestTimeoutMs = options.requestTimeoutMs ?? 60_000
  }

  async run(request: RunRequest): Promise<RunResult> {
    // 有 stdin 时用 WebSocket（官方 stdin 走交互式协议）
    if (request.stdin && request.stdin.trim().length > 0) {
      return this.runWithStdin(request)
    }
    return this.runEvaluate(request)
  }

  /** 无 stdin：evaluate.json 简单路径 */
  private async runEvaluate(request: RunRequest): Promise<RunResult> {
    const start = Date.now()
    const progress = request.onProgress
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    try {
      progress?.('uploading', '提交到 Rust Playground 编译运行…')
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: this.channel,
          optimize: this.optimize,
          edition: '2021',
          code: request.code,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Rust Playground API 请求失败：HTTP ${res.status}`)
      }

      const data = (await res.json()) as EvaluateResponse
      const result = data.result ?? ''
      const error = data.error

      if (error != null && error.trim().length > 0) {
        return this.parseError(result, error, Date.now() - start)
      }

      return {
        stdout: result,
        stderr: '',
        exitCode: 0,
        timedOut: false,
        compileError: false,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      if (controller.signal.aborted) {
        return {
          stdout: '',
          stderr: '请求超时（Rust Playground 服务不可用或网络问题）',
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

  /** 有 stdin：WebSocket 交互协议 */
  private runWithStdin(request: RunRequest): Promise<RunResult> {
    const start = Date.now()
    const timeoutMs = request.timeoutMs ?? this.requestTimeoutMs
    const stdin = request.stdin ?? ''
    const progress = request.onProgress

    return new Promise<RunResult>((resolve) => {
      const ws = new WebSocket(this.wsUrl)
      let seq = -1
      const next = () => ++seq
      const execSeq = 1
      let stdout = ''
      let stderr = ''
      let settled = false
      let stdinSent = false

      const finish = (result: RunResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          ws.close()
        } catch {
          /* ignore */
        }
        resolve(result)
      }

      const timer = setTimeout(() => {
        finish({
          stdout,
          stderr: stderr || '运行超时（可能为死循环）',
          exitCode: null,
          timedOut: true,
          compileError: false,
          durationMs: Date.now() - start,
        })
      }, timeoutMs)

      const send = (type: string, payload: unknown, s?: number) => {
        if (ws.readyState !== WebSocket.OPEN) return
        ws.send(
          JSON.stringify({
            type,
            payload,
            meta: { websocket: true, sequenceNumber: s ?? next() },
          }),
        )
      }

      ws.onopen = () => {
        // seq 从 0 开始；stdin 的 sequenceNumber 必须与执行请求相同（=1）
        progress?.('waiting', '连接 Rust Playground…')
        send('websocket/connected', { iAcceptThisIsAnUnsupportedApi: true })
        send('output/execute/wsExecuteRequest', {
          channel: this.channel,
          mode: this.optimize === '0' ? 'debug' : 'release',
          edition: '2021',
          crateType: 'bin',
          tests: false,
          code: request.code,
          backtrace: false,
        })
      }

      ws.onmessage = (ev: MessageEvent) => {
        let d: { type: string; payload?: unknown }
        try {
          d = JSON.parse(ev.data as string)
        } catch {
          return
        }
        switch (d.type) {
          case 'output/execute/wsExecuteStdout':
            stdout += (d.payload as string) ?? ''
            break
          case 'output/execute/wsExecuteStderr': {
            const text = (d.payload as string) ?? ''
            stderr += text
            if (text.includes('Compiling')) {
              progress?.('compiling', '编译中…')
            }
            if (text.includes('Running')) {
              progress?.('running', '运行中…')
            }
            // 程序启动后发送 stdin（read_line 需要换行，发完 close 表示 EOF）
            if (!stdinSent && stdin && text.includes('Running')) {
              stdinSent = true
              setTimeout(() => {
                const data = stdin.endsWith('\n') ? stdin : stdin + '\n'
                send('output/execute/wsExecuteStdin', data, execSeq)
                send('output/execute/wsExecuteStdinClose', undefined, execSeq)
              }, 200)
            }
            break
          }
          case 'output/execute/wsExecuteEnd': {
            const p = d.payload as { success?: boolean; exitDetail?: string } | undefined
            finish(this.parseWsEnd(p, stdout, stderr, Date.now() - start))
            break
          }
        }
      }

      ws.onerror = () => {
        finish({
          stdout,
          stderr: stderr || 'WebSocket 连接失败',
          exitCode: null,
          timedOut: true,
          compileError: false,
          durationMs: Date.now() - start,
        })
      }
    })
  }

  private parseWsEnd(
    end: { success?: boolean; exitDetail?: string } | undefined,
    stdout: string,
    stderr: string,
    durationMs: number,
  ): RunResult {
    if (end?.success === false) {
      return this.parseError(stdout, stderr || end.exitDetail || '', durationMs)
    }
    return {
      stdout,
      // 保留编译过程信息（Compiling / Finished / Running），与 Godbolt 行为一致
      stderr,
      exitCode: 0,
      timedOut: false,
      compileError: false,
      durationMs,
    }
  }

  private parseError(result: string, error: string, durationMs: number): RunResult {
    const isCompileError = /^error\[|error: could not compile|^\s*error\b/m.test(error)
    const isPanic = /panicked at|thread '.*' panicked/.test(error)
    return {
      stdout: isPanic ? '' : result,
      stderr: error,
      exitCode: isPanic ? 1 : isCompileError ? null : 1,
      timedOut: false,
      compileError: isCompileError,
      compileMessage: isCompileError ? error : undefined,
      durationMs,
    }
  }
}
