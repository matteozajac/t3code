import { NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type WatchCommandEvent = { id: string; commandJSON: string; expiresAt: number };

type WatchBridgeEvents = {
  onWatchCommand: (event: WatchCommandEvent) => void;
};

declare class WatchBridgeModule extends NativeModule<WatchBridgeEvents> {
  publishSnapshot(json: string): Promise<void>;
  completeCommand(id: string, replyJSON: string): Promise<void>;
  setListenerReady(ready: boolean): Promise<void>;
}

const T3WatchBridge =
  Platform.OS === "ios" ? requireOptionalNativeModule<WatchBridgeModule>("T3WatchBridge") : null;

export default T3WatchBridge;
