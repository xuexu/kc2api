import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { ConfigStore, runMigrations } from '../src/config-store.js'
import { ParamCleaner } from '../src/param-cleaner.js'

let db: Database.Database
let store: ConfigStore
let cleaner: ParamCleaner

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  store = new ConfigStore(db)
  cleaner = new ParamCleaner(store)
})

describe('ParamCleaner', () => {
  it('should return payload unchanged when no rules', () => {
    const payload = { model: 'gpt-4', temperature: 0.7 }
    expect(cleaner.clean(payload)).toEqual({ model: 'gpt-4', temperature: 0.7 })
  })

  it('should strip specified parameters', () => {
    store.createRule({ type: 'strip', param_name: 'logit_bias', priority: 1 })
    store.createRule({ type: 'strip', param_name: 'response_format', priority: 2 })
    const payload = { model: 'gpt-4', logit_bias: { 1: 5 }, response_format: 'json', temperature: 0.7 }
    const cleaned = cleaner.clean(payload)
    expect(cleaned).toEqual({ model: 'gpt-4', temperature: 0.7 })
    expect(cleaned.logit_bias).toBeUndefined()
    expect(cleaned.response_format).toBeUndefined()
  })

  it('should normalize number parameters within range', () => {
    store.createRule({
      type: 'normalize',
      param_name: 'temperature',
      action_json: { min: 0, max: 2, type: 'number' },
      priority: 1,
    })
    expect(cleaner.clean({ temperature: 3 }).temperature).toBe(2)
    expect(cleaner.clean({ temperature: -1 }).temperature).toBe(0)
    expect(cleaner.clean({ temperature: 1.5 }).temperature).toBe(1.5)
    expect(cleaner.clean({ temperature: 'abc' }).temperature).toBe(0)
  })

  it('should normalize boolean parameters', () => {
    store.createRule({
      type: 'normalize',
      param_name: 'stream',
      action_json: { type: 'boolean' },
      priority: 1,
    })
    expect(cleaner.clean({ stream: 'true' }).stream).toBe(true)
    expect(cleaner.clean({ stream: 1 }).stream).toBe(true)
    expect(cleaner.clean({ stream: 0 }).stream).toBe(false)
    expect(cleaner.clean({ stream: 'false' }).stream).toBe(false)
  })

  it('should inject parameters', () => {
    store.createRule({
      type: 'inject',
      param_name: 'tags',
      action_json: { value: ['phase:relay'], condition: 'always' },
      priority: 10,
    })
    const cleaned = cleaner.clean({ model: 'gpt-4' })
    expect(cleaned.tags).toEqual(['phase:relay'])
  })

  it('should apply rules in priority order', () => {
    store.createRule({ type: 'strip', param_name: 'logit_bias', priority: 1 })
    store.createRule({ type: 'inject', param_name: 'tags', action_json: { value: ['x'], condition: 'always' }, priority: 10 })
    const cleaned = cleaner.clean({ model: 'gpt-4', logit_bias: { 1: 5 }, tags: ['original'] })
    expect(cleaned.logit_bias).toBeUndefined()
    expect(cleaned.tags).toEqual(['x'])
  })

  it('should skip disabled rules', () => {
    store.createRule({ type: 'strip', param_name: 'logit_bias', priority: 1 })
    const rules = store.getParamRules()
    store.updateRule(rules[0].id, { enabled: false })
    const cleaned = cleaner.clean({ model: 'gpt-4', logit_bias: { 1: 5 } })
    expect(cleaned.logit_bias).toEqual({ 1: 5 })
  })
})