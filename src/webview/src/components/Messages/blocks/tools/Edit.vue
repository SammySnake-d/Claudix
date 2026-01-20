<template>
  <ToolMessageWrapper
    tool-icon="codicon-edit"
    tool-name="Edit"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-diff-view': hasDiffView }"
  >
    <template #main>
      <span class="tool-label">Edit</span>
      <ToolFilePath v-if="filePath" :file-path="filePath" :context="context" />
      <span v-if="diffStats" class="diff-stats">
        <span v-if="diffStats.added > 0" class="stat-add">+{{ diffStats.added }}</span>
        <span v-if="diffStats.removed > 0" class="stat-remove">-{{ diffStats.removed }}</span>
      </span>
    </template>

    <!-- 展开内容：显示 diff 视图 -->
    <template #expandable>
      <!-- 替换选项 -->
      <div v-if="replaceAll" class="replace-option">
        <span class="codicon codicon-replace-all"></span>
        <span>全部替换</span>
      </div>

      <!-- Diff 视图 -->
      <div v-if="structuredPatch && structuredPatch.length > 0" class="diff-view">
        <!-- 文件标题栏 -->
        <div v-if="filePath" class="diff-file-header">
          <FileIcon :file-name="filePath" :size="16" class="file-icon" />
          <span class="file-name">{{ fileName }}</span>
        </div>
        <!-- Diff 双列布局:行号 + 内容 -->
        <div class="diff-scroll-container">
          <!-- 左侧:行号列 -->
          <div ref="lineNumbersRef" class="diff-line-numbers">
            <div v-for="(patch, index) in structuredPatch" :key="index">
              <div
                v-for="(line, lineIndex) in patch.lines"
                :key="lineIndex"
                class="line-number-item"
                :class="line.class"
              >
                {{ line.displayLineNumber }}
              </div>
            </div>
          </div>

          <!-- 右侧:内容列(可滚动) -->
          <div ref="contentRef" class="diff-content" @scroll="handleContentScroll">
            <div v-for="(patch, index) in structuredPatch" :key="index" class="diff-block">
              <div class="diff-lines">
                <div
                  v-for="(line, lineIndex) in patch.lines"
                  :key="lineIndex"
                  class="diff-line"
                  :class="line.class"
                >
                  <span class="line-prefix">{{ line.prefix }}</span>
                  <span class="line-content">{{ line.contentWithoutPrefix }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 错误内容 -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import FileIcon from '@/components/FileIcon.vue';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

const filePath = computed(() => {
  return props.toolUse?.input?.file_path || '';
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

const replaceAll = computed(() => {
  return props.toolUse?.input?.replace_all;
});

import { useDiff } from '@/composables/useDiff';

const {
  processedPatches: structuredPatch,
  hasDiffView,
  diffStats,
} = useDiff(props);

// 判断是否为权限请求阶段(临时 diff from input)
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult?.structuredPatch;
  const hasInputDiff = !!(props.toolUse?.input?.old_string && props.toolUse?.input?.new_string);

  return !hasToolUseResult && hasInputDiff;
});

// 只在权限请求阶段默认展开,执行完成后不展开
const shouldExpand = computed(() => {
  const result = hasDiffView.value && isPermissionRequest.value;
  return result;
});

// DOM 引用
const lineNumbersRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();

// 同步行号列和内容列的垂直滚动
function handleContentScroll() {
  if (lineNumbersRef.value && contentRef.value) {
    lineNumbersRef.value.scrollTop = contentRef.value.scrollTop;
  }
}

</script>

<style scoped>
/* 有 diff 视图时移除左侧边框和边距，error 保留默认样式 */
.has-diff-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.diff-stats {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  font-size: 0.85em;
  font-weight: 500;
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.replace-option {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--vscode-charts-orange);
  font-size: 0.85em;
  font-weight: 500;
  padding: 4px 0;
}

.replace-option .codicon {
  font-size: 12px;
}

.diff-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: .5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.diff-file-header :deep(.mdi),
.diff-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.diff-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
}

.diff-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* 左侧行号列 */
.diff-line-numbers {
  width: 50px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-right: 1px solid var(--vscode-panel-border);
}

.line-number-item {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: right;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

/* 右侧内容列 */
.diff-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco 风格滚动条(仅应用于内容列) */
.diff-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.diff-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.diff-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.diff-content::-webkit-scrollbar-corner {
  background: transparent;
}

.diff-block {
  width: 100%;
}

.diff-lines {
  background-color: var(--vscode-editor-background);
  width: fit-content;
  min-width: 100%;
}

.diff-line {
  display: flex;
  font-family: var(--vscode-editor-font-family);
  white-space: nowrap;
  height: 22px;
  line-height: 22px;
}

.line-prefix {
  display: inline-block;
  width: 20px;
  text-align: center;
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px 0 4px;
  white-space: pre;
}

.diff-line-delete {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
}

.diff-line-delete .line-content {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
}

.diff-line-add .line-content {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line-context {
  background-color: var(--vscode-editor-background);
}

.diff-line-context .line-prefix {
  color: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
}

.diff-line-context .line-content {
  color: var(--vscode-editor-foreground);
}
</style>
