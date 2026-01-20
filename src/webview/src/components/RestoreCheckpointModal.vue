<template>
  <div class="restore-modal">
    <div class="restore-content">
      <span class="codicon codicon-loading codicon-modifier-spin"></span>
      <span>Restoring checkpoint...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
// No complex logic needed
</script>

<style scoped>
.restore-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.restore-content {
  background-color: var(--vscode-editor-background);
  padding: 20px 32px;
  border-radius: 6px;
  border: 1px solid var(--vscode-editorWidget-border);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--vscode-foreground);
  font-size: 14px;
}

.codicon-loading {
  font-size: 20px;
  color: var(--vscode-progressBar-background);
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}
</style>
