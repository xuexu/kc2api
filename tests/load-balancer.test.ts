import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { ConfigStore, runMigrations } from '../src/config-store.js'
import { LoadBalancer } from '../src/load-balancer.js'

let db: Database.Database
let store: ConfigStore
let balancer: LoadBalancer

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  store = new ConfigStore(db)
  balancer = new LoadBalancer(store)
})

describe('LoadBalancer', () => {
  it('should return null when no accounts exist', () => {
    expect(balancer.selectAccount()).toBeNull()
  })

  it('should return the only account', () => {
    store.createAccount({ name: 'A', api_key: 'sk-a' })
    const selected = balancer.selectAccount()
    expect(selected).toBeTruthy()
    expect(selected!.name).toBe('A')
  })

  it('should skip disabled accounts (weight=0)', () => {
    store.createAccount({ name: 'A', api_key: 'sk-a', weight: 0 })
    expect(balancer.selectAccount()).toBeNull()
  })

  it('should skip accounts in cooldown', () => {
    const acc = store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.recordAccountFailure(acc.id)
    store.recordAccountFailure(acc.id)
    store.recordAccountFailure(acc.id)
    expect(balancer.selectAccount()).toBeNull()
  })

  it('should round-robin with equal weights', () => {
    store.createAccount({ name: 'A', api_key: 'sk-a', weight: 1 })
    store.createAccount({ name: 'B', api_key: 'sk-b', weight: 1 })
    store.createAccount({ name: 'C', api_key: 'sk-c', weight: 1 })

    const selections: string[] = []
    for (let i = 0; i < 6; i++) {
      const acc = balancer.selectAccount()
      expect(acc).toBeTruthy()
      selections.push(acc!.name)
    }
    expect(selections.filter(s => s === 'A')).toHaveLength(2)
    expect(selections.filter(s => s === 'B')).toHaveLength(2)
    expect(selections.filter(s => s === 'C')).toHaveLength(2)
  })

  it('should distribute proportionally by weight', () => {
    store.createAccount({ name: 'A', api_key: 'sk-a', weight: 3 })
    store.createAccount({ name: 'B', api_key: 'sk-b', weight: 1 })

    const counts: Record<string, number> = {}
    for (let i = 0; i < 12; i++) {
      const acc = balancer.selectAccount()!
      counts[acc.name] = (counts[acc.name] || 0) + 1
    }
    expect(counts['A']).toBe(9)
    expect(counts['B']).toBe(3)
  })

  it('should mark success and reset fail_count', () => {
    const acc = store.createAccount({ name: 'A', api_key: 'sk-a' })
    store.recordAccountFailure(acc.id)
    balancer.markSuccess(acc)
    const updated = store.getAccount(acc.id)!
    expect(updated.fail_count).toBe(0)
  })

  it('should mark failure and increment fail_count', () => {
    const acc = store.createAccount({ name: 'A', api_key: 'sk-a' })
    balancer.markFailure(acc)
    const updated = store.getAccount(acc.id)!
    expect(updated.fail_count).toBe(1)
  })
})