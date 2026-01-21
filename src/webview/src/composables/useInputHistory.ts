import { ref, watch, type Ref } from 'vue'

export interface InputHistoryEntry {
  text: string
  ts: number
}

interface InputHistoryState {
  version: number
  items: InputHistoryEntry[]
}

const STORAGE_PREFIX = 'claudix-input-history:'
const STORAGE_VERSION = 1
const MAX_ENTRIES = 100

function buildStorageKey(sessionId: string): string {
  return `${STORAGE_PREFIX}${sessionId}`
}

function sanitizeItems(items: InputHistoryEntry[]): InputHistoryEntry[] {
  const result: InputHistoryEntry[] = []
  for (const item of items) {
    if (!item || typeof item.text !== 'string') continue
    const ts = typeof item.ts === 'number' ? item.ts : Date.now()
    result.push({ text: item.text, ts })
    if (result.length >= MAX_ENTRIES) {
      break
    }
  }
  return result
}

function loadFromStorage(sessionId: string): InputHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(buildStorageKey(sessionId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as InputHistoryState
    if (!parsed || parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) {
      return []
    }
    return sanitizeItems(parsed.items)
  } catch {
    return []
  }
}

function saveToStorage(sessionId: string, items: InputHistoryEntry[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    const payload: InputHistoryState = {
      version: STORAGE_VERSION,
      items
    }
    localStorage.setItem(buildStorageKey(sessionId), JSON.stringify(payload))
  } catch {}
}

export function useInputHistory(sessionId: Ref<string | undefined>) {
  const items = ref<InputHistoryEntry[]>([])
  const inMemoryItems = ref<InputHistoryEntry[]>([])
  const historyIndex = ref(-1)
  const draft = ref('')
  // 记住最后一个有效的 sessionId，用于 restore 后继续访问历史
  const lastKnownSessionId = ref<string | undefined>(sessionId.value)
  const activeSessionId = ref<string | undefined>(sessionId.value)

  function setItems(nextItems: InputHistoryEntry[]) {
    items.value = nextItems
  }

  function persist(nextItems: InputHistoryEntry[]) {
    // 优先使用 activeSessionId，其次使用 lastKnownSessionId
    const sid = activeSessionId.value || lastKnownSessionId.value
    if (sid) {
      saveToStorage(sid, nextItems)
    } else {
      inMemoryItems.value = nextItems
    }
  }

  function loadForSession(nextSessionId: string | undefined, prevSessionId: string | undefined) {
    // 重置草稿和索引
    draft.value = ''
    historyIndex.value = -1

    if (!nextSessionId) {
      // sessionId 变为 undefined（如 restore 到最初状态）
      // 保留 lastKnownSessionId，继续使用之前的历史
      if (lastKnownSessionId.value) {
        // 不清空 items，保留之前的历史记录
        return
      }
      items.value = inMemoryItems.value
      return
    }

    // 更新 lastKnownSessionId
    lastKnownSessionId.value = nextSessionId

    const stored = loadFromStorage(nextSessionId)
    if (!prevSessionId && inMemoryItems.value.length > 0) {
      const merged = [...inMemoryItems.value, ...stored].slice(0, MAX_ENTRIES)
      items.value = merged
      inMemoryItems.value = []
      saveToStorage(nextSessionId, merged)
    } else {
      items.value = stored
    }
  }

  watch(
    sessionId,
    (next, prev) => {
      activeSessionId.value = next
      loadForSession(next, prev)
    },
    { immediate: true }
  )

  function record(text: string) {
    const raw = text ?? ''
    if (!raw.trim()) return
    const entry: InputHistoryEntry = { text: raw, ts: Date.now() }
    const nextItems = [entry, ...items.value].slice(0, MAX_ENTRIES)
    setItems(nextItems)
    persist(nextItems)
  }

  function movePrevious(currentText: string): string | null {
    if (items.value.length === 0) return null
    if (historyIndex.value === -1) {
      draft.value = currentText
    }
    if (historyIndex.value >= items.value.length - 1) {
      return null
    }
    historyIndex.value += 1
    return items.value[historyIndex.value]?.text ?? null
  }

  function moveNext(): string | null {
    if (historyIndex.value === -1) return null
    if (historyIndex.value === 0) {
      historyIndex.value = -1
      return draft.value
    }
    historyIndex.value -= 1
    return items.value[historyIndex.value]?.text ?? ''
  }

  function setDraft(text: string) {
    draft.value = text ?? ''
    historyIndex.value = -1
  }

  return {
    record,
    movePrevious,
    moveNext,
    setDraft
  }
}
