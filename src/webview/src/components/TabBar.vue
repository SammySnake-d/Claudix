<template>
  <div class="tab-bar-container">
    <div class="tabs-scroll-area custom-scroll-container">
      <div
        v-for="session in openSessions"
        :key="session.sessionId() || Math.random().toString()"
        class="tab-item"
        :class="{ active: session === activeSession }"
        @click="activateSession(session)"
        @mousedown.middle="handleClose(session)"
      >
        <span class="tab-title">{{ getSessionSummary(session) }}</span>
        <button
          class="tab-close-btn"
          @click.stop="handleClose(session)"
          title="Close Tab"
        >
          <span class="codicon codicon-close" />
        </button>
      </div>
    </div>

    <div class="tab-actions">
      <button class="icon-btn" @click="createNewSession" title="New Session">
        <span class="codicon codicon-plus" />
      </button>

      <DropdownTrigger
        ref="taskListTrigger"
        align="right"
        :width="300"
        :close-on-click-outside="true"
      >
        <template #trigger>
          <button class="icon-btn task-list-btn" title="Task List">
            <span class="codicon codicon-checklist" />
            <span v-if="busyCount > 0" class="badge">{{ busyCount }}</span>
          </button>
        </template>
        <template #content="{ close }">
          <TaskList @close="close" />
        </template>
      </DropdownTrigger>

      <button class="icon-btn" @click="$emit('history')" title="History">
        <span class="codicon codicon-history" />
      </button>

      <!-- Window Close Button (Optional, usually VSCode handles window close, but image shows a close button) -->
      <!-- <button class="icon-btn" @click="$emit('close-window')" title="Close">
        <span class="codicon codicon-chrome-close" />
      </button> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSessionStore } from '../composables/useSessionStore';
import type { Session } from '../core/Session';
import { useSignal } from '@gn8/alien-signals-vue';
import { DropdownTrigger } from './Dropdown';
import TaskList from './TaskList.vue';

const emit = defineEmits<{
  (e: 'history'): void;
}>();

const runtime = inject(RuntimeKey);
if (!runtime) throw new Error('[TabBar] runtime not provided');

const sessionStore = useSessionStore(runtime.sessionStore);
const openSessions = sessionStore.openSessions;
const activeSession = sessionStore.activeSession;

const taskListTrigger = ref<InstanceType<typeof DropdownTrigger>>();

const busyCount = computed(() => {
  return openSessions.value.filter(s => {
    const busy = useSignal(s.busy);
    return busy.value;
  }).length;
});

function getSessionSummary(session: Session) {
  const summary = useSignal(session.summary);
  return summary.value || 'New Session';
}

function activateSession(session: Session) {
  sessionStore.setActiveSession(session);
}

async function createNewSession() {
  const emptySession = openSessions.value.find(s => s.messages().length === 0 && s.messageCount() === 0);
  if (emptySession) {
    activateSession(emptySession);
    return;
  }
  await sessionStore.createSession({ isExplicit: true });
}

async function handleClose(session: Session) {
  if (session.busy()) {
    const confirmation = await runtime!.appContext.showNotification(
      'This session is currently in progress. Do you want to close it?',
      'info',
      ['Yes', 'No']
    );
    if (confirmation !== 'Yes') {
      return;
    }
    await session.interrupt();
  }
  sessionStore.closeSession(session);
}
</script>

<style scoped>
.tab-bar-container {
  display: flex;
  height: 35px;
  background-color: var(--vscode-titleBar-activeBackground);
  border-bottom: 1px solid var(--vscode-panel-border);
  align-items: center;
  padding: 0 4px;
  user-select: none;
}

.tabs-scroll-area {
  display: flex;
  flex: 1;
  overflow-x: auto;
  height: 100%;
  align-items: center;
  gap: 1px;
  scrollbar-width: none; /* Firefox */
}

.tabs-scroll-area::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.tab-item {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 8px 0 10px;
  background-color: color-mix(in srgb, var(--vscode-titleBar-activeBackground) 90%, black);
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 4px;
  margin-right: 1px;
  cursor: pointer;
  max-width: 160px;
  min-width: 80px;
  opacity: 0.7;
  transition: all 0.1s;
  border: 1px solid transparent;
}

.tab-item:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  opacity: 0.9;
}

.tab-item.active {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  opacity: 1;
  border-color: var(--vscode-panel-border);
  border-bottom-color: var(--vscode-editor-background);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tab-title {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 4px;
}

.tab-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, background-color 0.1s;
}

.tab-item:hover .tab-close-btn,
.tab-item.active .tab-close-btn {
  opacity: 0.7;
}

.tab-close-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
  opacity: 1 !important;
}

.tab-close-btn .codicon {
  font-size: 12px;
}

.tab-actions {
  display: flex;
  align-items: center;
  margin-left: 8px;
  gap: 2px;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--vscode-titleBar-activeForeground);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.1s;
  position: relative;
}

.icon-btn:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
}

.icon-btn .codicon {
  font-size: 16px;
}

.task-list-btn {
  /* Special style for task list button if needed */
}

.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  background-color: var(--vscode-activityBarBadge-background);
  color: var(--vscode-activityBarBadge-foreground);
  font-size: 9px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 2px;
  font-weight: bold;
}
</style>
