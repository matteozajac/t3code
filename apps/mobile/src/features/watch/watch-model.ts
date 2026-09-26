import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  derivePendingRequests,
  type PendingApproval,
} from "@t3tools/client-runtime/pending-requests";
import type { OrchestrationThread } from "@t3tools/contracts";

export interface WatchCommand {
  id: string;
  kind: "refresh" | "openThread" | "prompt" | "approve" | "deny";
  threadID?: string;
  text?: string;
  requestID?: string;
}

export interface WatchThread {
  id: string;
  project: string;
  title: string;
  status: "working" | "needsInput" | "ready" | "idle" | "failed";
  updatedAt: string;
  progress?: { step: string; completedSteps: number; totalSteps: number };
  messages: Array<{ id: string; role: string; text: string }>;
  approval?: { id: string; title: string; detail: string };
  needsStructuredInput: boolean;
  runtimeMode: string;
  interactionMode: string;
}

export interface WatchSnapshot {
  environment: string;
  connection: "unpaired" | "connecting" | "connected" | "offline" | "authenticationRequired";
  updatedAt: string;
  threads: WatchThread[];
  isDemo: false;
  revision: number;
}

export interface WatchCommandResult {
  succeeded: boolean;
  message: string;
}

export interface WatchReply extends WatchCommandResult {
  snapshot?: WatchSnapshot;
}

export function watchReplyForDelivery(
  result: WatchCommandResult,
  snapshot: WatchSnapshot,
): WatchReply {
  // Only the mutation receipt is reusable. Conversation data must reflect the
  // account and environments at delivery time, including duplicate requests.
  return { succeeded: result.succeeded, message: result.message, snapshot };
}

export const MAX_WATCH_SNAPSHOT_BYTES = 50_000;
export const MAX_WATCH_PROMPT_CHARACTERS = 2_000;

export function visibleWatchEnvironments<
  Key,
  Value extends { entry: { enabled: boolean; target: { _tag: string } } },
>(presentations: ReadonlyMap<Key, Value>, relaySignedIn: boolean): Array<[Key, Value]> {
  return [...presentations].filter(
    ([, value]) =>
      value.entry.enabled && (value.entry.target._tag !== "RelayConnectionTarget" || relaySignedIn),
  );
}

export function watchThreadID(environmentId: string, threadId: string): string {
  return JSON.stringify([environmentId, threadId]);
}

export function parseWatchThreadID(
  value: string,
): { environmentId: string; threadId: string } | null {
  try {
    const pair: unknown = JSON.parse(value);
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      pair.some((part: unknown) => typeof part !== "string" || !part.trim() || part.length > 512)
    )
      return null;
    return { environmentId: pair[0] as string, threadId: pair[1] as string };
  } catch {
    return null;
  }
}

export function parseWatchCommand(json: string): WatchCommand | null {
  if (json.length > 8_000) return null;
  try {
    const value: unknown = JSON.parse(json);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const command = value as Record<string, unknown>;
    if (
      typeof command.id !== "string" ||
      !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(command.id)
    )
      return null;
    if (!["refresh", "openThread", "prompt", "approve", "deny"].includes(String(command.kind)))
      return null;
    if (command.kind === "refresh") return { id: command.id, kind: "refresh" };
    if (typeof command.threadID !== "string" || !parseWatchThreadID(command.threadID)) return null;
    if (
      command.kind === "prompt" &&
      (typeof command.text !== "string" ||
        !command.text.trim() ||
        command.text.length > MAX_WATCH_PROMPT_CHARACTERS)
    )
      return null;
    if (
      (command.kind === "approve" || command.kind === "deny") &&
      (typeof command.requestID !== "string" ||
        !command.requestID.trim() ||
        command.requestID.length > 512)
    )
      return null;
    return {
      id: command.id,
      kind: command.kind as WatchCommand["kind"],
      threadID: command.threadID,
      ...(typeof command.text === "string" ? { text: command.text.trim() } : {}),
      ...(typeof command.requestID === "string" ? { requestID: command.requestID } : {}),
    };
  } catch {
    return null;
  }
}

// The watch cannot show a full diff or permission scope. Never abbreviate the
// evidence for an approval, hide provider warnings, or offer persistent consent.
export function supportedWatchApproval(approval: PendingApproval): boolean {
  if (approval.requestKind !== "command" && approval.requestKind !== "file-read") return false;
  if (!approval.detail?.trim() || approval.detail.length > 800) return false;
  if (approval.options?.some((option) => option.warning)) return false;
  return (
    approval.options !== undefined &&
    ["accept", "decline"].every((decision) =>
      approval.options?.some((option) => option.decision === decision),
    )
  );
}

export function mapWatchThread(
  shell: EnvironmentThreadShell,
  project: string,
  detail: OrchestrationThread | null,
  detailIsLive: boolean,
): WatchThread {
  const pending = detail
    ? derivePendingRequests(detail.activities)
    : { approvals: [], userInputs: [] };
  const approval = detailIsLive ? pending.approvals.find(supportedWatchApproval) : undefined;
  const needsInput =
    shell.hasPendingApprovals ||
    shell.hasPendingUserInput ||
    shell.hasActionableProposedPlan ||
    pending.approvals.length > 0 ||
    pending.userInputs.length > 0;
  const working =
    shell.latestTurn?.state === "running" ||
    shell.session?.status === "starting" ||
    shell.session?.status === "running" ||
    shell.backgroundLiveness === "working";
  const failed = shell.latestTurn?.state === "error" || shell.session?.status === "error";
  return {
    id: watchThreadID(shell.environmentId, shell.id),
    project: project.slice(0, 100),
    title: shell.title.slice(0, 160),
    status: needsInput
      ? "needsInput"
      : failed
        ? "failed"
        : working
          ? "working"
          : shell.latestTurn?.state === "completed"
            ? "ready"
            : "idle",
    updatedAt: shell.updatedAt,
    ...(shell.planProgress
      ? { progress: { ...shell.planProgress, step: shell.planProgress.step.slice(0, 160) } }
      : {}),
    messages: (detail?.messages ?? [])
      .filter((message) => message.role === "user" || message.role === "assistant")
      .slice(-6)
      .map((message) => ({
        id: message.id,
        role: message.role,
        text: message.text.length > 900 ? `${message.text.slice(0, 899)}…` : message.text,
      })),
    ...(approval
      ? {
          approval: {
            id: approval.requestId,
            title: approval.requestKind === "command" ? "Run command?" : "Read file?",
            detail: approval.detail!,
          },
        }
      : {}),
    needsStructuredInput:
      shell.hasPendingUserInput ||
      shell.hasActionableProposedPlan ||
      ((shell.hasPendingApprovals || pending.approvals.length > 0) && !approval) ||
      pending.userInputs.length > 0,
    runtimeMode: shell.runtimeMode,
    interactionMode: shell.interactionMode,
  };
}

export function utf8Size(value: string): number {
  let size = 0;
  for (const char of value) {
    const point = char.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
}

export function boundWatchSnapshot(
  snapshot: WatchSnapshot,
  selectedThreadID?: string,
): WatchSnapshot {
  const threads = snapshot.threads.slice(0, 30).map((thread) => ({ ...thread }));
  const bounded = { ...snapshot, threads };
  // Keep the selected conversation. Drop other histories first, then the oldest
  // rows, so a Unicode-heavy reply still fits WatchConnectivity's message budget.
  for (
    let index = threads.length - 1;
    utf8Size(JSON.stringify(bounded)) > MAX_WATCH_SNAPSHOT_BYTES && index >= 0;
    index--
  ) {
    if (threads[index]!.id !== selectedThreadID) threads[index]!.messages = [];
  }
  while (utf8Size(JSON.stringify(bounded)) > MAX_WATCH_SNAPSHOT_BYTES && threads.length > 0) {
    const index = threads.findLastIndex((thread) => thread.id !== selectedThreadID);
    threads.splice(index < 0 ? 0 : index, 1);
  }
  return bounded;
}
