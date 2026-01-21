/**
 * ClaudeSessionService - 历史会话加载和管理
 *
 * 职责：
 * 1. 从 ~/.claude/projects/ 目录加载会话历史
 * 2. 解析 .jsonl 文件（每行一个 JSON 对象）
 * 3. 组织会话消息和生成摘要
 * 4. 支持会话列表查询和消息检索
 *
 * 依赖：
 * - ILogService: 日志服务
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { restoreWorkspaceFilesFromSnapshots } from './workspaceSnapshots';

export const IClaudeSessionService = createDecorator<IClaudeSessionService>('claudeSessionService');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 会话消息类型
 */
interface SessionMessage {
    uuid: string;
    sessionId: string;
    parentUuid?: string;
    timestamp: string;
    type: "user" | "assistant" | "attachment" | "system" | "summary";
    message?: any;
    isMeta?: boolean;
    isSidechain?: boolean;
    leafUuid?: string;
    summary?: string;
    toolUseResult?: any;
    gitBranch?: string;
    cwd?: string;

}

/**
 * 会话信息
 */
export interface SessionInfo {
    id: string;
    lastModified: number;
    messageCount: number;
    summary: string;
    isSidechain?: boolean;
    worktree?: string;
    isCurrentWorkspace: boolean;
}

/**
 * 会话服务接口
 */
export interface IClaudeSessionService {
    readonly _serviceBrand: undefined;

    /**
     * 列出指定工作目录的所有会话
     */
    listSessions(cwd: string): Promise<SessionInfo[]>;

    /**
     * 获取指定会话的所有消息
     */
    getSession(sessionIdOrPath: string, cwd: string): Promise<any[]>;

    /**
     * 回退到指定 checkpoint（基于当前会话 transcript 的 messageIndex）
     *
     * 返回回退后的 messages（格式与 getSession() 一致）
     */
    restoreCheckpoint(sessionIdOrPath: string, cwd: string, messageIndex: number): Promise<any[]>;
}

// ============================================================================
// 路径管理函数
// ============================================================================

/**
 * 获取 Claude 配置目录
 */
function getConfigDir(): string {
    return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
}

/**
 * 获取项目历史目录
 */
function getProjectsDir(): string {
    return path.join(getConfigDir(), "projects");
}

/**
 * 获取特定项目的历史目录
 */
function getProjectHistoryDir(cwd: string): string {
    return path.join(getProjectsDir(), cwd.replace(/[^a-zA-Z0-9]/g, "-"));
}

/**
 * UUID 正则表达式
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 验证 UUID
 */
function validateSessionId(id: string): string | null {
    return typeof id !== "string" ? null : UUID_REGEX.test(id) ? id : null;
}

/**
 * 读取 JSONL 文件
 */
async function readJSONL(filePath: string): Promise<SessionMessage[]> {
    try {
        const content = await fs.readFile(filePath, "utf8");
        if (!content.trim()) {
            return [];
        }

        return content
            .split("\n")
            .filter(line => line.trim())
            .map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter(obj => obj !== null) as SessionMessage[];
    } catch {
        return [];
    }
}

/**
 * 转换消息格式（用于返回给前端）
 */
function convertMessage(msg: SessionMessage): any | undefined {
    if (msg.isMeta) {
        return undefined;
    }

    if (msg.type === "user") {
        return {
            type: "user",
            message: msg.message,
            session_id: msg.uuid,
            parent_tool_use_id: null,
            toolUseResult: msg.toolUseResult
        };
    }

    if (msg.type === "assistant") {
        return {
            type: "assistant",
            message: msg.message,
            session_id: msg.uuid,
            parent_tool_use_id: null,
            uuid: msg.message?.id
        };
    }

    if (msg.type === "system" || msg.type === "attachment") {
        return undefined;
    }

    return undefined;
}

/**
 * 生成会话摘要
 */
function generateSummary(messages: SessionMessage[]): string {
    let firstUserMessage: SessionMessage | undefined;

    for (const msg of messages) {
        if (msg.type === "user" && !msg.isMeta) {
            firstUserMessage = msg;
        } else if (firstUserMessage) {
            break;
        }
    }

    if (!firstUserMessage || firstUserMessage.type !== "user") {
        return "No prompt";
    }

    const content = firstUserMessage.message?.content;
    let text = "";

    if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        // 从后向前查找最后一个 text 类型的项
        const textItems = content.filter((item: any) => item.type === "text");
        text = textItems.length > 0 ? textItems[textItems.length - 1]?.text || "No prompt" : "No prompt";
    } else {
        text = "No prompt";
    }

    // 去除换行符并截断
    text = text.replace(/\n/g, " ").trim();
    if (text.length > 45) {
        text = text.slice(0, 45) + "...";
    }

    return text;
}


// ============================================================================
// ClaudeSessionService 实现
// ============================================================================


// ============================================================================
// ClaudeSessionService 实现
// ============================================================================

/**
 * Claude 会话服务实现
 */
export class ClaudeSessionService implements IClaudeSessionService {
    readonly _serviceBrand: undefined;

    private _sessionCache = new Map<string, { mtime: number, info: SessionInfo }>();

    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        this.logService.info('[ClaudeSessionService] 已初始化');
    }

    /**
     * Scan a single session file to extract metadata without full parsing/loading into memory if possible.
     * Note: Currently we read full file to be safe but we don't store messages in global cache.
     * Future optimization: implement a streaming reader that stops after summary and counts lines.
     */
    private async _scanSessionInfo(filePath: string): Promise<SessionInfo | null> {
        const stat = await fs.stat(filePath);
        const messages = await readJSONL(filePath);
        if (messages.length === 0) {
            return null;
        }

        const sessionId = validateSessionId(path.basename(filePath, ".jsonl"));
        if (!sessionId) {
            return null;
        }

        // Find last message (leaf)
        // In linear logs, it is usually the last one.
        // We assume linear session for optimization.
        const lastMessage = messages[messages.length - 1];
        const firstMessage = messages[0];

        // Check for specific summary message
        let summary = generateSummary(messages);
        for (const msg of messages) {
            if (msg.type === "summary" && msg.leafUuid === lastMessage.uuid) {
                summary = msg.summary || summary;
                break;
            }
        }

        return {
            lastModified: stat.mtime.getTime(),
            messageCount: messages.length,
            isSidechain: firstMessage.isSidechain,
            id: sessionId,
            summary: summary,
            isCurrentWorkspace: true,
            worktree: firstMessage.cwd // Approximate
        };
    }

    /**
     * 列出指定工作目录的所有会话
     */
    async listSessions(cwd: string): Promise<SessionInfo[]> {
        try {
            this.logService.info(`[ClaudeSessionService] 加载会话列表: ${cwd}`);
            const projectDir = getProjectHistoryDir(cwd);

            let files: string[];
            try {
                files = await fs.readdir(projectDir);
            } catch {
                return [];
            }

            const sessions: SessionInfo[] = [];

            await Promise.all(files.map(async file => {
                if (!file.endsWith('.jsonl')) {
                    return;
                }
                const filePath = path.join(projectDir, file);

                try {
                    const stat = await fs.stat(filePath);
                    const cacheKey = filePath;
                    const cached = this._sessionCache.get(cacheKey);

                    if (cached && cached.mtime === stat.mtime.getTime()) {
                        sessions.push(cached.info);
                        return;
                    }

                    // Cache miss or stale
                    const info = await this._scanSessionInfo(filePath);
                    if (info) {
                        this._sessionCache.set(cacheKey, { mtime: stat.mtime.getTime(), info });
                        sessions.push(info);
                    }
                } catch (e) {
                    // Ignore error for single file
                }
            }));

            // Sort by last modified desc
            sessions.sort((a, b) => b.lastModified - a.lastModified);

            this.logService.info(`[ClaudeSessionService] 找到 ${sessions.length} 个会话`);
            return sessions;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] 加载会话列表失败:`, error);
            return [];
        }
    }

    /**
     * 获取指定会话的所有消息
     */
    async getSession(sessionIdOrPath: string, cwd: string): Promise<any[]> {
        try {
            this.logService.info(`[ClaudeSessionService] 获取会话消息: ${sessionIdOrPath}`);

            let filePath = sessionIdOrPath;
            if (!sessionIdOrPath.endsWith(".jsonl")) {
                const projectDir = getProjectHistoryDir(cwd);
                filePath = path.join(projectDir, `${sessionIdOrPath}.jsonl`);
            }

            const messages = await readJSONL(filePath);

            if (messages.length === 0) {
                return [];
            }

            // Build a map for O(1) parent lookup
            const messageMap = new Map<string, SessionMessage>();
            for (const msg of messages) {
                messageMap.set(msg.uuid, msg);
            }

            // Assume the last message in the file is the leaf of the current conversation
            // This is standard for append-only logs.
            let current: SessionMessage | undefined = messages[messages.length - 1];
            const transcript: SessionMessage[] = [];

            // Walk back up the tree
            while (current) {
                transcript.unshift(current);
                if (current.parentUuid) {
                    current = messageMap.get(current.parentUuid);
                } else {
                    current = undefined;
                }
            }

            const result = transcript
                .map(convertMessage)
                .filter(msg => !!msg);

            this.logService.info(`[ClaudeSessionService] 获取到 ${result.length} 条消息`);
            return result;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] 获取会话消息失败:`, error);
            return [];
        }
    }

    /**
     * 回退到指定 checkpoint（通过截断 ~/.claude/projects 下的 session jsonl 文件实现）
     */
    async restoreCheckpoint(sessionIdOrPath: string, cwd: string, messageIndex: number): Promise<any[]> {
        try {
            this.logService.info(`[ClaudeSessionService] Restore checkpoint: ${sessionIdOrPath} @ ${messageIndex}`);

            let filePath = sessionIdOrPath;
            if (!sessionIdOrPath.endsWith(".jsonl")) {
                const projectDir = getProjectHistoryDir(cwd);
                filePath = path.join(projectDir, `${sessionIdOrPath}.jsonl`);
            }

            const sessionId = validateSessionId(path.basename(filePath, ".jsonl")) ?? sessionIdOrPath;

            const messages = await readJSONL(filePath);
            if (messages.length === 0) {
                return [];
            }

            // Build a map for O(1) parent lookup
            const messageMap = new Map<string, SessionMessage>();
            for (const msg of messages) {
                messageMap.set(msg.uuid, msg);
            }

            // Assume the last message in the file is the leaf of the current conversation
            let current: SessionMessage | undefined = messages[messages.length - 1];
            const transcript: SessionMessage[] = [];
            while (current) {
                transcript.unshift(current);
                if (current.parentUuid) {
                    current = messageMap.get(current.parentUuid);
                } else {
                    current = undefined;
                }
            }

            // messageIndex is based on visible transcript (same as getSession output)
            const visible: SessionMessage[] = [];
            for (const msg of transcript) {
                if (convertMessage(msg)) {
                    visible.push(msg);
                }
            }

            if (messageIndex < 0 || messageIndex >= visible.length) {
                throw new Error(`Invalid messageIndex: ${messageIndex} (visible=${visible.length})`);
            }

            const target = visible[messageIndex];

            // We restore to the state *before* the target message (Cursor-like "put this user message back into input").
            // So we truncate the session file to the parent of the target (or to just before the target line).
            const targetFileIndex = messages.findIndex((m) => m.uuid === target.uuid);
            if (targetFileIndex < 0) {
                throw new Error(`Target message not found in session file: ${target.uuid}`);
            }

            let cutIndex = targetFileIndex - 1;
            if (target.parentUuid) {
                const parentFileIndex = messages.findIndex((m) => m.uuid === target.parentUuid);
                if (parentFileIndex >= 0) {
                    cutIndex = parentFileIndex;
                }
            }

            // Rewind workspace files for tool calls that happened after the checkpoint.
            try {
                const removed = cutIndex + 1 < messages.length ? messages.slice(cutIndex + 1) : [];
                const removedToolUseIds: string[] = [];

                for (const msg of removed) {
                    if (msg.type !== 'assistant') continue;
                    const content = msg.message?.content;
                    if (!Array.isArray(content)) continue;

                    for (const block of content) {
                        if (!block || block.type !== 'tool_use') continue;
                        const name = block.name;
                        if (name !== 'Write' && name !== 'Edit' && name !== 'MultiEdit' && name !== 'NotebookEdit') {
                            continue;
                        }
                        const id = block.id;
                        if (typeof id === 'string' && id) {
                            removedToolUseIds.push(id);
                        }
                    }
                }

                if (removedToolUseIds.length > 0) {
                    const result = await restoreWorkspaceFilesFromSnapshots({
                        cwd,
                        sessionId,
                        // Apply in reverse chronological order.
                        toolUseIds: removedToolUseIds.reverse(),
                    });
                    this.logService.info(
                        `[ClaudeSessionService] Workspace rewind applied. restored=${result.restored} missing=${result.missing} errors=${result.errors}`
                    );
                }
            } catch (e) {
                this.logService.warn?.(`[ClaudeSessionService] Workspace rewind failed: ${e instanceof Error ? e.message : String(e)}`);
            }

            let truncated = cutIndex >= 0 ? messages.slice(0, cutIndex + 1) : [];

            // Avoid writing a completely empty file (which would make the session disappear in listSessions()).
            if (truncated.length === 0) {
                truncated = [
                    {
                        uuid: crypto.randomUUID(),
                        sessionId,
                        timestamp: new Date().toISOString(),
                        type: "system",
                        isMeta: true,
                        cwd,
                    } satisfies SessionMessage
                ];
            }

            const newContent = truncated.map((m) => JSON.stringify(m)).join("\n") + "\n";
            await fs.writeFile(filePath, newContent, "utf8");

            // invalidate cache entry for this session file
            this._sessionCache.delete(filePath);

            const restored = visible
                .slice(0, Math.max(0, messageIndex))
                .map(convertMessage)
                .filter(msg => !!msg);

            this.logService.info(`[ClaudeSessionService] Checkpoint restored. messages=${restored.length}`);
            return restored;
        } catch (error) {
            this.logService.error(`[ClaudeSessionService] Restore checkpoint failed:`, error);
            return [];
        }
    }

}
