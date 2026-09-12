export type GhostDeskMode = "compact" | "talk" | "menu";

export type GhostDesktopApi = {
  isDesk: true;
  resize: (mode: GhostDeskMode) => Promise<void> | void;
  show: () => Promise<void> | void;
  dragBegin: () => void;
  dragMove: () => void;
  dragEnd: () => void;
  onHotkey: (cb: () => void) => () => void;
};

declare global {
  interface Window {
    ghostDesktop?: GhostDesktopApi;
  }
}

export {};
