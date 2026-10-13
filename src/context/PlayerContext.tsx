import type { ReactNode } from "react";
import { LocalPlayerProvider } from "./LocalPlayer";
import { ConnectProvider } from "./ConnectContext";

// The player: this device's audio engine (LocalPlayer) with Connect on top
// (ConnectContext), which lets the account's devices see and control each
// other's playback. usePlayer() is whichever one the UI should show.

export { usePlayer, useConnect } from "./ConnectContext";
export type { RepeatMode } from "./LocalPlayer";

export function PlayerProvider({ children }: { children: ReactNode }) {
  return (
    <LocalPlayerProvider>
      <ConnectProvider>{children}</ConnectProvider>
    </LocalPlayerProvider>
  );
}
