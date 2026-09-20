import { useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import type { CompilerEngine, LanguageSpec, RunResult } from '../core/types'
import { engineRegistry, languageRegistry } from '../core/registry'
import { Toolbar } from './Toolbar'
import { OutputPanel } from './OutputPanel'

export interface CodePlaygroundProps {
  /** 初始/固定语言 id（默认 'cpp'） */
  initialLanguage?: string
  /** 固定语言：为 true 时隐藏语言下拉框，始终使用 initialLanguage */
  lockLanguage?: boolean
  /** 默认引擎 id（未指定时取该语言支持的第一个引擎） */
  defaultEngine?: string
  /** 固定引擎：为 true 时隐藏引擎下拉框 */
  lockEngine?: boolean
  /** 默认代码（未提供时使用语言模板） */
  defaultCode?: string
  /** 默认 stdin 输入 */
  defaultStdin?: string
  /** 代码只读（不可编辑） */
  readOnly?: boolean
  /** 禁用 stdin 输入 */
  disableStdin?: boolean
  /** 运行完成回调 */
  onRunComplete?: (result: RunResult) => void
  className?: string
}

export function CodePlayground(props: CodePlaygroundProps) {
  const {
    initialLanguage = 'cpp',
    lockLanguage = false,
    defaultEngine,
    lockEngine = false,
    defaultCode,
    defaultStdin,
    readOnly = false,
    disableStdin = false,
    onRunComplete,
    className,
  } = props

  const languages = useMemo(() => languageRegistry.all(), [])
  const engines = useMemo(() => engineRegistry.all(), [])

  const initialLang = languageRegistry.get(initialLanguage) ?? languages[0]

  /** 按语言挑选默认引擎：defaultEngine > 该语言第一个引擎 */
  function pickEngine(langId: string, candidates: CompilerEngine[]): CompilerEngine | undefined {
    const wanted = defaultEngine ? engineRegistry.get(defaultEngine) : undefined
    if (wanted && wanted.supportedLanguages.includes(langId)) return wanted
    return candidates[0]
  }

  const [language, setLanguage] = useState<LanguageSpec>(initialLang)

  const availableEngines = useMemo(
    () => engines.filter((e) => e.supportedLanguages.includes(language.id)),
    [engines, language],
  )
  const [engine, setEngine] = useState<CompilerEngine | undefined>(() =>
    pickEngine(initialLang.id, availableEngines),
  )
  const [code, setCode] = useState<string>(defaultCode ?? initialLang.template)
  const [stdin, setStdin] = useState<string>(defaultStdin ?? '')
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ stage: string; detail?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const engineAvailable = engine !== undefined
  const stdinEnabled = !disableStdin && (engine?.capabilitiesFor(language.id).stdin ?? false)
  const caps = engine?.capabilitiesFor(language.id)

  async function handleRun() {
    if (!engine || running) return
    setRunning(true)
    setError(null)
    setResult(null)
    setProgress(null)
    try {
      const r = await engine.run({
        languageId: language.id,
        code,
        stdin: stdinEnabled ? stdin : '',
        onProgress: (stage, detail) => setProgress({ stage, detail }),
      })
      setResult(r)
      onRunComplete?.(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      setProgress(null)
    }
  }

  function handleLanguageChange(lang: LanguageSpec) {
    if (lockLanguage) return
    setLanguage(lang)
    setCode(defaultCode ?? lang.template)
    setResult(null)
    setError(null)
    const candidates = engines.filter((e) => e.supportedLanguages.includes(lang.id))
    setEngine(pickEngine(lang.id, candidates))
  }

  return (
    <div className={className ? `code-playground ${className}` : 'code-playground'}>
      <Toolbar
        languages={languages}
        language={language}
        engines={availableEngines}
        engine={engine}
        running={running}
        engineAvailable={engineAvailable}
        lockLanguage={lockLanguage}
        lockEngine={lockEngine}
        onLanguageChange={handleLanguageChange}
        onEngineChange={setEngine}
        onRun={handleRun}
      />

      <div className="playground-main">
        <div className="editor-pane">
          <Editor
            height="100%"
            language={language.monacoLanguage}
            value={code}
            onChange={(v) => {
              if (!readOnly) setCode(v ?? '')
            }}
            theme="vs-dark"
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              tabSize: 2,
              automaticLayout: true,
              readOnly,
            }}
          />
        </div>
        <div className="side-pane">
          {!disableStdin && (
            <label className="pane-label">
              标准输入 (stdin)
              <textarea
                className="stdin-input"
                value={stdin}
                onChange={(e) => setStdin(e.target.value)}
                placeholder={supportsStdinPlaceholder(engine, language)}
                rows={3}
                disabled={!stdinEnabled}
              />
            </label>
          )}
          {!stdinEnabled && caps?.stdinHint && (
            <div className="cap-hint">{caps.stdinHint}</div>
          )}
          {error && <div className="error-box">{error}</div>}
          {progress && (
            <div className="progress-box">
              <span className="spinner" aria-hidden="true" />
              <span>{progress.detail ?? progress.stage}</span>
            </div>
          )}
          {result && <OutputPanel result={result} />}
        </div>
      </div>
    </div>
  )
}

function supportsStdinPlaceholder(engine: CompilerEngine | undefined, language: LanguageSpec): string {
  if (!engine) return ''
  if (!engine.capabilitiesFor(language.id).stdin) return '该编译器组合不支持 stdin'
  return '例如：\n5 7'
}
