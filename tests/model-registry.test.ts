import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { ConfigStore, runMigrations } from '../src/config-store.js'
import { ModelRegistry } from '../src/model-registry.js'
import type { KimchiModelMetadata } from '../src/types.js'

let db: Database.Database
let store: ConfigStore
let registry: ModelRegistry

const sampleModels: KimchiModelMetadata[] = [
  {
    slug: 'openai/gpt-4.1',
    display_name: 'GPT-4.1',
    provider: 'openai',
    reasoning: false,
    input_modalities: ['text'],
    is_serverless: true,
    limits: { context_window: 128000, max_output_tokens: 16384 },
    status: 'active',
  },
  {
    slug: 'anthropic/claude-3-opus',
    display_name: 'Claude 3 Opus',
    provider: 'anthropic',
    reasoning: false,
    input_modalities: ['text'],
    is_serverless: false,
    limits: { context_window: 200000, max_output_tokens: 4096 },
    status: 'active',
  },
  {
    slug: 'openai/gpt-4o',
    display_name: 'GPT-4o',
    provider: 'openai',
    reasoning: false,
    input_modalities: ['text', 'image'],
    is_serverless: true,
    limits: { context_window: 128000, max_output_tokens: 16384 },
    status: 'active',
  },
  {
    slug: 'sunset-model',
    display_name: 'Sunset Model',
    provider: 'old',
    reasoning: false,
    input_modalities: ['text'],
    is_serverless: false,
    limits: { context_window: 4096, max_output_tokens: 0 },
    status: 'sunset',
  },
]

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  store = new ConfigStore(db)
  registry = new ModelRegistry(store)
})

describe('ModelRegistry', () => {
  it('should filter sunset models and zero-output models', () => {
    const result = registry.enhanceModelList(sampleModels)
    const slugs = result.data.map(m => m.id)
    expect(slugs).toContain('openai/gpt-4.1')
    expect(slugs).toContain('anthropic/claude-3-opus')
    expect(slugs).toContain('openai/gpt-4o')
    expect(slugs).not.toContain('sunset-model')
  })

  it('should filter hidden models', () => {
    store.addHiddenModel('openai/gpt-4o')
    const result = registry.enhanceModelList(sampleModels)
    const slugs = result.data.map(m => m.id)
    expect(slugs).not.toContain('openai/gpt-4o')
    expect(slugs).toContain('openai/gpt-4.1')
  })

  it('should append aliases to model list', () => {
    store.createAlias('gpt-4', 'openai/gpt-4.1')
    store.createAlias('claude', 'anthropic/claude-3-opus')
    const result = registry.enhanceModelList(sampleModels)
    const aliasIds = result.data.filter(m => m.owned_by === 'alias').map(m => m.id)
    expect(aliasIds).toContain('gpt-4')
    expect(aliasIds).toContain('claude')
  })

  it('should resolve alias to target', () => {
    store.createAlias('gpt-4', 'openai/gpt-4.1')
    expect(registry.resolveModel('gpt-4')).toBe('openai/gpt-4.1')
    expect(registry.resolveModel('unknown-model')).toBe('unknown-model')
  })

  it('should check default model when not set', () => {
    const result = registry.checkDefaultModel(undefined)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('model is required')
  })

  it('should check default model when set', () => {
    store.setSetting('default_model', 'openai/gpt-4.1')
    const result = registry.checkDefaultModel(undefined)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('openai/gpt-4.1')
  })

  it('should pass validation when model is provided', () => {
    const result = registry.checkDefaultModel('some-model')
    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })
})