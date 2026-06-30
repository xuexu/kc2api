<template>
  <div>
    <div class="page-header">
      <h1>仪表盘</h1>
      <button class="btn-primary" @click="checkAll" :disabled="checking">
        {{ checking ? '检测中...' : '全部检测' }}
      </button>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-grid">
      <div class="card stat-card">
        <div class="stat-label">今日请求</div>
        <div class="stat-value">{{ stats.today_requests }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">今日 Token</div>
        <div class="stat-value">{{ formatNumber(stats.today_tokens) }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">总 Token</div>
        <div class="stat-value">{{ formatNumber(stats.total_tokens) }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">RPM</div>
        <div class="stat-value">{{ stats.rpm }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">TPM</div>
        <div class="stat-value">{{ formatNumber(stats.tpm) }}</div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">平均响应</div>
        <div class="stat-value">{{ stats.avg_latency }}ms</div>
      </div>
    </div>

    <!-- 账号卡片 -->
    <h2 style="margin: 28px 0 16px; font-size: 18px;">账号状态</h2>
    <div v-if="accounts.length === 0" class="empty-state">
      <p>暂无账号，请先在「账号管理」中添加。</p>
    </div>

    <div class="card-grid">
      <div v-for="acc in accounts" :key="acc.id" class="card account-card">
        <div class="card-header">
          <h3>{{ acc.name }}</h3>
          <StatusBadge :status="getStatus(acc)" />
        </div>
        <div class="card-body">
          <div class="info-row">
            <span class="label">Base URL</span>
            <span class="value">{{ acc.base_url }}</span>
          </div>
          <div class="info-row">
            <span class="label">API Key</span>
            <span class="value mono">{{ acc.api_key }}</span>
          </div>
          <div class="info-row">
            <span class="label">权重</span>
            <span class="value">{{ acc.weight }}</span>
          </div>
          <div v-if="acc.tags.length" class="info-row">
            <span class="label">标签</span>
            <span class="value">
              <span v-for="tag in acc.tags" :key="tag" class="badge badge-gray tag">{{ tag }}</span>
            </span>
          </div>
          <div v-if="acc.fail_count > 0" class="info-row">
            <span class="label">失败次数</span>
            <span class="value" style="color: var(--color-danger)">{{ acc.fail_count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import StatusBadge from '../components/StatusBadge.vue'

const accounts = ref<any[]>([])
const checking = ref(false)
const healthMap = ref<Record<string, boolean>>({})
const stats = ref({ today_requests: 0, today_tokens: 0, total_tokens: 0, rpm: 0, tpm: 0, avg_latency: 0 })

onMounted(async () => {
  const [accts, s] = await Promise.all([
    api.getAccounts(),
    fetch('/admin/api/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('admin_api_key') || ''}` } }).then(r => r.json()),
  ])
  accounts.value = accts
  stats.value = s
})

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return String(n)
}

function getStatus(acc: any): 'ok' | 'error' | 'cooldown' | 'disabled' {
  if (acc.weight === 0) return 'disabled'
  if (acc.cooldown_until && new Date(acc.cooldown_until).getTime() > Date.now()) return 'cooldown'
  if (healthMap.value[acc.id] !== undefined) {
    return healthMap.value[acc.id] ? 'ok' : 'error'
  }
  return 'ok'
}

async function checkAll() {
  checking.value = true
  try {
    const results = await api.getHealth()
    for (const r of results) {
      healthMap.value[r.id] = r.ok
    }
  } catch { /* ignore */ }
  checking.value = false
}
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-header h1 { font-size: 24px; font-weight: 700; }
.empty-state { text-align: center; padding: 48px; color: var(--color-text-secondary); }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
  margin-bottom: 8px;
}

.stat-card {
  padding: 18px 20px;
  text-align: center;
}

.stat-label {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-bottom: 6px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--color-primary);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.account-card { padding: 0; overflow: hidden; }
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}
.card-header h3 { font-size: 16px; font-weight: 600; }
.card-body { padding: 16px 20px; }
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
}
.info-row:last-child { margin-bottom: 0; }
.label { color: var(--color-text-secondary); }
.value { font-weight: 500; }
.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
.tag { margin-left: 4px; }
</style>