<template>
  <div class="chat-page">
    <!-- 顶部 Tab 栏 -->
    <TabBar @history="$emit('switchToSessions')" />

    <!-- 主体：消息容器 -->
    <div class="main">
      <!-- <div class="chatContainer"> -->
        <div
          ref="containerEl"
          :class="['messagesContainer', 'custom-scroll-container', { dimmed: permissionRequestsLen > 0 }]"
        >
          <template v-if="messages.length === 0">
            <div v-if="isBusy" class="emptyState">
              <div class="emptyWordmark">
                <ClaudeWordmark class="emptyWordmarkSvg" />
              </div>
            </div>
            <div v-else class="emptyState">
              <div class="emptyWordmark">
                <ClaudeWordmark class="emptyWordmarkSvg" />
              </div>
              <RandomTip :platform="platform" />
            </div>
          </template>
          <template v-else>
            <!-- <div class="msg-list"> -->
              <MessageRenderer
                v-for="(m, i) in messages"
                :key="m?.id ?? i"
                :message="m"
                :context="toolContext"
                :index="i"
                :on-restore-checkpoint="handleRestoreCheckpoint"
              />
            <!-- </div> -->
            <div v-if="isBusy" class="spinnerRow">
              <Spinner :size="16" :permission-mode="permissionMode" />
            </div>
            <div ref="endEl" />
          </template>
        </div>

        <div class="inputContainer">
          <PermissionRequestModal
            v-if="pendingPermission && toolContext"
            :request="pendingPermission"
            :context="toolContext"
            :on-resolve="handleResolvePermission"
            data-permission-panel="1"
          />
          <MessageQueueList
            :queued-messages="queuedMessages"
            :visible="queuedMessages.length > 0"
            @remove="handleRemoveFromQueue"
            @send-now="handleSendNow"
          />
          <ChatInputBox
            ref="chatInputRef"
            :show-progress="true"
            :progress-percentage="progressPercentage"
            :conversation-working="isBusy"
            :attachments="attachments"
            :thinking-level="session?.thinkingLevel.value"
            :permission-mode="session?.permissionMode.value"
            :selected-model="session?.modelSelection.value"
            :models="session?.claudeConfig.value?.models"
            :is-enhancing="isEnhancing"
            @submit="handleSubmit"
            @queue-message="handleQueueMessage"
            @stop="handleStop"
            @add-attachment="handleAddAttachment"
            @remove-attachment="handleRemoveAttachment"
            @thinking-toggle="handleToggleThinking"
            @mode-select="handleModeSelect"
            @model-select="handleModelSelect"
            @sparkle="handleEnhancePrompt"
          />
        </div>
      <!-- </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue';
  import { RuntimeKey } from '../composables/runtimeContext';
  import { useSession } from '../composables/useSession';
  import type { Session } from '../core/Session';
  import type { PermissionRequest } from '../core/PermissionRequest';
  import type { ToolContext } from '../types/tool';
  import type { AttachmentItem } from '../types/attachment';
  import { convertFileToAttachment } from '../types/attachment';
  import type { QueuedMessage } from '../types/queue';
  import ChatInputBox from '../components/ChatInputBox.vue';
  import MessageQueueList from '../components/MessageQueueList.vue';
  import PermissionRequestModal from '../components/PermissionRequestModal.vue';
  import Spinner from '../components/Messages/WaitingIndicator.vue';
  import ClaudeWordmark from '../components/ClaudeWordmark.vue';
  import RandomTip from '../components/RandomTip.vue';
  import MessageRenderer from '../components/Messages/MessageRenderer.vue';
  import TabBar from '../components/TabBar.vue';
  import { useKeybinding } from '../utils/useKeybinding';
  import { useSignal } from '@gn8/alien-signals-vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

  const runtime = inject(RuntimeKey);
  if (!runtime) throw new Error('[ChatPage] runtime not provided');

  const toolContext = computed<ToolContext>(() => ({
    fileOpener: {
      open: (filePath: string, location?: any) => {
        void runtime.appContext.fileOpener.open(filePath, location);
      },
      openContent: (content: string, fileName: string, editable: boolean) => {
        return runtime.appContext.fileOpener.openContent(
          content,
          fileName,
          editable
        );
      },
    },
  }));

  // 订阅 activeSession（alien-signal → Vue ref）
  const activeSessionRaw = useSignal<Session | undefined>(
    runtime.sessionStore.activeSession
  );

  // 使用 useSession 将 alien-signals 转换为 Vue Refs
  const session = computed(() => {
    const raw = activeSessionRaw.value;
    return raw ? useSession(raw) : null;
  });

  // 现在所有访问都使用 Vue Ref（.value）
  const title = computed(() => session.value?.summary.value || 'New Conversation');
  const messages = computed<any[]>(() => session.value?.messages.value ?? []);
  const isBusy = computed(() => session.value?.busy.value ?? false);
  const permissionMode = computed(
    () => session.value?.permissionMode.value ?? 'default'
  );
  const permissionRequests = computed(
    () => session.value?.permissionRequests.value ?? []
  );
  const permissionRequestsLen = computed(() => permissionRequests.value.length);
  const pendingPermission = computed(() => permissionRequests.value[0] as any);
  const platform = computed(() => runtime.appContext.platform);

  // 注册命令：permissionMode.toggle（在下方定义函数后再注册）

  // 估算 Token 使用占比（基于 usageData）
  const progressPercentage = computed(() => {
    const s = session.value;
    if (!s) return 0;

    const usage = s.usageData.value;
    const total = usage.totalTokens;
    const windowSize = usage.contextWindow || 200000;

    if (typeof total === 'number' && total > 0) {
      return Math.max(0, Math.min(100, (total / windowSize) * 100));
    }

    return 0;
  });

  // DOM refs
  const containerEl = ref<HTMLDivElement | null>(null);
  const endEl = ref<HTMLDivElement | null>(null);
  const chatInputRef = ref<InstanceType<typeof ChatInputBox> | null>(null);

  // 附件状态管理
  const attachments = ref<AttachmentItem[]>([]);

  // 消息队列管理
  const queuedMessages = computed<QueuedMessage[]>({
    get: () => session.value?.queuedMessages.value ?? [],
    set: (val) => {
      if (session.value) {
        session.value.queuedMessages.value = val;
      }
    }
  });

  // Prompt enhance loading state
  const isEnhancing = ref(false);

  // 记录上次消息数量，用于判断是否需要滚动
  let prevCount = 0;

  function stringify(m: any): string {
    try {
      return JSON.stringify(m ?? {}, null, 2);
    } catch {
      return String(m);
    }
  }

  function scrollToBottom(): void {
    const end = endEl.value;
    if (!end) return;
    requestAnimationFrame(() => {
      try {
        end.scrollIntoView({ block: 'end' });
      } catch {}
    });
  }

  watch(session, async () => {
    // 切换会话：复位并滚动底部
    prevCount = 0;
    await nextTick();
    scrollToBottom();
  });

  // moved above

  watch(
    () => messages.value.length,
    async len => {
      const increased = len > prevCount;
      prevCount = len;
      if (increased) {
        await nextTick();
        scrollToBottom();
      }
    }
  );

  watch(permissionRequestsLen, async () => {
    // 有权限请求出现时也确保滚动到底部
    await nextTick();
    scrollToBottom();
  });

  onMounted(async () => {
    prevCount = messages.value.length;
    await nextTick();
    scrollToBottom();
  });

  onUnmounted(() => {
    try { unregisterToggle?.(); } catch {}
  });

  async function createNew(): Promise<void> {
    if (!runtime) return;

    // 1. 先尝试通过 appContext.startNewConversationTab 创建新标签（多标签模式）
    if (runtime.appContext.startNewConversationTab()) {
      return;
    }

    // 2. 如果不是多标签模式，检查当前会话是否为空
    const currentMessages = messages.value;
    if (currentMessages.length === 0) {
      // 当前已经是空会话，无需创建新会话
      return;
    }

    // 3. 当前会话有内容，创建新会话
    await runtime.sessionStore.createSession({ isExplicit: true });
  }

  // ChatInput 事件处理
  async function handleSubmit(content: string) {
    const s = session.value;
    const trimmed = (content || '').trim();
    if (!s || (!trimmed && attachments.value.length === 0) || isBusy.value) return;

    try {
      // 传递附件给 send 方法
      await s.send(trimmed || ' ', attachments.value);

      // 发送成功后清空附件
      attachments.value = [];
    } catch (e) {
      console.error('[ChatPage] send failed', e);
    }
  }

  function handleQueueMessage(content: string) {
    const s = session.value;
    if (!s) return;

    const trimmed = (content || '').trim();
    if (!trimmed && attachments.value.length === 0) return;

    // 添加到队列
    s.queuedMessages.value = [
      ...s.queuedMessages.value,
      {
        id: Date.now().toString() + Math.random().toString().slice(2),
        content: trimmed,
        attachments: [...attachments.value],
        timestamp: Date.now()
      }
    ];

    // 清空当前附件，准备下一条消息
    attachments.value = [];
  }

  function handleRemoveFromQueue(id: string) {
    const s = session.value;
    if (!s) return;
    s.queuedMessages.value = s.queuedMessages.value.filter(m => m.id !== id);
  }

  async function handleSendNow(id: string) {
    const s = session.value;
    if (!s) return;

    const currentQueue = [...s.queuedMessages.value];
    const index = currentQueue.findIndex(m => m.id === id);
    if (index === -1) return;

    // 移动到队列头部
    const [msg] = currentQueue.splice(index, 1);
    currentQueue.unshift(msg);
    s.queuedMessages.value = currentQueue;

    // 如果当前正在忙碌，尝试中断
    if (s.busy.value) {
      // 中断后，isBusy 会变为 false，触发 watcher 处理队列
      void s.interrupt();
    } else {
      // 如果空闲，直接处理队列
      void processQueue();
    }
  }

  async function processQueue() {
    const s = session.value;
    // 确保有会话，且队列不为空，且当前不忙
    if (!s || s.queuedMessages.value.length === 0 || s.busy.value) return;

    const currentQueue = [...s.queuedMessages.value];
    const msg = currentQueue.shift();
    s.queuedMessages.value = currentQueue;

    if (!msg) return;

    try {
      await s.send(msg.content, msg.attachments);
    } catch (e) {
      console.error('[ChatPage] failed to send queued message', e);
      // 可选：发送失败是否放回队列？或者提示错误？
      // 目前策略：失败则丢弃，避免死循环
    }
  }

  // 监听 busy 状态，当变为空闲时处理队列
  watch(isBusy, (newBusy) => {
    if (!newBusy) {
      // 使用 nextTick 确保状态完全更新
      nextTick(() => {
        processQueue();
      });
    }
  });

  async function handleRestoreCheckpoint(messageIndex: number) {
    const s = session.value;
    if (!s) return;
    const restoreSessionId = s.sessionId.value;

    try {
      const raw = messages.value?.[messageIndex];
      const draft = extractDraftFromMessage(raw);
      await s.restoreCheckpoint(messageIndex);
      const currentSession = session.value;
      if (!currentSession || currentSession !== s) {
        return;
      }
      if (
        restoreSessionId &&
        currentSession.sessionId.value &&
        currentSession.sessionId.value !== restoreSessionId
      ) {
        return;
      }
      // Put the restored user input back into the input box (Cursor-like behavior)
      if (chatInputRef.value) {
        chatInputRef.value.setContent?.(draft.text || '');
        chatInputRef.value.focus?.();
      }
      attachments.value = draft.attachments;
      await nextTick();
      scrollToBottom();
    } catch (e) {
      console.error('[ChatPage] restoreCheckpoint failed', e);
    }
  }

  function extractDraftFromMessage(message: any): { text: string; attachments: AttachmentItem[] } {
    const content = message?.message?.content;
    let text = '';
    const extracted: AttachmentItem[] = [];

    if (typeof content === 'string') {
      text = content;
      return { text, attachments: extracted };
    }

    if (!Array.isArray(content)) {
      return { text, attachments: extracted };
    }

    const textParts: string[] = [];
    let index = 0;

    for (const wrapper of content) {
      const block = wrapper?.content;
      if (!block) continue;

      if (block.type === 'text') {
        if (typeof block.text === 'string') {
          textParts.push(block.text);
        }
        continue;
      }

      if (block.type === 'image' && block.source?.type === 'base64') {
        const ext = block.source.media_type?.split('/')[1] || 'png';
        extracted.push({
          id: `image-${index++}`,
          fileName: `image.${ext}`,
          mediaType: (block.source.media_type || 'image/png').toLowerCase(),
          data: block.source.data,
          fileSize: 0,
        });
        continue;
      }

      if (block.type === 'document' && block.source) {
        const title = block.title || 'document';
        const mediaType = (block.source.media_type || 'application/octet-stream').toLowerCase();

        let data = '';
        if (block.source.type === 'base64') {
          data = block.source.data;
        } else if (block.source.type === 'text') {
          try {
            data = typeof globalThis.btoa === 'function' ? globalThis.btoa(block.source.data) : '';
          } catch {
            data = '';
          }
        }

        if (data) {
          extracted.push({
            id: `document-${index++}`,
            fileName: title,
            mediaType,
            data,
            fileSize: 0,
          });
        }
      }
    }

    text = textParts.join(' ').trim();
    return { text, attachments: extracted };
  }

  async function handleToggleThinking() {
    const s = session.value;
    if (!s) return;

    const currentLevel = s.thinkingLevel.value;
    const newLevel = currentLevel === 'off' ? 'default_on' : 'off';

    await s.setThinkingLevel(newLevel);
  }

  async function handleModeSelect(mode: PermissionMode) {
    const s = session.value;
    if (!s) return;

    await s.setPermissionMode(mode);
  }

  // permissionMode.toggle：按固定顺序轮转
  const togglePermissionMode = () => {
    const s = session.value;
    if (!s) return;
    const order: PermissionMode[] = ['bypassPermissions', 'default', 'acceptEdits', 'plan'];
    const cur = (s.permissionMode.value as PermissionMode) ?? 'default';
    const idx = Math.max(0, order.indexOf(cur));
    const next = order[(idx + 1) % order.length];
    void s.setPermissionMode(next);
  };

  // 现在注册命令（toggle 已定义）
  const unregisterToggle = runtime.appContext.commandRegistry.registerAction(
    {
      id: 'permissionMode.toggle',
      label: 'Toggle Permission Mode',
      description: 'Cycle permission mode in fixed order'
    },
    'App Shortcuts',
    () => {
      togglePermissionMode();
    }
  );

  // 注册快捷键：shift+tab → permissionMode.toggle（允许在输入区生效）
  useKeybinding({
    keys: 'shift+tab',
    handler: togglePermissionMode,
    allowInEditable: true,
    priority: 100,
  });

  async function handleModelSelect(modelId: string) {
    const s = session.value;
    if (!s) return;

    await s.setModel({ value: modelId });
  }

  function handleStop() {
    const s = session.value;
    if (s) {
      // 方法已经在 useSession 中绑定，可以直接调用
      void s.interrupt();
    }
  }

  async function handleEnhancePrompt(content: string) {
    if (!content.trim() || !runtime) return;

    isEnhancing.value = true;
    try {
      const connection = await runtime.connectionManager.get();
      const enhanced = await connection.enhancePrompt(content);
      if (enhanced && chatInputRef.value) {
        chatInputRef.value.setContent(enhanced);
      }
    } catch (e) {
      console.error('[ChatPage] Enhance prompt failed', e);
      try {
        const message = e instanceof Error ? e.message : String(e);
        await runtime.appContext.showNotification(
          `Prompt enhancement failed: ${message}`,
          'error'
        );
      } catch (inner) {
        console.error('Failed to show notification', inner);
      }
    } finally {
      isEnhancing.value = false;
    }
  }

  async function handleAddAttachment(files: FileList) {
    if (!files || files.length === 0) return;

    try {
      // 将所有文件转换为 AttachmentItem
      const conversions = await Promise.all(
        Array.from(files).map(convertFileToAttachment)
      );

      // 添加到附件列表
      attachments.value = [...attachments.value, ...conversions];

      console.log('[ChatPage] Added attachments:', conversions.map(a => a.fileName));
    } catch (e) {
      console.error('[ChatPage] Failed to convert files:', e);
    }
  }

  function handleRemoveAttachment(id: string) {
    attachments.value = attachments.value.filter(a => a.id !== id);
  }

  // Permission modal handler
  function handleResolvePermission(request: PermissionRequest, allow: boolean) {
    try {
      if (allow) {
        request.accept(request.inputs);
      } else {
        request.reject('User denied', true);
      }
    } catch (e) {
      console.error('[ChatPage] permission resolve failed', e);
    }
  }
</script>

<style scoped>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--vscode-panel-border);
    min-height: 32px;
    padding: 0 12px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    flex: 1;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-titleBar-activeForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
    opacity: 0.7;
  }

  .menu-btn .codicon {
    font-size: 12px;
  }

  .menu-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .chat-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-titleBar-activeForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-right {
    display: flex;
    gap: 4px;
  }

  .new-chat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-titleBar-activeForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
    opacity: 0.7;
  }

  .new-chat-btn .codicon {
    font-size: 12px;
  }

  .new-chat-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* Chat 容器与消息滚动容器（对齐 React） */
  .chatContainer {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .messagesContainer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 0 12px;
    position: relative;
  }
  .messagesContainer.dimmed {
    filter: blur(1px);
    opacity: 0.5;
    pointer-events: none;
  }

  .msg-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 12px;
  }

  .msg-item {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 8px;
  }

  .json-block {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(
      --app-monospace-font-family,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    );
    font-size: var(--app-monospace-font-size, 12px);
    line-height: 1.5;
    color: var(--vscode-editor-foreground);
  }

  /* 其他样式复用 */

  /* 输入区域容器 */
  .inputContainer {
    padding: 8px 12px 12px;
  }

  /* 底部对话框区域钉在底部 */
  .main > :last-child {
    flex-shrink: 0;
    background-color: var(--vscode-sideBar-background);
    /* border-top: 1px solid var(--vscode-panel-border); */
    max-width: 1200px;
    width: 100%;
    align-self: center;
  }

  /* 空状态样式 */
  .emptyState {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px 16px;
  }

  .emptyWordmark {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }
</style>
