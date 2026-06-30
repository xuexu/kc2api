<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <span class="logo">🍜</span>
        <h1>kimchi2api</h1>
        <p class="subtitle">管理后台</p>
      </div>

      <form @submit.prevent="login" class="login-form">
        <div class="form-group">
          <label>Admin API Key</label>
          <input
            v-model="apiKey"
            type="password"
            placeholder="输入 ADMIN_API_KEY"
            autofocus
            :class="{ error: errorMsg }"
          />
          <p v-if="errorMsg" class="error-text">{{ errorMsg }}</p>
        </div>

        <button type="submit" class="btn-primary btn-full" :disabled="loading || !apiKey.trim()">
          {{ loading ? '验证中...' : '登 录' }}
        </button>
      </form>

      <p class="hint">默认密钥为 <code>changeme</code>，生产环境请修改 .env 中的 ADMIN_API_KEY</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api'

const router = useRouter()
const apiKey = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function login() {
  if (!apiKey.value.trim()) return
  loading.value = true
  errorMsg.value = ''

  // 保存 API key 并测试
  localStorage.setItem('admin_api_key', apiKey.value.trim())
  try {
    await api.getAccounts()
    router.replace('/dashboard')
  } catch (e: any) {
    errorMsg.value = '密钥无效，请重试'
    localStorage.removeItem('admin_api_key')
  }
  loading.value = false
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
}

.login-card {
  width: 380px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
  padding: 40px 36px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
}

.login-header h1 {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.btn-full {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  border-radius: var(--radius);
}

.error-text {
  font-size: 13px;
  color: var(--color-danger);
  margin-top: 4px;
}

input.error {
  border-color: var(--color-danger);
}

.hint {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-top: 20px;
  line-height: 1.5;
}

.hint code {
  background: var(--color-bg);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
}
</style>