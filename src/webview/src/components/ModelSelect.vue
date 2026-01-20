<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="model-dropdown">
        <div class="dropdown-content">
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModelLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        v-for="(model, index) in displayModels"
        :key="model.value"
        :item="{
          id: model.value,
          label: model.displayName,
          description: model.description,
          checked: selectedModel === model.value,
          type: 'model'
        }"
        :is-selected="selectedModel === model.value"
        :index="index"
        @click="(item) => handleModelSelect(item, close)"
      />
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'

/**
 * ModelInfo from Claude Agent SDK - model information returned by supportedModels()
 */
interface ModelInfo {
  /** Model identifier to use in API calls */
  value: string
  /** Human-readable display name */
  displayName: string
  /** Description of the model's capabilities */
  description: string
}

/**
 * Default fallback models when SDK doesn't return any models
 * These match the model IDs expected by the Claude Agent SDK
 */
const DEFAULT_MODELS: ModelInfo[] = [
  {
    value: 'claude-sonnet-4-5-20250929',
    displayName: 'Sonnet 4.5',
    description: 'Best for most tasks - fast, intelligent, and cost-effective'
  },
  {
    value: 'claude-opus-4-5-20251101',
    displayName: 'Opus 4.5',
    description: 'Most capable model for complex tasks'
  },
  {
    value: 'claude-haiku-4-5-20251001',
    displayName: 'Haiku 4.5',
    description: 'Fastest model for simple tasks'
  }
]

interface Props {
  selectedModel?: string
  /** Available models from SDK's supportedModels() */
  models?: ModelInfo[]
}

interface Emits {
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  selectedModel: 'claude-sonnet-4-5-20250929',
  models: () => []
})

const emit = defineEmits<Emits>()

// Use SDK models if available, otherwise fall back to default models
const displayModels = computed(() => {
  if (props.models && props.models.length > 0) {
    return props.models
  }
  return DEFAULT_MODELS
})

// 计算显示的模型名称
const selectedModelLabel = computed(() => {
  // First try to find the model in the available models list
  const model = displayModels.value.find(m => m.value === props.selectedModel)
  if (model) {
    return model.displayName
  }

  // Fallback: extract display name from model ID
  // e.g., "claude-sonnet-4-5-20250929" -> "Sonnet 4.5"
  const modelId = props.selectedModel || ''
  if (modelId.includes('opus')) return 'Opus'
  if (modelId.includes('sonnet')) return 'Sonnet'
  if (modelId.includes('haiku')) return 'Haiku'

  // Ultimate fallback
  return displayModels.value[0]?.displayName || 'Sonnet 4.5'
})

function handleModelSelect(item: DropdownItemData, close: () => void) {
  console.log('Selected model:', item)
  close()

  // 发送模型切换事件
  emit('modelSelect', item.id)
}
</script>

<style scoped>
/* Model 下拉样式 - 简洁透明样式 */
.model-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2.5px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.model-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

/* 共享的 Dropdown 样式 */
.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}
</style>
