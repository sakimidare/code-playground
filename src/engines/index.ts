import { engineRegistry, languageRegistry } from '../core/registry'
import { defaultLanguages } from '../languages'
import { XccCEngine } from './xcc/XccCEngine'
import { GodboltEngine } from './godbolt/GodboltEngine'
import { RustPlaygroundEngine } from './rust/RustPlaygroundEngine'
import type { CompilerEngine, LanguageSpec } from '../core/types'

export { XccCEngine } from './xcc/XccCEngine'
export { GodboltEngine } from './godbolt/GodboltEngine'
export { RustPlaygroundEngine } from './rust/RustPlaygroundEngine'
export { engineRegistry, languageRegistry } from '../core/registry'
export type { CompilerEngine, LanguageSpec } from '../core/types'

export interface PlaygroundOptions {
  /** 注册额外的语言，会追加到默认语言之后 */
  extraLanguages?: LanguageSpec[]
  /** 注册额外的引擎插件 */
  extraEngines?: CompilerEngine[]
  /** 是否注册默认引擎（XCC 本地 + Godbolt 在线） */
  useDefaults?: boolean
}

/**
 * 初始化默认的语言与引擎注册表，可注入自定义插件。
 * 幂等：重复调用不会重复注册。
 */
export function registerDefaults(options: PlaygroundOptions = {}): void {
  const { extraLanguages = [], extraEngines = [], useDefaults = true } = options

  if (useDefaults) {
    for (const lang of defaultLanguages) {
      if (!languageRegistry.get(lang.id)) languageRegistry.register(lang)
    }
    if (!engineRegistry.get('xcc')) {
      engineRegistry.register(new XccCEngine())
    }
    if (!engineRegistry.get('godbolt')) {
      engineRegistry.register(new GodboltEngine())
    }
    if (!engineRegistry.get('rust-play')) {
      engineRegistry.register(new RustPlaygroundEngine())
    }
  }

  for (const lang of extraLanguages) {
    if (!languageRegistry.get(lang.id)) languageRegistry.register(lang)
  }
  for (const engine of extraEngines) {
    if (!engineRegistry.get(engine.id)) engineRegistry.register(engine)
  }
}
