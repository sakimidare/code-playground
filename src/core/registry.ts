import type { CompilerEngine, LanguageSpec } from './types'

export class EngineRegistry {
  private engines = new Map<string, CompilerEngine>()

  register(engine: CompilerEngine): void {
    if (this.engines.has(engine.id)) {
      throw new Error(`Engine already registered: ${engine.id}`)
    }
    this.engines.set(engine.id, engine)
  }

  get(id: string): CompilerEngine | undefined {
    return this.engines.get(id)
  }

  all(): CompilerEngine[] {
    return [...this.engines.values()]
  }

  /** 获取支持指定语言的引擎 */
  forLanguage(languageId: string): CompilerEngine[] {
    return this.all().filter((e) => e.supportedLanguages.includes(languageId))
  }
}

export class LanguageRegistry {
  private languages = new Map<string, LanguageSpec>()

  register(language: LanguageSpec): void {
    if (this.languages.has(language.id)) {
      throw new Error(`Language already registered: ${language.id}`)
    }
    this.languages.set(language.id, language)
  }

  get(id: string): LanguageSpec | undefined {
    return this.languages.get(id)
  }

  all(): LanguageSpec[] {
    return [...this.languages.values()]
  }
}

export const engineRegistry = new EngineRegistry()
export const languageRegistry = new LanguageRegistry()
