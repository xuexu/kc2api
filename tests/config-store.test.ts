import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { ConfigStore, runMigrations } from '../src/config-store.js'

let db: Database.Database
let store: ConfigStore

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  store = new ConfigStore(db)
})

afterEach(() => {
  db.close()
})

describe('ConfigStore initialization', () => {
  it('should create all tables via migration', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('accounts')
    expect(names).toContain('model_aliases')
    expect(names).toContain('hidden_models')
    expect(names).toContain('settings')
    expect(names).toContain('param_rules')
    expect(names).toContain('schema_version')
  })

  it('should insert default settings row', () => {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'default_model'").get() as { value: string }
    expect(row).toBeTruthy()
    expect(row.value).toBe('')
  })

  it('should set schema_version to 1', () => {
    const row = db.prepare("SELECT version FROM schema_version").get() as { version: number }
    expect(row.version).toBe(1)
  })
})

describe('ConfigStore accounts', () => {
  it('should create an account', () => {
    const account = store.createAccount({
      name: 'Test Account',
      api_key: 'sk-test-123',
      base_url: 'https://example.com',
      weight: 5,
      tags: ['production', 'us-east'],
    })
    expect(account.id).toBeTruthy()
    expect(account.name).toBe('Test Account')
    expect(account.api_key).toBe('sk-test-123')
    expect(account.base_url).toBe('https://example.com')
    expect(account.weight).toBe(5)
    expect(account.tags).toEqual(['production', 'us-east'])
    expect(account.fail_count).toBe(0)
    expect(account.cooldown_until).toBeNull()
  })

  it('should create an account with defaults', () => {
    const account = store.createAccount({ name: 'Min', api_key: 'sk-min' })
    expect(account.base_url).toBe('https://llm.kimchi.dev')
    expect(account.weight).toBe(1)
    expect(account.tags).toEqual([])
  })

  it('should get all accounts', () => {
    store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.createAccount({ name: 'B', api_key: 'sk-b' })
    const accounts = store.getAccounts()
    expect(accounts).toHaveLength(2)
  })

  it('should get account by id', () => {
    const created = store.createAccount({ name: 'A', api_key: 'sk-a' })
    const found = store.getAccount(created.id)
    expect(found).toBeTruthy()
    expect(found!.name).toBe('A')
  })

  it('should return undefined for non-existent account', () => {
    expect(store.getAccount('nonexistent')).toBeUndefined()
  })

  it('should update an account', async () => {
    const created = store.createAccount({ name: 'Old', api_key: 'sk-old' })
    await new Promise(r => setTimeout(r, 5))
    const updated = store.updateAccount(created.id, { name: 'New', weight: 10 })
    expect(updated.name).toBe('New')
    expect(updated.weight).toBe(10)
    expect(updated.api_key).toBe('sk-old')
    expect(updated.updated_at).not.toBe(created.updated_at)
  })

  it('should throw when updating non-existent account', () => {
    expect(() => store.updateAccount('nonexistent', { name: 'X' })).toThrow()
  })

  it('should delete an account', () => {
    const created = store.createAccount({ name: 'ToDelete', api_key: 'sk-del' })
    store.deleteAccount(created.id)
    expect(store.getAccount(created.id)).toBeUndefined()
  })

  it('should throw when deleting non-existent account', () => {
    expect(() => store.deleteAccount('nonexistent')).toThrow()
  })
})

describe('ConfigStore model aliases', () => {
  it('should create an alias', () => {
    const alias = store.createAlias('gpt-4', 'openai/gpt-4.1')
    expect(alias.alias).toBe('gpt-4')
    expect(alias.target).toBe('openai/gpt-4.1')
  })

  it('should reject duplicate alias', () => {
    store.createAlias('gpt-4', 'openai/gpt-4.1')
    expect(() => store.createAlias('gpt-4', 'openai/gpt-4o')).toThrow()
  })

  it('should get all aliases', () => {
    store.createAlias('a', 'x')
    store.createAlias('b', 'y')
    expect(store.getAliases()).toHaveLength(2)
  })

  it('should resolve alias to target', () => {
    store.createAlias('gpt-4', 'openai/gpt-4.1')
    expect(store.resolveAlias('gpt-4')).toBe('openai/gpt-4.1')
    expect(store.resolveAlias('unknown')).toBe('unknown')
  })

  it('should delete alias', () => {
    const a = store.createAlias('a', 'x')
    store.deleteAlias(a.id)
    expect(store.getAliases()).toHaveLength(0)
  })
})

describe('ConfigStore hidden models', () => {
  it('should add and get hidden slugs', () => {
    store.addHiddenModel('openai/gpt-4.1')
    store.addHiddenModel('anthropic/claude-3')
    const slugs = store.getHiddenSlugs()
    expect(slugs.has('openai/gpt-4.1')).toBe(true)
    expect(slugs.has('anthropic/claude-3')).toBe(true)
  })

  it('should reject duplicate hidden model', () => {
    store.addHiddenModel('openai/gpt-4.1')
    expect(() => store.addHiddenModel('openai/gpt-4.1')).toThrow()
  })

  it('should remove hidden model', () => {
    store.addHiddenModel('openai/gpt-4.1')
    store.removeHiddenModel('openai/gpt-4.1')
    expect(store.getHiddenSlugs().size).toBe(0)
  })
})

describe('ConfigStore settings', () => {
  it('should get default setting', () => {
    expect(store.getSetting('default_model')).toBe('')
  })

  it('should set and get setting', () => {
    store.setSetting('default_model', 'openai/gpt-4.1')
    expect(store.getSetting('default_model')).toBe('openai/gpt-4.1')
  })
})

describe('ConfigStore param rules', () => {
  it('should create a strip rule', () => {
    const rule = store.createRule({ type: 'strip', param_name: 'logit_bias' })
    expect(rule.type).toBe('strip')
    expect(rule.param_name).toBe('logit_bias')
    expect(rule.enabled).toBe(true)
  })

  it('should create a normalize rule', () => {
    const rule = store.createRule({
      type: 'normalize',
      param_name: 'temperature',
      action_json: { min: 0, max: 2, type: 'number' },
    })
    expect(rule.action_json).toEqual({ min: 0, max: 2, type: 'number' })
  })

  it('should create an inject rule', () => {
    const rule = store.createRule({
      type: 'inject',
      param_name: 'tags',
      action_json: { value: ['phase:relay'], condition: 'always' },
    })
    expect(rule.action_json).toEqual({ value: ['phase:relay'], condition: 'always' })
  })

  it('should get all rules sorted by priority', () => {
    store.createRule({ type: 'strip', param_name: 'b', priority: 5 })
    store.createRule({ type: 'strip', param_name: 'a', priority: 1 })
    store.createRule({ type: 'strip', param_name: 'c', priority: 10 })
    const rules = store.getParamRules()
    expect(rules[0].param_name).toBe('a')
    expect(rules[1].param_name).toBe('b')
    expect(rules[2].param_name).toBe('c')
  })

  it('should update a rule', () => {
    const rule = store.createRule({ type: 'strip', param_name: 'x' })
    const updated = store.updateRule(rule.id, { enabled: false, param_name: 'y' })
    expect(updated.enabled).toBe(false)
    expect(updated.param_name).toBe('y')
  })

  it('should delete a rule', () => {
    const rule = store.createRule({ type: 'strip', param_name: 'x' })
    store.deleteRule(rule.id)
    expect(store.getParamRules()).toHaveLength(0)
  })
})

describe('ConfigStore fault tracking', () => {
  it('should record account failure and increment fail_count', () => {
    const account = store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.recordAccountFailure(account.id)
    const updated = store.getAccount(account.id)!
    expect(updated.fail_count).toBe(1)
  })

  it('should set cooldown after 3 consecutive failures', () => {
    const account = store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.recordAccountFailure(account.id)
    store.recordAccountFailure(account.id)
    store.recordAccountFailure(account.id)
    const updated = store.getAccount(account.id)!
    expect(updated.fail_count).toBe(3)
    expect(updated.cooldown_until).toBeTruthy()
    const cooldownTime = new Date(updated.cooldown_until!).getTime()
    const now = Date.now()
    expect(cooldownTime).toBeGreaterThan(now)
    expect(cooldownTime - now).toBeLessThan(35000)
  })

  it('should reset fail_count on success', () => {
    const account = store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.recordAccountFailure(account.id)
    store.recordAccountFailure(account.id)
    store.recordAccountSuccess(account.id)
    const updated = store.getAccount(account.id)!
    expect(updated.fail_count).toBe(0)
    expect(updated.cooldown_until).toBeNull()
  })
})