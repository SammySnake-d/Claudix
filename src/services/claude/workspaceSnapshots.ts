import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export type WorkspaceSnapshotKind = 'file' | 'missing' | 'other';

export interface WorkspaceSnapshotEntryV1 {
  version: 1;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  filePath: string;
  timestamp: string;
  kind: WorkspaceSnapshotKind;
  content?: string;
}

function getConfigDir(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
}

function getProjectsDir(): string {
  return path.join(getConfigDir(), 'projects');
}

function getProjectHistoryDir(cwd: string): string {
  return path.join(getProjectsDir(), cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

function getSnapshotsDir(cwd: string): string {
  return path.join(getProjectHistoryDir(cwd), '.claudix', 'snapshots');
}

export function getWorkspaceSnapshotLogPath(cwd: string, sessionId: string): string {
  return path.join(getSnapshotsDir(cwd), `${sessionId}.jsonl`);
}

async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function recordWorkspaceSnapshotForTool(params: {
  cwd: string;
  sessionId: string;
  toolUseId: string;
  toolName: string;
  filePath: string;
}): Promise<WorkspaceSnapshotEntryV1> {
  const { cwd, sessionId, toolUseId, toolName, filePath } = params;

  const snapshotsDir = getSnapshotsDir(cwd);
  await ensureDir(snapshotsDir);

  let kind: WorkspaceSnapshotKind = 'missing';
  let content: string | undefined;

  try {
    const stat = await fs.stat(filePath);
    if (stat.isFile()) {
      kind = 'file';
      content = await fs.readFile(filePath, 'utf8');
    } else {
      kind = 'other';
    }
  } catch {
    kind = 'missing';
  }

  const entry: WorkspaceSnapshotEntryV1 = {
    version: 1,
    sessionId,
    toolUseId,
    toolName,
    filePath,
    timestamp: new Date().toISOString(),
    kind,
    content,
  };

  const logPath = getWorkspaceSnapshotLogPath(cwd, sessionId);
  await fs.appendFile(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

export async function loadWorkspaceSnapshotsByToolUseId(params: {
  cwd: string;
  sessionId: string;
}): Promise<Map<string, WorkspaceSnapshotEntryV1>> {
  const { cwd, sessionId } = params;
  const logPath = getWorkspaceSnapshotLogPath(cwd, sessionId);

  let raw: string;
  try {
    raw = await fs.readFile(logPath, 'utf8');
  } catch {
    return new Map();
  }

  const snapshots = new Map<string, WorkspaceSnapshotEntryV1>();
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as WorkspaceSnapshotEntryV1;
      if (entry?.toolUseId && entry?.sessionId === sessionId) {
        snapshots.set(entry.toolUseId, entry);
      }
    } catch {
      // ignore malformed lines
    }
  }

  return snapshots;
}

export async function restoreWorkspaceFilesFromSnapshots(params: {
  cwd: string;
  sessionId: string;
  toolUseIds: string[];
}): Promise<{ restored: number; missing: number; errors: number }> {
  const { cwd, sessionId, toolUseIds } = params;
  if (toolUseIds.length === 0) {
    return { restored: 0, missing: 0, errors: 0 };
  }

  const snapshots = await loadWorkspaceSnapshotsByToolUseId({ cwd, sessionId });

  let restored = 0;
  let missing = 0;
  let errors = 0;

  for (const toolUseId of toolUseIds) {
    const snapshot = snapshots.get(toolUseId);
    if (!snapshot) {
      missing++;
      continue;
    }

    try {
      if (snapshot.kind === 'missing') {
        try {
          await fs.unlink(snapshot.filePath);
        } catch {
          // ignore
        }
      } else if (snapshot.kind === 'file') {
        await ensureDir(path.dirname(snapshot.filePath));
        await fs.writeFile(snapshot.filePath, snapshot.content ?? '', 'utf8');
      } else {
        // 'other' - skip
      }
      restored++;
    } catch {
      errors++;
    }
  }

  return { restored, missing, errors };
}

