import type { CompilerEngine, LanguageSpec } from '../core/types'

export interface ToolbarProps {
  languages: LanguageSpec[]
  language: LanguageSpec
  engines: CompilerEngine[]
  engine?: CompilerEngine
  running: boolean
  engineAvailable: boolean
  /** 固定语言：为 true 时禁用语言下拉框（仍显示当前语言） */
  lockLanguage?: boolean
  /** 固定引擎：为 true 时禁用引擎下拉框（仍显示当前引擎） */
  lockEngine?: boolean
  onLanguageChange: (lang: LanguageSpec) => void
  onEngineChange: (engine: CompilerEngine) => void
  onRun: () => void
}

export function Toolbar(props: ToolbarProps) {
  const {
    languages,
    language,
    engines,
    engine,
    running,
    engineAvailable,
    lockLanguage,
    lockEngine,
    onLanguageChange,
    onEngineChange,
    onRun,
  } = props

  return (
    <div className="toolbar">
      <label className="toolbar-field">
        语言
        {lockLanguage ? (
          <span className="toolbar-value" title={`语言已固定：${language.label}`}>
            {language.label}
          </span>
        ) : (
          <select
            value={language.id}
            onChange={(e) => {
              const lang = languages.find((l) => l.id === e.target.value)
              if (lang) onLanguageChange(lang)
            }}
          >
            {languages.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="toolbar-field">
        编译器
        {lockEngine || !engine ? (
          <span className="toolbar-value" title={engine?.description}>
            {engine?.name ?? '不可用'}
          </span>
        ) : (
          <select
            value={engine?.id ?? ''}
            disabled={!engineAvailable}
            onChange={(e) => {
              const en = engines.find((x) => x.id === e.target.value)
              if (en) onEngineChange(en)
            }}
          >
            {engines.map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </select>
        )}
      </label>

      <span
        className="engine-hint"
        title={engine?.description}
        data-local={engine?.kind === 'local' ? '1' : undefined}
      >
        {engine?.kind === 'local' ? '离线' : engine?.kind === 'online' ? '在线' : '不可用'}
      </span>
      {engine && engine.capabilitiesFor(language.id).limitationHint && (
        <span className="engine-limitation" title={engine.description}>
          {engine.capabilitiesFor(language.id).limitationHint}
        </span>
      )}

      <div className="toolbar-spacer" />

      <button
        className="btn btn-run"
        onClick={onRun}
        disabled={running || !engineAvailable}
      >
        {running ? '运行中…' : '运行'}
      </button>
    </div>
  )
}
