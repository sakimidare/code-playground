/// <reference lib="webworker" />
import { libcContent } from './libcContent'
import xccWasmUrl from './xcc.wasm?url'

// 移植自 https://thomasmueller.github.io/bau-lang/wasm.html （XCC C 编译器 wasm 版）
// 增加 stdin 支持：FileSystem.read(fd=0) 从预置输入读取。

let output = ''

const Util = {
  decodeString(e: number, len?: number): string {
    const bytes = new Uint8Array(
      THIS.memory.buffer,
      e,
      len ?? THIS.memory.buffer.byteLength - e,
    )
    let s = 0
    while (s < bytes.length && bytes[s] !== 0) s++
    return new TextDecoder('utf-8').decode(bytes.subarray(0, s))
  },
  encode(e: string): Uint8Array {
    return new TextEncoder().encode(e)
  },
  putTerminal(e: string | number): void {
    output += e.toString()
  },
}

const THIS: {
  memory: WebAssembly.Memory
  encodedArgs: Uint8Array[]
  totalArgsBytes: number
  fs: FileSystem
  cwd: string
  stdinBytes: Uint8Array
  stdinRp: number
} = {
  memory: null as unknown as WebAssembly.Memory,
  encodedArgs: [],
  totalArgsBytes: 0,
  fs: null as unknown as FileSystem,
  cwd: '/',
  stdinBytes: new Uint8Array(0),
  stdinRp: 0,
}

const wasmImports = {
  c: {
    args_sizes_get(e: number, t: number): void {
      new Uint32Array(THIS.memory.buffer, e, 1)[0] = THIS.encodedArgs.length
      new Uint32Array(THIS.memory.buffer, t, 1)[0] = THIS.totalArgsBytes
    },
    args_get(e: number, t: number): void {
      const n = new Uint32Array(THIS.memory.buffer, e, THIS.encodedArgs.length)
      const r = new Uint8Array(THIS.memory.buffer, t, THIS.totalArgsBytes)
      let s = 0
      for (let i = 0; i < THIS.encodedArgs.length; ++i) {
        n[i] = t + s
        const o = THIS.encodedArgs[i]
        for (let j = 0; j < o.length; ++j) r[j + s] = o[j]
        r[o.length + s] = 0
        s += o.length + 1
      }
    },
    read(e: number, t: number, n: number): number {
      const r = new Uint8Array(THIS.memory.buffer, t, n)
      return THIS.fs.read(e, r)
    },
    write(e: number, t: number, n: number): number {
      const r = new Uint8Array(THIS.memory.buffer, t, n)
      return THIS.fs.write(e, r)
    },
    open(e: number, t: number, n: number): number {
      if (e === 0) return -1
      const r = Util.decodeString(e)
      if (r == null || r === '') return -1
      const o = r.length > 0 && r[0] === '/' ? r : `${THIS.cwd}${THIS.cwd === '/' ? '' : '/'}${r}`
      return THIS.fs.open(o, t, n)
    },
    close: (e: number) => THIS.fs.close(e),
    lseek: (e: number, t: number, n: number) => THIS.fs.lseek(e, t, n),
    unlink(e: number): number {
      const t = Util.decodeString(e)
      if (t == null || t === '') return -1
      const n = t.length > 0 && t[0] === '/' ? t : `${THIS.cwd}${THIS.cwd === '/' ? '' : '/'}${t}`
      THIS.fs.delete(n)
      return 0
    },
    _tmpfile: () => THIS.fs.tmpfile(),
    _getcwd(e: number, t: number): number {
      const n = Util.encode(THIS.cwd)
      const r = n.length
      if (r + 1 > t) return -34
      const o = new Uint8Array(THIS.memory.buffer, e, r + 1)
      for (let i = 0; i < r; ++i) o[i] = n[i]
      o[r] = 0
      return r + 1
    },
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    atan: Math.atan,
    sqrt: Math.sqrt,
    log: Math.log,
    exp: Math.exp,
    pow: Math.pow,
    fabs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    fmod: (e: number, t: number) => e % t,
    drand48: Math.random,
    erand48: Math.random,
    putstr(e: number): void {
      const t = Util.decodeString(e)
      Util.putTerminal(t)
    },
    puti: (e: number) => Util.putTerminal(e),
    exit(e: number): never {
      throw new Error(`Exit code: ${e}`)
    },
    _memcpy(e: number, t: number, n: number): void {
      new Uint8Array(THIS.memory.buffer).copyWithin(e, t, t + n)
    },
    _memset(e: number, t: number, n: number): void {
      const r = new Uint8Array(THIS.memory.buffer)
      for (let s = 0; s < n; ++s) r[e++] = t
    },
  },
  env: {
    get memory(): WebAssembly.Memory {
      return THIS.memory
    },
  },
}

class WaStorage {
  files: Record<string, Uint8Array> = {}
  putFile(e: string, t: string | Uint8Array): void {
    if (typeof t === 'string') t = Util.encode(t)
    this.files[e] = t
  }
  getFile(e: string): Uint8Array | undefined {
    return this.files[e]
  }
  contains(e: string): boolean {
    return e in this.files
  }
  delete(e: string): void {
    delete this.files[e]
  }
}

class FileSystem {
  storage: WaStorage
  fileDescs: Array<{ absPath?: string; rp: number; write?: Uint8Array[]; writeTotal?: number } | string | null>
  tmpCounter = 0

  constructor(e: WaStorage) {
    this.storage = e
    this.fileDescs = ['stdin', 'stdout', 'stderr']
  }
  saveFile(e: string, t: string | Uint8Array): void {
    this.storage.putFile(e, t)
  }
  loadFile(e: string): Uint8Array | undefined {
    return this.storage.getFile(e)
  }
  open(e: string, t: number, _n: number): number {
    if (e == null || e.length === 0) return -1
    if ((3 & t) === 0 && !this.storage.contains(e)) return -1
    const r = this.allocFd()
    const o: { absPath: string; rp: number; write?: Uint8Array[]; writeTotal?: number } = {
      absPath: e,
      rp: 0,
    }
    if ((3 & t) !== 0) {
      o.write = []
      o.writeTotal = 0
    }
    this.fileDescs[r] = o
    return r
  }
  close(e: number): number {
    if (this.fileDescs[e] == null) return -1
    this.commitDesc(e)
    this.fileDescs[e] = null
    return 0
  }
  read(e: number, t: Uint8Array): number {
    if (e < 0 || e >= this.fileDescs.length) return 0
    if (e === 0) {
      // stdin：从预置输入读取
      if (THIS.stdinRp >= THIS.stdinBytes.length) return 0
      const s = Math.min(THIS.stdinBytes.length, THIS.stdinRp + t.length)
      t.set(THIS.stdinBytes.subarray(THIS.stdinRp, s))
      const o = s - THIS.stdinRp
      THIS.stdinRp = s
      return o
    }
    const n = this.fileDescs[e]
    if (n == null || typeof n === 'string') return 0
    const r = n.absPath != null ? this.storage.getFile(n.absPath) : (n.write ? concatBytes(n.write) : undefined)
    if (r == null || n.rp >= r.length) return 0
    const s = Math.min(r.length, n.rp + t.length)
    t.set(r.subarray(n.rp, s))
    const o = s - n.rp
    n.rp = s
    return o
  }
  write(e: number, t: Uint8Array): number {
    if (e < 0 || e >= this.fileDescs.length) return 0
    if (e < 3) {
      const n = new TextDecoder('utf-8').decode(t)
      if (e === 1 || e === 2) Util.putTerminal(n)
      return t.length
    }
    const n = this.fileDescs[e]
    if (n == null || typeof n === 'string') return 0
    n.write!.push(t.slice(0))
    n.writeTotal! += t.byteLength
    return t.length
  }
  lseek(e: number, t: number, n: number): number {
    const r = this.fileDescs[e]
    if (r == null || typeof r === 'string') return -1
    this.commitDesc(e)
    let s: number
    switch (n) {
      case 0:
        s = t
        break
      case 1:
        s = r.rp + t
        break
      case 2:
        const len = r.absPath != null ? (this.storage.getFile(r.absPath)?.length ?? 0) : r.writeTotal ?? 0
        s = len + t
        break
      default:
        return -1
    }
    if (s < 0) return -1
    r.rp = s
    return s
  }
  allocFd(): number {
    for (let i = 3; i < this.fileDescs.length; ++i) {
      if (this.fileDescs[i] == null) return i
    }
    this.fileDescs.push(null)
    return this.fileDescs.length - 1
  }
  commitDesc(e: number): void {
    const n = this.fileDescs[e]
    if (n == null || typeof n === 'string' || !n.write) return
    const w = concatBytes(n.write)
    this.storage.putFile(n.absPath!, w)
    n.write = []
    n.writeTotal = 0
  }
  tmpfile(): number {
    const r = this.allocFd()
    this.fileDescs[r] = { absPath: `/tmp/tmp${this.tmpCounter++}`, rp: 0, write: [], writeTotal: 0 }
    return r
  }
  delete(e: string): void {
    this.storage.delete(e)
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

function storeFiles(fileMap: Record<string, unknown>, path: string, storage: WaStorage): void {
  for (const [key, value] of Object.entries(fileMap)) {
    if (value instanceof Object && !(value instanceof Uint8Array)) {
      storeFiles(value as Record<string, unknown>, `${path}/${key}`, storage)
    } else {
      storage.putFile(`${path}/${key}`, value as string)
    }
  }
}

function setup(fs: FileSystem, cwd: string): void {
  THIS.cwd = cwd
  THIS.encodedArgs = []
  THIS.totalArgsBytes = 0
  THIS.fs = fs
}

function runCommand(args: string[], stdin: string): void {
  THIS.stdinBytes = Util.encode(stdin)
  THIS.stdinRp = 0
  THIS.encodedArgs = args.map((a) => Util.encode(a))
  THIS.totalArgsBytes = THIS.encodedArgs.reduce((sum, e) => sum + e.length + 1, 0)
  output = ''
  ;(instance.exports as { _start: () => void })._start()
}

let instance: { exports: { memory: WebAssembly.Memory; _start: () => void } }

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { id: number; code: string; stdin: string }
  try {
    const res = await fetch(xccWasmUrl)
    if (!res.ok) throw new Error(`加载 XCC 编译器失败：HTTP ${res.status}`)
    const xccWasm = new Uint8Array(await res.arrayBuffer())

    // ---- 编译 ----
    postMessage({ id: msg.id, phase: 'compiling' })
    const compiled = (await WebAssembly.instantiate(xccWasm, wasmImports)) as unknown as {
      instance: { exports: { memory: WebAssembly.Memory; _start: () => void } }
    }
    instance = compiled.instance
    THIS.memory = instance.exports.memory

    const storage = new WaStorage()
    storeFiles(libcContent, '', storage)
    storage.putFile('/hello.c', msg.code)
    setup(new FileSystem(storage), '/')

    let compileExit = 0
    try {
      runCommand(['cc', '-I/usr/include', '-L/usr/lib', 'hello.c'], '')
    } catch (e) {
      compileExit = extractExitCode(e)
    }
    const compileOutput = output

    const aWasm = THIS.fs.loadFile('/a.wasm')
    if (!(aWasm instanceof Uint8Array)) {
      postMessage({
        id: msg.id,
        phase: 'done',
        compileError: true,
        compileMessage: compileOutput || '编译失败（无错误输出）',
      })
      return
    }

    // ---- 运行 ----
    postMessage({ id: msg.id, phase: 'compiled' })
    const compiled2 = (await WebAssembly.instantiate(aWasm, wasmImports)) as unknown as {
      instance: { exports: { memory: WebAssembly.Memory; _start: () => void } }
    }
    instance = compiled2.instance
    THIS.memory = instance.exports.memory
    setup(new FileSystem(new WaStorage()), '/')

    let exitCode = 0
    try {
      runCommand(['a'], msg.stdin ?? '')
    } catch (e) {
      exitCode = extractExitCode(e)
    }
    const runOutput = output

    postMessage({
      id: msg.id,
      phase: 'done',
      compileError: false,
      stdout: runOutput,
      stderr: compileExit !== 0 ? compileOutput : '',
      exitCode,
    })
  } catch (err) {
    postMessage({
      id: msg.id,
      phase: 'done',
      compileError: false,
      fatal: true,
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

function extractExitCode(e: unknown): number {
  if (e instanceof Error) {
    const m = /Exit code: (\d+)/.exec(e.message)
    if (m) return parseInt(m[1], 10)
  }
  return -1
}
