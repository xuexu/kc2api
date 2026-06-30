<template>
  <span :class="['badge', badgeClass]">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'ok' | 'error' | 'cooldown' | 'disabled'
}>()

const badgeClass = computed(() => {
  switch (props.status) {
    case 'ok': return 'badge-green'
    case 'error': return 'badge-red'
    case 'cooldown': return 'badge-yellow'
    case 'disabled': return 'badge-gray'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'ok': return '在线'
    case 'error': return '离线'
    case 'cooldown': return '冷却中'
    case 'disabled': return '已禁用'
  }
})
</script>