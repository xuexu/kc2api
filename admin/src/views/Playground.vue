<template>
  <div>
    <div class="page-header">
      <h1>演练场</h1>
    </div>

    <div class="playground-layout">
      <!-- 左侧配置 -->
      <div class="config-panel card">
        <div class="form-group">
          <label>模型</label>
          <select v-model="model" @change="saveConfig">
            <option v-if="models.length === 0" value="">加载中...</option>
            <option v-for="m in models" :key="m.id" :value="m.id">{{ m.id }}</option>
          </select>
        </div>

        <div class="form-group">
          <label>API Key {{ publicKeyRequired ? '*' : '(可选)' }}</label>
          <input v-model="apiKey" type="password" placeholder="PUBLIC_API_KEY" @change="saveConfig" />
        </div>

        <div class="form-group">
          <label>System Prompt</label>
          <textarea v-model="systemPrompt" rows="3" placeholder="系统提示词..." @change="saveConfig"></textarea>
        </div>

        <div class="form-group">
          <label>User Prompt</label>
          <textarea v-model="userPrompt" rows="4" placeholder="用户消息..." @keydown.ctrl.enter="send" @change="saveConfig"></textarea>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>Temperature</label>
            <input v-model.number="temperature" type="number" min="0" max="2" step="0.1" @change="saveConfig" />
          </div>
          <div class="form-group">
            <label>Max Tokens</label>
            <input v-model.number="maxTokens" type="number" min="1" max="128000" @change="saveConfig" />
          </div>
        </div>

        <div class="form-row">
          <label class="checkbox-label">
            <input type="checkbox" v-model="stream" @change="saveConfig" />
            Streaming
          </label>
        </div>

        <button class="btn-primary btn-full" @click="send" :disabled="sending || !model">
          {{ sending ? '发送中...' : '发送 (Ctrl+Enter)' }}
        </button>
      </div>

      <!-- 右侧输出 -->
      <div class="output-panel">
        <div class="card status-bar">
          <span>状态：<span :class="statusClass">{{ statusText }}</span></span>
          <span v-if="elapsed">耗时：{{ elapsed }}ms</span>
          <span v-if="error" class="error-text">{{ error }}</span>
        </div>

        <div class="card output-box">
          <div v-if="assistantOutput" class="output-text">{{ assistantOutput }}</div>
          <div v-else class="output-placeholder">点击发送开始对话...</div>
          <span v-if="sending && stream" class="cursor">▊</span>
        </div>

        <details class="card debug-panel" v-if="rawRequest || rawResponse">
          <summary>调试信息</summary>
          <div v-if="rawRequest" class="debug-section">
            <h4>Raw Request</h4>
            <pre>{{ rawRequest }}</pre>
          </div>
          <div v-if="rawResponse" class="debug-section">
            <h4>Raw Response</h4>
            <pre>{{ rawResponse }}</pre>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

const models = ref<{ id: string }[]>([])
const model = ref('')
const apiKey = ref('')
const publicKeyRequired = ref(false)
const systemPrompt = ref('')
const userPrompt = ref('')
const temperature = ref(0.7)
const maxTokens = ref(4096)
const stream = ref(true)
const sending = ref(false)
const assistantOutput = ref('')
const rawRequest = ref('')
const rawResponse = ref('')
const statusText = ref('就绪')
const statusClass = ref('')
const elapsed = ref(0)
const error = ref('')

onMounted(async () => {
  // 默认使用 admin API key
  if (!apiKey.value) {
    const adminKey = localStorage.getItem('admin_api_key') || ''
    if (adminKey) apiKey.value = adminKey
  }
  // 加载保存的配置
  const saved = localStorage.getItem('playground_config')
  if (saved) {
    try {
      const cfg = JSON.parse(saved)
      model.value = cfg.model || ''
      if (cfg.apiKey) apiKey.value = cfg.apiKey
      systemPrompt.value = cfg.systemPrompt || ''
      userPrompt.value = cfg.userPrompt || ''
      temperature.value = cfg.temperature ?? 0.7
      maxTokens.value = cfg.maxTokens ?? 4096
      stream.value = cfg.stream ?? true
    } catch {}
  }
  await loadModels()
})

function saveConfig() {
  localStorage.setItem('playground_config', JSON.stringify({
    model: model.value,
    apiKey: apiKey.value,
    systemPrompt: systemPrompt.value,
    userPrompt: userPrompt.value,
    temperature: temperature.value,
    maxTokens: maxTokens.value,
    stream: stream.value,
  }))
}

async function loadModels() {
  try {
    const headers: Record<string, string> = {}
    if (apiKey.value) headers.Authorization = `Bearer ${apiKey.value}`
    const res = await fetch('/v1/models', { headers })
    if (res.status === 401) {
      publicKeyRequired.value = true
      statusText.value = '需要 API Key'
      statusClass.value = 'status-warn'
      return
    }
    publicKeyRequired.value = false
    const data = await res.json()
    models.value = data.data || []
    if (!model.value && models.value.length > 0) {
      model.value = models.value[0].id
    }
    statusText.value = '就绪'
    statusClass.value = ''
  } catch {
    statusText.value = '模型加载失败'
    statusClass.value = 'status-error'
  }
}

async function send() {
  if (!model.value || sending.value) return
  sending.value = true
  assistantOutput.value = ''
  rawRequest.value = ''
  rawResponse.value = ''
  error.value = ''
  elapsed.value = 0
  statusText.value = '请求中...'
  statusClass.value = ''

  const messages: any[] = []
  if (systemPrompt.value.trim()) {
    messages.push({ role: 'system', content: systemPrompt.value })
  }
  messages.push({ role: 'user', content: userPrompt.value || 'Hello' })

  const body: any = {
    model: model.value,
    messages,
    temperature: temperature.value,
    max_tokens: maxTokens.value,
    stream: stream.value,
  }
  rawRequest.value = JSON.stringify(body, null, 2)

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey.value) headers.Authorization = `Bearer ${apiKey.value}`

  const startTime = performance.now()

  try {
    if (stream.value) {
      const res = await fetch('/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) })
      statusText.value = `状态：${res.status}`
      statusClass.value = res.ok ? 'status-ok' : 'status-error'

      if (!res.ok || !res.body) {
        const errText = await res.text()
        rawResponse.value = errText
        try { error.value = JSON.parse(errText).error?.message || errText } catch { error.value = errText }
        sending.value = false
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let rawChunks = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        rawChunks += chunk
        buffer += chunk

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const parsed = JSON.parse(data)
              const content = parsed.choices?.[0]?.delta?.content
              if (content) assistantOutput.value += content
            } catch {}
          }
        }
      }
      rawResponse.value = rawChunks
    } else {
      const res = await fetch('/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify(body) })
      const data = await res.json()
      rawResponse.value = JSON.stringify(data, null, 2)
      statusText.value = `状态：${res.status}`
      statusClass.value = res.ok ? 'status-ok' : 'status-error'

      if (res.ok) {
        assistantOutput.value = data.choices?.[0]?.message?.content || JSON.stringify(data)
      } else {
        error.value = data.error?.message || `HTTP ${res.status}`
      }
    }
  } catch (e: any) {
    statusText.value = '错误'
    statusClass.value = 'status-error'
    error.value = e.message
  }

  elapsed.value = Math.round(performance.now() - startTime)
  sending.value = false
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; }

.playground-layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 20px;
  align-items: start;
}

.config-panel { padding: 20px; }

.form-row {
  display: flex;
  gap: 12px;
}
.form-row .form-group { flex: 1; }

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 16px;
}
.checkbox-label input[type="checkbox"] { width: auto; }

.btn-full { width: 100%; padding: 12px; font-size: 15px; }

.output-panel { display: flex; flex-direction: column; gap: 12px; }

.status-bar {
  padding: 10px 16px;
  display: flex;
  gap: 20px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.status-ok { color: var(--color-primary); font-weight: 600; }
.status-error { color: var(--color-danger); font-weight: 600; }
.status-warn { color: #d97706; font-weight: 600; }
.error-text { color: var(--color-danger); }

.output-box {
  padding: 20px;
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.7;
}

.output-text { color: var(--color-text); }
.output-placeholder { color: var(--color-text-secondary); font-style: italic; }
.cursor { animation: blink 1s step-end infinite; color: var(--color-primary); }

@keyframes blink {
  50% { opacity: 0; }
}

.debug-panel { padding: 16px; margin-top: 8px; }
.debug-panel summary { cursor: pointer; font-size: 13px; font-weight: 500; color: var(--color-text-secondary); margin-bottom: 8px; }
.debug-section { margin-top: 12px; }
.debug-section h4 { font-size: 13px; margin-bottom: 4px; color: var(--color-text-secondary); }
.debug-section pre {
  background: var(--color-bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
}
</style>