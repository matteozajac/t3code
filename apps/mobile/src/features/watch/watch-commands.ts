import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { derivePendingRequests } from "@t3tools/client-runtime/pending-requests";
import type {
  RespondToThreadApprovalInput,
  StartThreadTurnInput,
} from "@t3tools/client-runtime/state/threads";
import {
  ApprovalRequestId,
  CommandId,
  MessageId,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { supportedWatchApproval, watchThreadID, type WatchCommand } from "./watch-model";

type PreparedMutation =
  | { kind: "prompt"; input: StartThreadTurnInput }
  | { kind: "approval"; input: RespondToThreadApprovalInput }
  | { kind: "rejected"; message: string };

export function watchRequestMayDispatch(input: {
  active: boolean;
  expiresAt: number;
  expectedAccountId: string | null;
  currentAccountId: string | null;
  now: number;
}): boolean {
  return (
    input.active &&
    Number.isFinite(input.expiresAt) &&
    input.now < input.expiresAt - 1_000 &&
    input.expectedAccountId === input.currentAccountId
  );
}

export function prepareWatchMutation(
  command: WatchCommand,
  shell: EnvironmentThreadShell,
  detail: OrchestrationThread | null,
  detailIsLive: boolean,
): PreparedMutation {
  if (command.threadID !== watchThreadID(shell.environmentId, shell.id) || shell.archivedAt) {
    return { kind: "rejected", message: "This task is no longer available. Refresh on iPhone." };
  }
  if (command.kind === "prompt") {
    if (!command.text?.trim() || command.text.length > 2_000) {
      return { kind: "rejected", message: "Write a prompt of up to 2,000 characters." };
    }
    const pending = detail && detailIsLive ? derivePendingRequests(detail.activities) : null;
    if (
      shell.hasPendingApprovals ||
      shell.hasPendingUserInput ||
      shell.hasActionableProposedPlan ||
      (pending && (pending.approvals.length > 0 || pending.userInputs.length > 0))
    ) {
      return { kind: "rejected", message: "Answer the pending request on iPhone first." };
    }
    return {
      kind: "prompt",
      input: {
        commandId: CommandId.make(command.id),
        threadId: shell.id,
        message: {
          messageId: MessageId.make(command.id),
          role: "user",
          text: command.text.trim(),
          attachments: [],
        },
        modelSelection: shell.modelSelection,
        runtimeMode: shell.runtimeMode,
        interactionMode: shell.interactionMode,
      },
    };
  }
  if ((command.kind !== "approve" && command.kind !== "deny") || !detailIsLive || !detail) {
    return { kind: "rejected", message: "Open the task again to refresh its request." };
  }
  const approval = derivePendingRequests(detail.activities).approvals.find(
    (request) => request.requestId === command.requestID,
  );
  if (!approval || !supportedWatchApproval(approval)) {
    return { kind: "rejected", message: "This request changed or needs review on iPhone." };
  }
  return {
    kind: "approval",
    input: {
      commandId: CommandId.make(command.id),
      threadId: shell.id,
      requestId: ApprovalRequestId.make(approval.requestId),
      decision: command.kind === "approve" ? "accept" : "decline",
    },
  };
}
