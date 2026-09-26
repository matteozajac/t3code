import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { managedRelaySessionAtom } from "@t3tools/client-runtime/relay";
import { respondToThreadApproval, startThreadTurn } from "@t3tools/client-runtime/operations";
import { createEnvironmentCommand, runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@t3tools/contracts";
import T3WatchBridge from "@t3tools/mobile-watch-native";
import * as Option from "effect/Option";
import * as Effect from "effect/Effect";
import { Atom } from "effect/unstable/reactivity";
import Constants from "expo-constants";
import { useEffect } from "react";

import { environmentCatalog } from "../../connection/catalog";
import { connectionAtomRuntime } from "../../connection/runtime";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentPresentations } from "../../state/presentation";
import { environmentShell, environmentSnapshotAtom } from "../../state/shell";
import { environmentThreadDetails, environmentThreadShells } from "../../state/threads";
import { prepareWatchMutation, watchRequestMayDispatch } from "./watch-commands";
import {
  boundWatchSnapshot,
  mapWatchThread,
  parseWatchCommand,
  parseWatchThreadID,
  visibleWatchEnvironments,
  watchProjectLabel,
  watchReplyForDelivery,
  watchThreadID,
  type WatchCommand,
  type WatchCommandResult,
  type WatchSnapshot,
} from "./watch-model";

const selectedWatchThreadAtom = Atom.make<ScopedThreadRef | null>(null);

// Subscribes to the same projections as the phone. No tokens, host URLs, or
// transport objects cross this boundary, including while the account changes.
const watchStateAtom = Atom.make((get) => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  const relaySession = get(managedRelaySessionAtom);
  const presentations = get(environmentPresentations.presentationsAtom);
  const permitted = visibleWatchEnvironments(presentations, relaySession !== null);
  const environmentIds = new Set(permitted.map(([id]) => id));
  const selected = get(selectedWatchThreadAtom);
  const selectedRef = selected && environmentIds.has(selected.environmentId) ? selected : null;
  const detailState = selectedRef ? get(environmentThreadDetails.stateAtom(selectedRef)) : null;
  const detail = detailState ? Option.getOrNull(detailState.data) : null;
  const shells = get(environmentThreadShells.threadShellsAtom)
    .filter((thread) => environmentIds.has(thread.environmentId) && thread.archivedAt === null)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const selectedShell = selectedRef
    ? shells.find(
        (thread) =>
          thread.environmentId === selectedRef.environmentId && thread.id === selectedRef.threadId,
      )
    : undefined;
  const visible = shells.slice(0, 30);
  if (selectedShell && !visible.includes(selectedShell)) visible.splice(29, 1, selectedShell);
  const threads = visible.map((shell) => {
    const snapshot = get(environmentSnapshotAtom(shell.environmentId));
    const project =
      snapshot?.projects.find((candidate) => candidate.id === shell.projectId)?.title ?? "Project";
    const isSelected = shell === selectedShell;
    return mapWatchThread(
      shell,
      watchProjectLabel(
        project,
        permitted.length > 1
          ? (presentations.get(shell.environmentId)?.entry.target.label ?? "Environment")
          : null,
      ),
      isSelected ? detail : null,
      isSelected && detailState?.status === "live",
    );
  });
  const connection: WatchSnapshot["connection"] = !catalog.isReady
    ? "connecting"
    : permitted.length === 0
      ? "unpaired"
      : permitted.some(([, value]) => value.connection.phase === "connected")
        ? "connected"
        : permitted.some(
              ([, value]) =>
                value.connection.phase === "connecting" ||
                value.connection.phase === "reconnecting",
            )
          ? "connecting"
          : "offline";
  return {
    environment:
      permitted.length === 1
        ? permitted[0]![1].entry.target.label.slice(0, 100)
        : "T3 Code on iPhone",
    connection,
    threads,
    selectedThreadID: selectedRef
      ? watchThreadID(selectedRef.environmentId, selectedRef.threadId)
      : undefined,
    // Excluded from native output; changing account forces an immediate cache replacement.
    accountId: relaySession?.accountId ?? null,
    environmentKey: [...environmentIds].sort().join("\n"),
  };
});

function resolveConnectedThread(command: WatchCommand): EnvironmentThreadShell | null {
  const ref = command.threadID ? parseWatchThreadID(command.threadID) : null;
  if (!ref) return null;
  const environmentId = EnvironmentId.make(ref.environmentId);
  const presentation = appAtomRegistry.get(
    environmentPresentations.presentationAtom(environmentId),
  );
  if (!presentation?.entry.enabled || presentation.connection.phase !== "connected") return null;
  if (appAtomRegistry.get(environmentShell.stateValueAtom(environmentId)).status !== "live")
    return null;
  if (
    presentation.entry.target._tag === "RelayConnectionTarget" &&
    !appAtomRegistry.get(managedRelaySessionAtom)
  )
    return null;
  return appAtomRegistry.get(
    environmentThreadShells.threadShellAtom({
      environmentId,
      threadId: ThreadId.make(ref.threadId),
    }),
  );
}

// Use the official command operations in the existing authenticated runtime, but
// never join the phone composer's serial queue: a watch action must not be sent
// later after its native request has expired. The effect checks again at dispatch.
const watchMutationCommand = createEnvironmentCommand(connectionAtomRuntime, {
  label: "watch:mutation",
  concurrency: { mode: "parallel" },
  execute: (input: {
    command: WatchCommand;
    expiresAt: number;
    accountId: string | null;
    isActive: () => boolean;
  }) =>
    Effect.gen(function* () {
      if (
        !watchRequestMayDispatch({
          active: input.isActive(),
          expiresAt: input.expiresAt,
          now: Date.now(),
          expectedAccountId: input.accountId,
          currentAccountId: appAtomRegistry.get(managedRelaySessionAtom)?.accountId ?? null,
        })
      ) {
        return yield* Effect.fail(new Error("Watch request expired or the phone account changed."));
      }
      const shell = resolveConnectedThread(input.command);
      if (!shell) return yield* Effect.fail(new Error("The task is no longer connected."));
      const state = appAtomRegistry.get(
        environmentThreadDetails.stateAtom({
          environmentId: shell.environmentId,
          threadId: shell.id,
        }),
      );
      const mutation = prepareWatchMutation(
        input.command,
        shell,
        Option.getOrNull(state.data),
        state.status === "live",
      );
      if (mutation.kind === "rejected") return yield* Effect.fail(new Error(mutation.message));
      return yield* mutation.kind === "prompt"
        ? startThreadTurn(mutation.input)
        : respondToThreadApproval(mutation.input);
    }),
});

function waitForLiveDetail(ref: ScopedThreadRef): Promise<boolean> {
  const atom = environmentThreadDetails.stateAtom(ref);
  return new Promise((resolve) => {
    let unsubscribe: (() => void) | undefined;
    const finish = (ready: boolean) => {
      clearTimeout(timeout);
      unsubscribe?.();
      resolve(ready);
    };
    const timeout = setTimeout(() => finish(false), 8_000);
    const inspect = () => {
      const value = appAtomRegistry.get(atom);
      if (value.status === "live") finish(true);
      else if (value.status === "deleted" || Option.isSome(value.error)) finish(false);
    };
    unsubscribe = appAtomRegistry.subscribe(atom, inspect);
    inspect();
  });
}

export function WatchBridgeCoordinator() {
  useEffect(() => {
    const native = T3WatchBridge;
    if (!native || Constants.expoConfig?.extra?.watchCompanionBuild !== true) return;
    let active = true;
    let revision = Date.now() * 1_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastIdentity = "";
    let lastAccountId: string | null | undefined;
    const handled = new Map<string, Promise<WatchCommandResult>>();
    const inFlightThreads = new Set<string>();
    const snapshot = (): WatchSnapshot => {
      const state = appAtomRegistry.get(watchStateAtom);
      return boundWatchSnapshot(
        {
          environment: state.environment,
          connection: state.connection,
          threads: state.threads,
          updatedAt: new Date().toISOString(),
          revision: ++revision,
          isDemo: false,
        },
        state.selectedThreadID,
      );
    };
    const publish = () => {
      timer = undefined;
      if (active) void native.publishSnapshot(JSON.stringify(snapshot())).catch(() => {});
    };
    const changed = () => {
      const state = appAtomRegistry.get(watchStateAtom);
      const identity = JSON.stringify([state.accountId, state.environmentKey]);
      if (identity !== lastIdentity) {
        lastIdentity = identity;
        const accountChanged = lastAccountId !== undefined && state.accountId !== lastAccountId;
        lastAccountId = state.accountId;
        const selected = appAtomRegistry.get(selectedWatchThreadAtom);
        if (
          selected &&
          (accountChanged ||
            !state.threads.some(
              (thread) => thread.id === watchThreadID(selected.environmentId, selected.threadId),
            ))
        ) {
          appAtomRegistry.set(selectedWatchThreadAtom, null);
        }
        if (timer) clearTimeout(timer);
        publish();
      } else if (!timer) timer = setTimeout(publish, 400);
    };
    const handle = async (
      command: WatchCommand,
      expiresAt: number,
    ): Promise<WatchCommandResult> => {
      if (command.kind === "refresh") return { succeeded: true, message: "Updated from iPhone." };
      let shell = resolveConnectedThread(command);
      if (!shell || shell.archivedAt)
        return { succeeded: false, message: "Open T3 Code on iPhone and reconnect this task." };
      const accountId = appAtomRegistry.get(managedRelaySessionAtom)?.accountId ?? null;
      const ref = { environmentId: shell.environmentId, threadId: shell.id };
      appAtomRegistry.set(selectedWatchThreadAtom, ref);
      if (command.kind === "openThread" || command.kind === "approve" || command.kind === "deny") {
        const live = await waitForLiveDetail(ref);
        if (!active) return { succeeded: false, message: "Reopen T3 Code on iPhone." };
        shell = resolveConnectedThread(command);
        if (!shell)
          return { succeeded: false, message: "The connection changed. Refresh on iPhone." };
        if (command.kind === "openThread")
          return {
            succeeded: live,
            message: live ? "Conversation updated." : "Open iPhone to refresh this conversation.",
          };
      }
      const state = appAtomRegistry.get(environmentThreadDetails.stateAtom(ref));
      const mutation = prepareWatchMutation(
        command,
        shell,
        Option.getOrNull(state.data),
        state.status === "live",
      );
      if (mutation.kind === "rejected") return { succeeded: false, message: mutation.message };
      if (inFlightThreads.has(command.threadID!))
        return { succeeded: false, message: "A watch request is already being sent to this task." };
      inFlightThreads.add(command.threadID!);
      const result = await runAtomCommand(
        appAtomRegistry,
        watchMutationCommand,
        {
          environmentId: ref.environmentId,
          input: { command, expiresAt, accountId, isActive: () => active },
        },
        { reportFailure: false, reportDefect: false },
      ).finally(() => inFlightThreads.delete(command.threadID!));
      return {
        succeeded: result._tag === "Success",
        message:
          result._tag === "Success"
            ? mutation.kind === "prompt"
              ? "Sent to T3 Code."
              : "Response sent to T3 Code."
            : "Delivery could not be confirmed. Check the conversation on iPhone before sending again.",
      };
    };
    const listener = native.addListener("onWatchCommand", (event) => {
      const command = parseWatchCommand(event.commandJSON);
      if (!command || command.id !== event.id) {
        void native
          .completeCommand(
            event.id,
            JSON.stringify({
              succeeded: false,
              message: "This watch request is invalid. Update both apps.",
            }),
          )
          .catch(() => {});
        return;
      }
      let pending = handled.get(command.id);
      if (!pending) {
        pending = handle(command, event.expiresAt).catch((): WatchCommandResult => ({
          succeeded: false,
          message: "Check T3 Code on iPhone before trying again.",
        }));
        handled.set(command.id, pending);
        // Never retry a mutation when native delivery is repeated in this session.
        if (handled.size > 128) handled.delete(handled.keys().next().value!);
      }
      void pending
        .then((reply) =>
          active
            ? native.completeCommand(
                event.id,
                JSON.stringify(watchReplyForDelivery(reply, snapshot())),
              )
            : undefined,
        )
        .catch(() => {});
    });
    const unsubscribe = appAtomRegistry.subscribe(watchStateAtom, changed);
    changed();
    void native.setListenerReady(true).catch(() => {});
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      unsubscribe();
      listener.remove();
      appAtomRegistry.set(selectedWatchThreadAtom, null);
      void native.setListenerReady(false).catch(() => {});
    };
  }, []);
  return null;
}
