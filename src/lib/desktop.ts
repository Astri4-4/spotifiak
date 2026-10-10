// Bridge to the Electron shell (electron/preload.cjs). Undefined when the app
// runs in a browser, where nginx/Vite decide which servers /rest and /jam-api
// reach instead.

export interface DesktopConfig {
  navidromeUrl: string;
  /** Base URL of a web deployment whose Jam server the app uses; "" disables Jam. */
  jamUrl: string;
}

interface DesktopBridge {
  getConfig(): Promise<DesktopConfig>;
  /** Rejects with a readable message if a URL is invalid. */
  setConfig(config: DesktopConfig): Promise<DesktopConfig>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = window.desktop;

/** Electron prefixes errors thrown in IPC handlers; keep only the message. */
export function desktopErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}
