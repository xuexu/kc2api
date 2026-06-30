<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal">
        <h2>{{ title }}</h2>
        <slot />
        <div class="form-actions">
          <button class="btn-secondary" @click="$emit('close')">取消</button>
          <button class="btn-primary" @click="$emit('confirm')" :disabled="loading">
            {{ loading ? '处理中...' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  confirmText?: string
  loading?: boolean
}>()

defineEmits<{
  close: []
  confirm: []
}>()
</script>