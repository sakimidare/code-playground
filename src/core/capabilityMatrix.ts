import { engineRegistry, languageRegistry } from './registry'
import type { CompilerEngine, EngineCapabilities, LanguageSpec } from './types'

export interface EngineLanguagePair {
  language: LanguageSpec
  engine: CompilerEngine
  capabilities: EngineCapabilities
}

/**
 * 返回所有 <语言-引擎> 能力对。
 * 供外部（文档、管理界面、日志）展示每个组合是否支持 stdin。
 */
export function getCapabilityMatrix(): EngineLanguagePair[] {
  const pairs: EngineLanguagePair[] = []
  for (const language of languageRegistry.all()) {
    for (const engine of engineRegistry.all()) {
      if (engine.supportedLanguages.includes(language.id)) {
        pairs.push({
          language,
          engine,
          capabilities: engine.capabilitiesFor(language.id),
        })
      }
    }
  }
  return pairs
}

/**
 * 生成能力矩阵的 Markdown 表格（供 README 等展示）。
 */
export function capabilityMatrixToMarkdown(): string {
  const pairs = getCapabilityMatrix()
  const rows = pairs.map(
    ({ language, engine, capabilities }) =>
      `| ${language.label} | ${engine.name} | ${capabilities.stdin ? '✅' : '❌'} |`,
  )
  return ['| 语言 | 引擎 | 支持 stdin |', '| --- | --- | --- |', ...rows].join('\n')
}
