<template>
  <Teleport to="body">
    <div v-if="visible" :class="['toast', `toast-${type}`]">
      {{ message }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const message = ref('')
const type = ref<'success' | 'error'>('success')

function show(msg: string, t: 'success' | 'error' = 'success') {
  message.value = msg
  type.value = t
  visible.value = true
  setTimeout(() => { visible.value = false }, 3000)
}

defineExpose({ show })
</script>

<style scoped>
.toast {
  position: fixed;
  top: 60px;
  right: 20px;
  padding: 12px 20px;
  border-radius: var(--radius);
  font-size: 14px;
  font-weight: 500;
  z-index: 200;
  animation: slideIn 0.2s ease;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.toast-success { background: #d1fae5; color: #065f46; }
.toast-error { background: #fee2e2; color: #991b1b; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>