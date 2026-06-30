<template>
  <div class="layout">
    <header class="topbar">
      <div class="topbar-left">
        <span class="logo">🍜 kimchi2api</span>
        <span class="subtitle">Admin</span>
      </div>
      <div class="topbar-right">
        <span v-if="authed" class="badge badge-green">已连接</span>
        <span v-else class="badge badge-red">未认证</span>
      </div>
    </header>
    <div class="main">
      <nav class="sidebar">
        <router-link to="/dashboard" class="nav-item" active-class="active">
          <span class="nav-icon">📊</span> 仪表盘
        </router-link>
        <router-link to="/playground" class="nav-item" active-class="active">
          <span class="nav-icon">💬</span> 演练场
        </router-link>
        <router-link to="/accounts" class="nav-item" active-class="active">
          <span class="nav-icon">👤</span> 账号管理
        </router-link>
        <router-link to="/models" class="nav-item" active-class="active">
          <span class="nav-icon">🧠</span> 模型管理
        </router-link>
        <router-link to="/params" class="nav-item" active-class="active">
          <span class="nav-icon">🧹</span> 参数清洗
        </router-link>
        <router-link to="/logs" class="nav-item" active-class="active">
          <span class="nav-icon">📋</span> 调用日志
        </router-link>
        <router-link to="/settings" class="nav-item" active-class="active">
          <span class="nav-icon">⚙️</span> 系统设置
        </router-link>
      </nav>
      <main class="content">
        <router-view />
      </main>
    </div>
    <footer class="bottombar">
      <span>v0.2.0 · Kimchi Relay · SQLite</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const authed = ref(false)

onMounted(async () => {
  const key = localStorage.getItem('admin_api_key')
  if (!key) {
    authed.value = false
    return
  }
  try {
    await api.getAccounts()
    authed.value = true
  } catch {
    authed.value = false
    localStorage.removeItem('admin_api_key')
  }
})
</script>

<style scoped>
.layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.topbar {
  height: 48px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  font-weight: 700;
  font-size: 16px;
}

.subtitle {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.main {
  display: flex;
  flex: 1;
}

.sidebar {
  width: 200px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: 12px 0;
  flex-shrink: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 14px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: background 0.1s, color 0.1s;
}

.nav-item:hover {
  background: var(--color-bg);
  color: var(--color-text);
}

.nav-item.active {
  background: #ecfdf5;
  color: var(--color-primary);
  font-weight: 600;
  border-right: 3px solid var(--color-primary);
}

.nav-icon {
  font-size: 16px;
}

.content {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.bottombar {
  height: 32px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
</style>