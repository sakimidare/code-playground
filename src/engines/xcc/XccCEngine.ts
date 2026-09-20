import type { CompilerEngine, EngineCapabilities, RunRequest, RunResult } from '../../core/types'
import { makeCapabilities } from '../../core/capabilities'
// 内联 worker：worker（含 libc + wasm）随库一起打包，避免消费方构建后路径失效
import XccWorker from './xcc.worker.ts?worker&inline'

export interface XccEngineOptions {
  /** 编译阶段超时（默认 30s，XCC 通常毫秒级） */
  compileTimeoutMs?: number
  /** 运行阶段超时，默认 10s；可被 RunRequest.timeoutMs 覆盖 */
  runTimeoutMs?: number
}

type WorkerMessage =
  | { id: number; phase: 'compiling' }
  | { id: number; phase: 'compiled' }
  | {
      id: number
      phase: 'done'
      compileError: boolean
      compileMessage?: string
      stdout?: string
      stderr?: string
      exitCode?: number
      fatal?: boolean
      message?: string
    }

interface Pending {
  resolve: (result: RunResult) => void
  reject: (err: Error) => void
  phase: 'compile' | 'run'
  timer: ReturnType<typeof setTimeout>
  startTime: number
}

/**
 * 本地编译引擎：XCC C 编译器（WASM 版，~130KB）。
 *
 * 编译毫秒级，远快于 clang。运行在 Web Worker 中，同步 wasm 执行
 * 不会阻塞主线程，死循环通过超时 terminate worker 判定为 TLE。
 *
 * 注意：仅支持 C（不是 C++）。
 */
export class XccCEngine implements CompilerEngine {
  readonly id = 'xcc'
  readonly name = '本地编译 (XCC)'
  readonly kind = 'local' as const
  readonly description = '浏览器内轻量 XCC C 编译器（~130KB），编译毫秒级；仅支持 C 语言'
  readonly supportedLanguages = ['c'] as const
  readonly supportsStdin = true

  private readonly compileTimeoutMs: number
  private readonly runTimeoutMs: number
  private worker: Worker | null = null
  private busy = false
  private requestId = 0
  private pending: Pending | null = null

  private readonly caps: (languageId: string) => EngineCapabilities = makeCapabilities(
    { stdin: true },
    {
      c: {
        stdin: true,
        stdinHint: 'XCC 支持 scanf / getchar 读取标准输入',
        limitationHint: '仅支持 C；轻量编译器，高级特性有限',
      },
    },
  )

  capabilitiesFor(languageId: string): EngineCapabilities {
    return this.caps(languageId)
  }

  constructor(options: XccEngineOptions = {}) {
    this.compileTimeoutMs = options.compileTimeoutMs ?? 30_000
    this.runTimeoutMs = options.runTimeoutMs ?? 10_000
  }

  run(request: RunRequest): Promise<RunResult> {
    if (this.busy) {
      return Promise.reject(new Error('该引擎正在执行任务，请稍后再试'))
    }
    this.busy = true
    const id = ++this.requestId
    const worker = this.getWorker()

    return new Promise<RunResult>((resolve, reject) => {
      const timer = setTimeout(
        () => this.finishTimedOut('编译超时'),
        this.compileTimeoutMs,
      )
      this.pending = { resolve, reject, phase: 'compile', timer, startTime: Date.now() }
      worker.postMessage({ id, code: request.code, stdin: request.stdin ?? '' })
    }).finally(() => {
      this.busy = false
      this.pending = null
    })
  }

  private getWorker(): Worker {
    if (!this.worker) {
      const worker = new XccWorker()
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => this.onMessage(e.data)
      worker.onerror = () => {
        const p = this.pending
        this.killWorker()
        if (p) {
          clearTimeout(p.timer)
          p.reject(new Error('本地编译 Worker 崩溃'))
        }
      }
      this.worker = worker
    }
    return this.worker
  }

  private onMessage(msg: WorkerMessage): void {
    const p = this.pending
    if (!p || msg.id !== this.requestId) return

    switch (msg.phase) {
      case 'compiling':
        break
      case 'compiled': {
        clearTimeout(p.timer)
        p.phase = 'run'
        p.timer = setTimeout(() => this.finishTimedOut('运行超时（可能为死循环）'), this.runTimeoutMs)
        break
      }
      case 'done': {
        clearTimeout(p.timer)
        if (msg.fatal) {
          this.killWorker()
          p.reject(new Error(msg.message ?? '本地引擎内部错误'))
          return
        }
        if (msg.compileError) {
          p.resolve({
            stdout: '',
            stderr: '',
            exitCode: null,
            timedOut: false,
            compileError: true,
            compileMessage: msg.compileMessage ?? '',
            durationMs: Date.now() - p.startTime,
          })
        } else {
          p.resolve({
            stdout: msg.stdout ?? '',
            stderr: msg.stderr ?? '',
            exitCode: msg.exitCode ?? 0,
            timedOut: false,
            compileError: false,
            durationMs: Date.now() - p.startTime,
          })
        }
        break
      }
    }
  }

  private finishTimedOut(message: string): void {
    const p = this.pending
    if (!p) return
    clearTimeout(p.timer)
    this.killWorker()
    p.resolve({
      stdout: '',
      stderr: message,
      exitCode: null,
      timedOut: true,
      compileError: false,
      durationMs: Date.now() - p.startTime,
    })
  }

  private killWorker(): void {
    this.worker?.terminate()
    this.worker = null
  }
}
