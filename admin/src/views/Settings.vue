<template>
  <div>
    <div class="page-header">
      <h1>系统设置</h1>
    </div>

    <div class="card" style="padding: 20px;">
      <h3>API Key 设置</h3>
      <div class="form-group" style="margin-top: 12px;">
        <label>当前 ADMIN_API_KEY</label>
        <div style="display: flex; gap: 8px;">
          <input :value="maskedKey" readonly style="flex: 1;" />
          <button class="btn-secondary" @click="changeKey">更换</button>
        </div>
      </div>
    </div>

    <div class="card" style="padding: 20px; margin-top: 16px;">
      <h3>数据库信息</h3>
      <div class="info-grid" style="margin-top: 12px;">
        <div class="info-item"><span class="label">账号数</span><span class="value">{{ accountCount }}</span></div>
        <div class="info-item"><span class="label">别名数</span><span class="value">{{ aliasCount }}</span></div>
        <div class="info-item"><span class="label">规则数</span><span class="value">{{ ruleCount }}</span></div>
      </div>
    </div>

    <Toast ref="toastRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../api'
import Toast from '../components/Toast.vue'

const maskedKey = ref('***')
const accountCount = ref(0)
const aliasCount = ref(0)
const ruleCount = ref(0)
const toastRef = ref<InstanceType<typeof Toast>>()

onMounted(async () => {
  const key = localStorage.getItem('admin_api_key') || ''
  maskedKey.value = key.length > 7 ? `${key.slice(0, 3)}***${key.slice(-4)}` : '***'

  const [accounts, aliases, rules] = await Promise.all([api.getAccounts(), api.getAliases(), api.getParamRules()])
  accountCount.value = accounts.length
  aliasCount.value = aliases.length
  ruleCount.value = rules.length
})

function changeKey() {
  const input = prompt('请输入新的 ADMIN_API_KEY:')
  if (input) {
    localStorage.setItem('admin_api_key', input)
    maskedKey.value = input.length > 7 ? `${input.slice(0, 3)}***${input.slice(-4)}` : '***'
    toastRef.value?.show('API Key 已更新，请刷新页面生效')
  }
}
</script>

<style scoped>
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; }
h3 { font-size: 16px; font-weight: 600; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item .label { font-size: 13px; color: var(--color-text-secondary); }
.info-item .value { font-size: 16px; font-weight: 500; }
</style>