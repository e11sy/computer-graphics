<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount } from 'vue'
import geometryModel from '@/geometry/geomModel'
import { registerDefaultFigures } from '@/geometry/registerFigures'
import { useTools } from '@/state/useTools'

const { activeTool } = useTools()
const canvasRef = ref<HTMLCanvasElement | null>(null)

onMounted(async () => {
  registerDefaultFigures()
  await geometryModel.init(canvasRef.value!)
  geometryModel.attachToolRef(activeTool)
  geometryModel.enableInteraction()
})

onBeforeUnmount(() => {
  geometryModel.destroy()
})
</script>

<template>
  <div style="width:100%;height:100%;display:flex;">
    <canvas ref="canvasRef" style="flex:1;background:white;"></canvas>
  </div>
</template>
