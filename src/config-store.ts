import Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import type { Account, CreateAccountInput, ModelAlias, ParamRule, CreateParamRuleInput, CallLog } from './types.js'

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    );
  `)

  const currentVersion = db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null }

  if (!currentVersion.v || currentVersion.v < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        api_key        TEXT NOT NULL,
        base_url       TEXT NOT NULL DEFAULT 'https://llm.kimchi.dev',
        weight         INTEGER NOT NULL DEFAULT 1,
        tags           TEXT NOT NULL DEFAULT '[]',
        fail_count     INTEGER NOT NULL DEFAULT 0,
        cooldown_until TEXT,
        created_at     TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS model_aliases (
        id         TEXT PRIMARY KEY,
        alias      TEXT NOT NULL UNIQUE,
        target     TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hidden_models (
        id         TEXT PRIMARY KEY,
        model_slug TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS param_rules (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL CHECK(type IN ('strip','normalize','inject')),
        param_name  TEXT NOT NULL,
        action_json TEXT NOT NULL DEFAULT '{}',
        priority    INTEGER NOT NULL DEFAULT 0,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL
      );

      INSERT OR REPLACE INTO schema_version (version) VALUES (1);
    `)

    const existing = db.prepare("SELECT value FROM settings WHERE key = 'default_model'").get()
    if (!existing) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('default_model', '')").run()
    }
  }

  if (!currentVersion.v || currentVersion.v < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS call_logs (
        id           TEXT PRIMARY KEY,
        account_id   TEXT NOT NULL,
        account_name TEXT NOT NULL,
        method       TEXT NOT NULL,
        path         TEXT NOT NULL,
        model        TEXT,
        status_code  INTEGER NOT NULL,
        elapsed_ms   INTEGER NOT NULL,
        created_at   TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_call_logs_account ON call_logs(account_id);
      CREATE INDEX IF NOT EXISTS idx_call_logs_created ON call_logs(created_at);
    `)
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (2)').run()
  }

  if (!currentVersion.v || currentVersion.v < 3) {
    db.exec(`ALTER TABLE call_logs ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0`)
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (3)').run()
  }

  if (!currentVersion.v || currentVersion.v < 4) {
    db.exec(`
      ALTER TABLE call_logs ADD COLUMN prompt_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE call_logs ADD COLUMN completion_tokens INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE call_logs ADD COLUMN cache_tokens INTEGER NOT NULL DEFAULT 0;
    `)
    db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (4)').run()
  }
}

export class ConfigStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  // ====== 账号 ======

  getAccounts(): Account[] {
    const rows = this.db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all() as any[]
    return rows.map(this.hydrateAccount)
  }

  getAccount(id: string): Account | undefined {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as any
    return row ? this.hydrateAccount(row) : undefined
  }

  createAccount(input: CreateAccountInput): Account {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO accounts (id, name, api_key, base_url, weight, tags, fail_count, cooldown_until, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      id,
      input.name,
      input.api_key,
      input.base_url ?? 'https://llm.kimchi.dev',
      input.weight ?? 1,
      JSON.stringify(input.tags ?? []),
      now,
      now,
    )
    return this.getAccount(id)!
  }

  updateAccount(id: string, data: Partial<Pick<Account, 'name' | 'api_key' | 'base_url' | 'weight' | 'tags'>>): Account {
    const existing = this.getAccount(id)
    if (!existing) throw new Error(`Account ${id} not found`)

    const now = new Date().toISOString()
    const name = data.name ?? existing.name
    const api_key = data.api_key ?? existing.api_key
    const base_url = data.base_url ?? existing.base_url
    const weight = data.weight ?? existing.weight
    const tags = data.tags ?? existing.tags

    this.db.prepare(`
      UPDATE accounts SET name=?, api_key=?, base_url=?, weight=?, tags=?, updated_at=?
      WHERE id=?
    `).run(name, api_key, base_url, weight, JSON.stringify(tags), now, id)

    return this.getAccount(id)!
  }

  deleteAccount(id: string): void {
    const result = this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`Account ${id} not found`)
  }

  // ====== 别名 ======

  getAliases(): ModelAlias[] {
    return this.db.prepare('SELECT * FROM model_aliases ORDER BY created_at ASC').all() as ModelAlias[]
  }

  createAlias(alias: string, target: string): ModelAlias {
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      this.db.prepare('INSERT INTO model_aliases (id, alias, target, created_at) VALUES (?, ?, ?, ?)').run(id, alias, target, now)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) throw new Error(`Alias "${alias}" already exists`)
      throw e
    }
    return this.db.prepare('SELECT * FROM model_aliases WHERE id = ?').get(id) as ModelAlias
  }

  deleteAlias(id: string): void {
    const result = this.db.prepare('DELETE FROM model_aliases WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`Alias ${id} not found`)
  }

  resolveAlias(modelName: string): string {
    const row = this.db.prepare('SELECT target FROM model_aliases WHERE alias = ?').get(modelName) as { target: string } | undefined
    return row ? row.target : modelName
  }

  // ====== 隐藏模型 ======

  getHiddenSlugs(): Set<string> {
    const rows = this.db.prepare('SELECT model_slug FROM hidden_models').all() as { model_slug: string }[]
    return new Set(rows.map(r => r.model_slug))
  }

  addHiddenModel(slug: string): void {
    const id = randomUUID()
    const now = new Date().toISOString()
    try {
      this.db.prepare('INSERT INTO hidden_models (id, model_slug, created_at) VALUES (?, ?, ?)').run(id, slug, now)
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) throw new Error(`Model "${slug}" is already hidden`)
      throw e
    }
  }

  removeHiddenModel(slug: string): void {
    const result = this.db.prepare('DELETE FROM hidden_models WHERE model_slug = ?').run(slug)
    if (result.changes === 0) throw new Error(`Hidden model "${slug}" not found`)
  }

  // ====== 设置 ======

  getSetting(key: string): string {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value ?? ''
  }

  setSetting(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)
  }

  // ====== 清洗规则 ======

  getParamRules(): ParamRule[] {
    const rows = this.db.prepare('SELECT * FROM param_rules ORDER BY priority ASC, created_at ASC').all() as any[]
    return rows.map(r => ({ ...r, action_json: JSON.parse(r.action_json), enabled: r.enabled === 1 }))
  }

  createRule(input: CreateParamRuleInput): ParamRule {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO param_rules (id, type, param_name, action_json, priority, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, input.type, input.param_name, JSON.stringify(input.action_json ?? {}), input.priority ?? 0, now)
    const row = this.db.prepare('SELECT * FROM param_rules WHERE id = ?').get(id) as any
    return { ...row, action_json: JSON.parse(row.action_json), enabled: row.enabled === 1 }
  }

  updateRule(id: string, data: Partial<Pick<ParamRule, 'type' | 'param_name' | 'action_json' | 'priority' | 'enabled'>>): ParamRule {
    const existing = this.db.prepare('SELECT * FROM param_rules WHERE id = ?').get(id) as any
    if (!existing) throw new Error(`Rule ${id} not found`)

    this.db.prepare(`
      UPDATE param_rules SET type=?, param_name=?, action_json=?, priority=?, enabled=?
      WHERE id=?
    `).run(
      data.type ?? existing.type,
      data.param_name ?? existing.param_name,
      JSON.stringify(data.action_json ?? JSON.parse(existing.action_json)),
      data.priority ?? existing.priority,
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled,
      id,
    )
    const row = this.db.prepare('SELECT * FROM param_rules WHERE id = ?').get(id) as any
    return { ...row, action_json: JSON.parse(row.action_json), enabled: row.enabled === 1 }
  }

  deleteRule(id: string): void {
    const result = this.db.prepare('DELETE FROM param_rules WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error(`Rule ${id} not found`)
  }

  // ====== 故障跟踪 ======

  recordAccountFailure(id: string): void {
    const account = this.getAccount(id)
    if (!account) throw new Error(`Account ${id} not found`)
    const newFailCount = account.fail_count + 1
    if (newFailCount >= 3) {
      const cooldownUntil = new Date(Date.now() + 30000).toISOString()
      this.db.prepare('UPDATE accounts SET fail_count=?, cooldown_until=?, updated_at=? WHERE id=?').run(newFailCount, cooldownUntil, new Date().toISOString(), id)
    } else {
      this.db.prepare('UPDATE accounts SET fail_count=?, updated_at=? WHERE id=?').run(newFailCount, new Date().toISOString(), id)
    }
  }

  recordAccountSuccess(id: string): void {
    this.db.prepare('UPDATE accounts SET fail_count=0, cooldown_until=NULL, updated_at=? WHERE id=?').run(new Date().toISOString(), id)
  }

  // ====== 调用日志 ======

  insertCallLog(log: Omit<CallLog, 'id' | 'created_at' | 'total_tokens' | 'prompt_tokens' | 'completion_tokens' | 'cache_tokens'> & { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; cache_tokens?: number }): CallLog {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO call_logs (id, account_id, account_name, method, path, model, status_code, elapsed_ms, total_tokens, prompt_tokens, completion_tokens, cache_tokens, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, log.account_id, log.account_name, log.method, log.path, log.model ?? null,
      log.status_code, log.elapsed_ms,
      log.total_tokens ?? 0, log.prompt_tokens ?? 0, log.completion_tokens ?? 0, log.cache_tokens ?? 0,
      now,
    )
    return { id, ...log, total_tokens: log.total_tokens ?? 0, prompt_tokens: log.prompt_tokens ?? 0, completion_tokens: log.completion_tokens ?? 0, cache_tokens: log.cache_tokens ?? 0, created_at: now } as CallLog
  }

  getCallLogs(params: { account_id?: string; limit?: number; offset?: number }): CallLog[] {
    const limit = params.limit ?? 100
    const offset = params.offset ?? 0
    if (params.account_id) {
      return this.db.prepare(
        'SELECT * FROM call_logs WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      ).all(params.account_id, limit, offset) as CallLog[]
    }
    return this.db.prepare(
      'SELECT * FROM call_logs ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset) as CallLog[]
  }

  getCallLogCount(account_id?: string): number {
    if (account_id) {
      const row = this.db.prepare('SELECT COUNT(*) as c FROM call_logs WHERE account_id = ?').get(account_id) as { c: number }
      return row.c
    }
    const row = this.db.prepare('SELECT COUNT(*) as c FROM call_logs').get() as { c: number }
    return row.c
  }

  getStats(): {
    today_requests: number
    today_tokens: number
    total_tokens: number
    avg_latency: number
    rpm: number
    tpm: number
  } {
    const today = new Date().toISOString().slice(0, 10)
    const todayRow = this.db.prepare(`
      SELECT COUNT(*) as c, COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(AVG(elapsed_ms), 0) as avg_ms
      FROM call_logs WHERE created_at >= ?
    `).get(today) as { c: number; tokens: number; avg_ms: number }

    const totalRow = this.db.prepare('SELECT COALESCE(SUM(total_tokens), 0) as tokens FROM call_logs').get() as { tokens: number }

    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const minutesSinceMidnight = Math.max(1, Math.round((now.getTime() - midnight.getTime()) / 60000))

    return {
      today_requests: todayRow.c,
      today_tokens: todayRow.tokens,
      total_tokens: totalRow.tokens,
      avg_latency: Math.round(todayRow.avg_ms),
      rpm: Math.round((todayRow.c / minutesSinceMidnight) * 100) / 100,
      tpm: Math.round((todayRow.tokens / minutesSinceMidnight) * 100) / 100,
    }
  }

  // ====== 内部 ======

  private hydrateAccount(row: any): Account {
    return {
      ...row,
      tags: JSON.parse(row.tags),
      fail_count: row.fail_count,
      cooldown_until: row.cooldown_until,
    }
  }
}