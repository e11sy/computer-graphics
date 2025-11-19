<script setup lang="ts">
import { NButton, NButtonGroup, NSpace } from 'naive-ui'
import { useTools } from '../state/useTools'

const { activeTool, setTool } = useTools()

const actions = [
  { label: 'Point', value: 'point' },
  { label: 'Polyline', value: 'polyline' },
  { label: 'Contour', value: 'contour' },
  { label: 'Marker', value: 'marker' }
]

function handleClick(tool: string) {
  if (activeTool.value === tool) {
    setTool(null) // toggle off
  } else {
    setTool(tool as any)
  }
}
</script>

<template>
  <div class="toolbar">
    <NSpace>
      <NButtonGroup>
        <NButton
          v-for="action in actions"
          :key="action.value"
          size="small"
          strong
          :type="activeTool === action.value ? 'primary' : 'default'"
          @click="handleClick(action.value)"
        >
          {{ action.label }}
        </NButton>
      </NButtonGroup>
    </NSpace>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-bottom: 1px solid #ddd;
  background: #f9f9f9;
}
</style>
