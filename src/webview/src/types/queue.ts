import type { AttachmentItem } from './attachment'

// 消息队列类型定义

export interface QueuedMessage {
  id: string
  content: string
  attachments: AttachmentItem[]
  timestamp: number
}

export interface MessageQueueState {
  queuedMessages: QueuedMessage[]
}
