import type { ConfigStore } from './config-store.js'
import type { ParamRule } from './types.js'

export class ParamCleaner {
  private store: ConfigStore

  constructor(store: ConfigStore) {
    this.store = store
  }

  clean(payload: Record<string, unknown>): Record<string, unknown> {
    const rules = this.store.getParamRules().filter(r => r.enabled)
    if (rules.length === 0) return { ...payload }

    const result = { ...payload }

    for (const rule of rules) {
      switch (rule.type) {
        case 'strip':
          delete result[rule.param_name]
          break
        case 'normalize':
          if (rule.param_name in result) {
            result[rule.param_name] = this.normalizeValue(result[rule.param_name], rule)
          }
          break
        case 'inject':
          if (rule.action_json.condition === 'always') {
            result[rule.param_name] = rule.action_json.value
          }
          break
      }
    }

    return result
  }

  private normalizeValue(value: unknown, rule: ParamRule): unknown {
    const action = rule.action_json

    if (action.type === 'boolean') {
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1'
      return Boolean(value)
    }

    if (action.type === 'number') {
      let num = typeof value === 'number' ? value : Number(value)
      if (isNaN(num)) num = 0
      const min = typeof action.min === 'number' ? action.min : -Infinity
      const max = typeof action.max === 'number' ? action.max : Infinity
      return Math.max(min, Math.min(max, num))
    }

    return value
  }
}