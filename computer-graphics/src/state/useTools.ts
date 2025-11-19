// src/state/useTools.ts
import { ref } from 'vue'

export type Tool = 'point' | 'polyline' | 'contour' | 'marker' | 'text' | null

const activeTool = ref<Tool>(null)

export function useTools() {
  return {
    activeTool,
    setTool: (tool: Tool) => {
      activeTool.value = tool
    }
  }
}
