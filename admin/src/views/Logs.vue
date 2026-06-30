<template>
  <div>
    <div class="page-header">
      <h1>调用日志</h1>
      <div class="header-controls">
        <select v-model="filterAccount" @change="loadLogs">
          <option value="">全部账号</option>
          <option v-for="acc in accounts" :key="acc.id" :value="acc.id">{{ acc.name }}</option>
        </select>
        <button class="btn-secondary" @click="loadLogs" :disabled="loading">刷新</button>
      </div>
    </div>

    <div v-if="logs.length === 0" class="empty-state">
      <p>暂无调用记录</p>
    </div>

    <table v-else class="card">
      <thead>
        <tr>
          <th>时间</th>
          <th>账号</th>
          <th>方法</th>
          <th>路径</th>
          <th>模型</th>
          <th>状态</th>
          <th>耗时</th>
          <th>Token</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="log in logs" :key="log.id">
          <td class="time-cell">{{ formatTime(log.created_at) }}</td>
          <td><span class="badge badge-gray">{{ log.account_name }}</span></td>
          <td><span :class="['badge', methodBadge(log.method)]">{{ log.method }}</span></td>
          <td class="path-cell">{{ log.path }}</td>
          <td><code v-if="log.model" class="model-cell">{{ log.model }}</code><span v-else class="dim">-</span></td>
          <td>
            <span v-if="log.status_code === 0" class="badge badge-red">错误</span>
            <span v-else-if="log.status_code >= 400" class="badge badge-red">{{ log.status_code }}</span>
            <span v-else-if="log.status_code >= 200" class="badge badge-green">{{ log.status_code }}</span>
            <span v-else class="badge badge-gray">{{ log.status_code }}</span>
          </td>
          <td class="time-cell">{{ log.elapsed_ms }}ms</td>
          <td class="token-cell">
            <span v-if="log.total_tokens > 0" class="token-detail">
              <span class="token-in" title="输入">↓{{ fmt(log.prompt_tokens) }}</span>
              <span class="token-out" title="输出">↑{{ fmt(log.completion_tokens) }}</span>
              <span v-if="log.cache_tokens > 0" class="token-cache" title="缓存命中">◎{{ fmt(log.cache_tokens) }}</span>
            </span>
            <span v-else class="dim">-</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="total > limit" class="pagination">
      <button class="btn-secondary" :disabled="offset === 0" @click="prevPage">上一页</button>
      <span class="page-info">{{ offset + 1 }}-{{ Math.min(offset + limit, total) }} / {{ total }}</span>
      <button class="btn-secondary" :disabled="offset + limit >= total" @click="nextPage">下一页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'

const logs = ref<any[]>([])
const accounts = ref<any[]>([])
const filterAccount = ref('')
const loading = ref(false)
const total = ref(0)
const limit = 50
const offset = ref(0)

onMounted(async () => {
  accounts.value = await api.getAccounts()
  await loadLogs()
})

async function loadLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('limit', String(limit))
    params.set('offset', String(offset.value))
    if (filterAccount.value) params.set('account_id', filterAccount.value)

    const res = await fetch(`/admin/api/logs?${params}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('admin_api_key') || ''}` },
    })
    const data = await res.json()
    logs.value = data.logs
    total.value = data.total
  } catch { /* ignore */ }
  loading.value = false
}

function fmt(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function prevPage() {
  offset.value = Math.max(0, offset.value - limit)
  loadLogs()
}

function nextPage() {
  offset.value = offset.value + limit
  loadLogs()
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

function methodBadge(method: string): string {
  const map: Record<string, string> = { GET: 'badge-green', POST: 'badge-blue', PUT: 'badge-yellow', DELETE: 'badge-red' }
  return map[method] || 'badge-gray'
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}
.page-header h1 { font-size: 24px; font-weight: 700; }
.header-controls { display: flex; gap: 8px; align-items: center; }
.header-controls select { width: auto; min-width: 140px; }
.empty-state { text-align: center; padding: 48px; color: var(--color-text-secondary); }
.time-cell { white-space: nowrap; font-size: 13px; }
.path-cell { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: monospace; font-size: 12px; }
.model-cell { font-size: 12px; }
.dim { color: var(--color-text-secondary); }
.token-cell { white-space: nowrap; font-size: 13px; }
.token-detail { display: flex; gap: 6px; align-items: center; }
.token-in { color: #2563eb; font-weight: 500; }
.token-out { color: #059669; font-weight: 500; }
.token-cache { color: #7c3aed; font-weight: 500; }
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
.page-info { font-size: 13px; color: var(--color-text-secondary); }
.badge-blue { background: #dbeafe; color: #1e40af; }
</style>