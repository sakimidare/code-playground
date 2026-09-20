import type { EngineCapabilities } from './types'

/**
 * 引擎能力声明表：languageId -> 能力。
 * 引擎用它声明每个语言的具体 stdin 支持情况。
 */
export type CapabilityMap = Record<string, EngineCapabilities>

/**
 * 构造一个 capabilitiesFor 实现。
 *
 * @param defaults 引擎级默认能力（对未在 map 中声明的语言生效）
 * @param map      按语言细分的能力表
 */
export function makeCapabilities(
  defaults: EngineCapabilities,
  map: CapabilityMap = {},
): (languageId: string) => EngineCapabilities {
  return (languageId: string): EngineCapabilities => ({
    ...defaults,
    ...(map[languageId] ?? {}),
  })
}
