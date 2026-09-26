import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  ApprovalRequestId,
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { prepareWatchMutation, watchRequestMayDispatch } from "./watch-commands";
import {
  boundWatchSnapshot,
  mapWatchThread,
  MAX_WATCH_SNAPSHOT_BYTES,
  parseWatchCommand,
  parseWatchThreadID,
  supportedWatchApproval,
  utf8Size,
  visibleWatchEnvironments,
  watchReplyForDelivery,
  watchThreadID,
  type WatchCommand,
  type WatchSnapshot,
  type WatchReply,
} from "./watch-model";

const date = "2026-09-26T12:00:00.000Z";
const commandId = "249b3c17-a7ed-4610-bf30-03e4c1d86cd5";

function shell(overrides: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId: EnvironmentId.make("environment"),
    id: ThreadId.make("thread"),
    projectId: ProjectId.make("project"),
    title: "Improve watch support",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    runtimeMode: "approval-required",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    pullRequests: [],
    latestTurn: null,
    createdAt: date,
    updatedAt: date,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

function detail(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
    ...shell(),
    deletedAt: null,
    messages: [],
    activities: [],
    checkpoints: [],
    proposedPlans: [],
    ...overrides,
  };
}

function approvalDetail(): OrchestrationThread {
  return detail({
    activities: [
      {
        id: EventId.make("approval-event"),
        kind: "approval.requested",
        tone: "approval",
        summary: "Run tests",
        createdAt: date,
        turnId: null,
        payload: {
          requestId: "request",
          requestKind: "command",
          detail: "pnpm test",
          options: [
            { decision: "accept", label: "Accept" },
            { decision: "decline", label: "Decline" },
          ],
        },
      },
    ],
  });
}

function command(kind: WatchCommand["kind"], overrides: Partial<WatchCommand> = {}): WatchCommand {
  return { id: commandId, kind, threadID: watchThreadID("environment", "thread"), ...overrides };
}

describe("watch payloads", () => {
  it("reuses a command receipt without replaying the previous account's conversation", () => {
    const previous: WatchSnapshot = {
      environment: "Private account",
      connection: "connected",
      threads: [mapWatchThread(shell(), "Private project", detail(), true)],
      updatedAt: date,
      isDemo: false,
      revision: 1,
    };
    const receipt: WatchReply = {
      succeeded: true,
      message: "Sent to T3 Code.",
      snapshot: previous,
    };
    const signedOut: WatchSnapshot = {
      environment: "T3 Code on iPhone",
      connection: "unpaired",
      threads: [],
      updatedAt: date,
      isDemo: false,
      revision: 2,
    };
    const replay = watchReplyForDelivery(receipt, signedOut);
    expect(replay.succeeded).toBe(true);
    expect(replay.snapshot).toEqual(signedOut);
    expect(JSON.stringify(replay)).not.toContain("Private");
    const newAccount = {
      ...signedOut,
      connection: "connected" as const,
      environment: "New account",
      revision: 3,
    };
    expect(watchReplyForDelivery(receipt, newAccount).snapshot?.revision).toBe(3);
    expect(receipt.snapshot).toEqual(previous);
  });
  it("clears signed-out relay environments while preserving enabled direct environments", () => {
    const presentations = new Map([
      ["relay", { entry: { enabled: true, target: { _tag: "RelayConnectionTarget" } } }],
      ["direct", { entry: { enabled: true, target: { _tag: "BearerConnectionTarget" } } }],
      ["disabled", { entry: { enabled: false, target: { _tag: "BearerConnectionTarget" } } }],
    ]);
    expect(visibleWatchEnvironments(presentations, true).map(([id]) => id)).toEqual([
      "relay",
      "direct",
    ]);
    expect(visibleWatchEnvironments(presentations, false).map(([id]) => id)).toEqual(["direct"]);
    presentations.delete("direct");
    expect(visibleWatchEnvironments(presentations, false)).toEqual([]);
  });
  it("scopes identical thread IDs to their environment and rejects malformed references", () => {
    expect(watchThreadID("first", "thread")).not.toBe(watchThreadID("second", "thread"));
    expect(parseWatchThreadID(watchThreadID("environment:🌍", "thread/1"))).toEqual({
      environmentId: "environment:🌍",
      threadId: "thread/1",
    });
    expect(parseWatchThreadID('["environment"]')).toBeNull();
    expect(parseWatchThreadID('["environment",{}]')).toBeNull();
  });

  it("requires explicit short commands and ignores unknown fields", () => {
    expect(
      parseWatchCommand(JSON.stringify(command("prompt", { text: "  Check tests  " }))),
    ).toMatchObject({ text: "Check tests" });
    expect(parseWatchCommand(JSON.stringify(command("prompt", { text: " " })))).toBeNull();
    expect(
      parseWatchCommand(JSON.stringify(command("prompt", { text: "x".repeat(2_001) }))),
    ).toBeNull();
    expect(parseWatchCommand(JSON.stringify({ ...command("prompt"), kind: "delete" }))).toBeNull();
    expect(
      parseWatchCommand(JSON.stringify({ ...command("refresh"), token: "must-not-cross" })),
    ).toEqual({ id: commandId, kind: "refresh" });
  });

  it("ships only user and assistant text, truncates long replies, and carries real plan counts", () => {
    const messages = ["user", "reasoning", "system", "assistant"].map((role, index) => ({
      id: MessageId.make(String(index)),
      role,
      text: "A".repeat(1_000),
      turnId: null,
      streaming: false,
      createdAt: date,
      updatedAt: date,
    })) as OrchestrationThread["messages"];
    const value = mapWatchThread(
      shell({ planProgress: { step: "Build", completedSteps: 2, totalSteps: 4 } }),
      "T3 Code",
      detail({ messages }),
      true,
    );
    expect(value.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(value.messages.every((message) => message.text.length === 900)).toBe(true);
    expect(value.progress).toEqual({ step: "Build", completedSteps: 2, totalSteps: 4 });
    expect(Object.keys(value)).not.toContain("modelSelection");
  });

  it("does not present cached approval evidence as actionable", () => {
    const value = mapWatchThread(
      shell({ hasPendingApprovals: true }),
      "T3",
      approvalDetail(),
      false,
    );
    expect(value.approval).toBeUndefined();
    expect(value.needsStructuredInput).toBe(true);
    expect(value.status).toBe("needsInput");
  });

  it("keeps selected conversation while bounding multibyte data below the native transport limit", () => {
    const message = {
      id: MessageId.make("reply"),
      role: "assistant" as const,
      text: "🌍".repeat(2_000),
      turnId: null,
      streaming: false,
      createdAt: date,
      updatedAt: date,
    };
    const threads = Array.from({ length: 35 }, (_, index) =>
      mapWatchThread(
        shell({ id: ThreadId.make(String(index)), title: "🌍".repeat(200) }),
        "🌍".repeat(200),
        detail({ messages: Array.from({ length: 6 }, () => message) }),
        true,
      ),
    );
    const selected = threads[2]!.id;
    const snapshot: WatchSnapshot = {
      environment: "iPhone",
      connection: "connected",
      threads,
      updatedAt: date,
      isDemo: false,
      revision: 1,
    };
    const bounded = boundWatchSnapshot(snapshot, selected);
    expect(utf8Size(JSON.stringify(bounded))).toBeLessThanOrEqual(MAX_WATCH_SNAPSHOT_BYTES);
    expect(bounded.threads.length).toBeLessThanOrEqual(30);
    expect(bounded.threads.find((thread) => thread.id === selected)?.messages).toHaveLength(6);
    expect(snapshot.threads[29]!.messages).toHaveLength(6);
  });
});

describe("watch mutations", () => {
  it("prevents dispatch after expiry, unmount, or an account switch", () => {
    const request = {
      active: true,
      expiresAt: 20_000,
      now: 5_000,
      expectedAccountId: "user",
      currentAccountId: "user",
    };
    expect(watchRequestMayDispatch(request)).toBe(true);
    expect(watchRequestMayDispatch({ ...request, now: 19_000 })).toBe(false);
    expect(watchRequestMayDispatch({ ...request, active: false })).toBe(false);
    expect(watchRequestMayDispatch({ ...request, currentAccountId: null })).toBe(false);
    expect(watchRequestMayDispatch({ ...request, currentAccountId: "another" })).toBe(false);
    expect(watchRequestMayDispatch({ ...request, expiresAt: Number.NaN })).toBe(false);
  });
  it("uses authoritative phone thread settings and stable IDs for a follow-up", () => {
    const value = prepareWatchMutation(
      command("prompt", { text: "Check tests" }),
      shell({ runtimeMode: "full-access" }),
      null,
      false,
    );
    expect(value.kind).toBe("prompt");
    if (value.kind !== "prompt") return;
    expect(value.input).toMatchObject({
      commandId,
      runtimeMode: "full-access",
      interactionMode: "default",
      message: { messageId: commandId, role: "user", text: "Check tests", attachments: [] },
    });
  });

  it("rejects stale or cross-environment targets and prompts during required input", () => {
    expect(
      prepareWatchMutation(
        command("prompt", { text: "Hello" }),
        shell({ environmentId: EnvironmentId.make("another") }),
        null,
        false,
      ).kind,
    ).toBe("rejected");
    expect(
      prepareWatchMutation(
        command("prompt", { text: "Hello" }),
        shell({ archivedAt: date }),
        null,
        false,
      ).kind,
    ).toBe("rejected");
    expect(
      prepareWatchMutation(
        command("prompt", { text: "Hello" }),
        shell({ hasPendingUserInput: true }),
        null,
        false,
      ).kind,
    ).toBe("rejected");
  });

  it("only answers the currently pending request with one-time approval", () => {
    const value = prepareWatchMutation(
      command("approve", { requestID: "request" }),
      shell(),
      approvalDetail(),
      true,
    );
    expect(value).toMatchObject({
      kind: "approval",
      input: { decision: "accept", requestId: "request", commandId },
    });
    expect(
      prepareWatchMutation(
        command("deny", { requestID: "request" }),
        shell(),
        approvalDetail(),
        true,
      ),
    ).toMatchObject({ kind: "approval", input: { decision: "decline" } });
    expect(
      prepareWatchMutation(
        command("approve", { requestID: "old" }),
        shell(),
        approvalDetail(),
        true,
      ).kind,
    ).toBe("rejected");
    expect(
      prepareWatchMutation(
        command("approve", { requestID: "request" }),
        shell(),
        approvalDetail(),
        false,
      ).kind,
    ).toBe("rejected");
  });

  it("honors a newly streamed approval before the shell has received its pending flag", () => {
    expect(
      prepareWatchMutation(command("prompt", { text: "Continue" }), shell(), approvalDetail(), true)
        .kind,
    ).toBe("rejected");
    expect(mapWatchThread(shell(), "T3", approvalDetail(), true).status).toBe("needsInput");
  });

  it("routes broad, truncated, warned, and persistent-only approvals to iPhone", () => {
    const approval = {
      requestId: ApprovalRequestId.make("request"),
      requestKind: "command" as const,
      createdAt: date,
      detail: "pnpm test",
      options: [
        { decision: "accept" as const, label: "Accept" },
        { decision: "decline" as const, label: "Decline" },
      ],
    };
    expect(supportedWatchApproval(approval)).toBe(true);
    expect(supportedWatchApproval({ ...approval, options: undefined })).toBe(false);
    expect(supportedWatchApproval({ ...approval, requestKind: "file-change" })).toBe(false);
    expect(supportedWatchApproval({ ...approval, detail: "x".repeat(801) })).toBe(false);
    expect(
      supportedWatchApproval({
        ...approval,
        options: [
          { decision: "accept", label: "Accept", warning: "Sensitive request" },
          { decision: "decline", label: "Decline" },
        ],
      }),
    ).toBe(false);
    expect(
      supportedWatchApproval({
        ...approval,
        options: [{ decision: "acceptAlways", label: "Always" }],
      }),
    ).toBe(false);
  });
});
