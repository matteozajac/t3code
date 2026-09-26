import Constants from "expo-constants";
import { Platform } from "react-native";
import { supportsAndroidAgentNotifications } from "./androidNotifications";

export function supportsAgentAwarenessPush() {
  // Independently signed forks cannot receive APNs from the hosted relay's team.
  if (Constants.expoConfig?.extra?.agentAwarenessPushEnabled === false) {
    return false;
  }
  return Platform.OS === "android"
    ? supportsAndroidAgentNotifications()
    : Platform.OS === "ios" && Constants.expoConfig?.extra?.iosPersonalTeamBuild !== true;
}
