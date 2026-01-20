<template>
  <div class="task-list-popover">
    <div class="task-section">
      <div class="section-title">IN PROGRESS</div>
      <div v-if="inProgressSessions.length === 0" class="empty-text">
        No active tasks
      </div>
      <div v-else class="task-list">
        <div
          v-for="session in inProgressSessions"
          :key="session.id"
          class="task-item"
          @click="switchToSession(session.session)"
        >
          <div class="task-info">
            <span class="codicon codicon-loading codicon-modifier-spin" />
            <span class="task-name" :title="session.summary">{{ session.summary }}</span>
          </div>
          <button
            class="close-btn"
            @click.stop="handleClose(session.session)"
            title="Close"
          >
            <span class="codicon codicon-close" />
          </button>
        </div>
      </div>
    </div>

    <div class="divider" />

    <div class="task-section">
      <div class="section-title">COMPLETED</div>
      <div v-if="completedSessions.length === 0" class="empty-text">
        No completed tasks
      </div>
      <div v-else class="task-list">
        <div
          v-for="session in completedSessions"
          :key="session.id"
          class="task-item"
          @click="switchToSession(session.session)"
        >
          <div class="task-info">
            <span class="codicon codicon-check" />
            <span class="task-name" :title="session.summary">{{ session.summary }}</span>
          </div>
          <button
            class="close-btn"
            @click.stop="handleClose(session.session)"
            title="Close"
          >
            <span class="codicon codicon-close" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSessionStore } from '../composables/useSessionStore';
import type { Session } from '../core/Session';
import { useSignal } from '@gn8/alien-signals-vue';

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const runtime = inject(RuntimeKey);
if (!runtime) throw new Error('[TaskList] runtime not provided');

const sessionStore = useSessionStore(runtime.sessionStore);
const openSessions = sessionStore.openSessions;

interface SessionItem {
  id: string;
  session: Session;
  summary: string;
}

// Helper to convert session to display item (reactive)
function useSessionItem(session: Session) {
  const summary = useSignal(session.summary);
  const busy = useSignal(session.busy);
  const id = useSignal(session.sessionId);

  return computed(() => ({
    id: id.value || Math.random().toString(),
    session,
    summary: summary.value || 'New Session',
    busy: busy.value
  }));
}

const sessionItems = computed(() => {
  return openSessions.value.map(s => useSessionItem(s).value);
});

const inProgressSessions = computed(() => {
  return sessionItems.value.filter(s => s.busy);
});

const completedSessions = computed(() => {
  return sessionItems.value.filter(s => !s.busy);
});

function switchToSession(session: Session) {
  sessionStore.setActiveSession(session);
  emit('close');
}

async function handleClose(session: Session) {
  // If session is busy, confirm with user
  if (session.busy()) {
    const confirmation = await runtime!.appContext.showNotification(
      'This session is currently in progress. Do you want to close it?',
      'info',
      ['Yes', 'No']
    );
    if (confirmation !== 'Yes') {
      return;
    }
    // Interrupt if closing while busy
    await session.interrupt();
  }

  sessionStore.closeSession(session);
}
</script>

<style scoped>
.task-list-popover {
  display: flex;
  flex-direction: column;
  background-color: var(--vscode-dropdown-background);
  color: var(--vscode-dropdown-foreground);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 6px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
  width: 300px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
}

.task-section {
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  padding: 4px 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.empty-text {
  padding: 8px 12px;
  font-size: 12px;
  font-style: italic;
  color: var(--vscode-descriptionForeground);
  opacity: 0.8;
}

.task-list {
  display: flex;
  flex-direction: column;
}

.task-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.1s;
}

.task-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.task-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  flex: 1;
}

.task-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.codicon-loading {
  color: var(--vscode-charts-blue);
  font-size: 14px;
}

.codicon-check {
  color: var(--vscode-testing-iconPassed);
  font-size: 14px;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}

.task-item:hover .close-btn {
  opacity: 1;
}

.close-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.divider {
  height: 1px;
  background-color: var(--vscode-widget-border);
  margin: 4px 0;
  opacity: 0.5;
}

.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
