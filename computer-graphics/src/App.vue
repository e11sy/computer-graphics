<script setup lang="ts">
import Toolbar from './components/Toolbar.vue'
import CanvasScene from './components/CanvasScene.vue'
</script>

<template>
  <div class="app">
    <Toolbar />
    <CanvasScene />
  </div>
</template>

<style>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
</style>
