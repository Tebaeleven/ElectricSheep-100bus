export type DeskPins = { pinned: string[]; hidden: string[] };

export type DeskApi = {
  isDesk: true;
  pin: (id: string) => Promise<string[] | DeskPins>;
  unpin: (id: string) => Promise<string[] | DeskPins>;
  pinAllTop: (
    ids?: string[],
    opts?: { confirm?: boolean }
  ) => Promise<string[] | DeskPins>;
  hideSticky: (id: string) => Promise<DeskPins>;
  leapPet: (id: string, motion: "in" | "out") => Promise<DeskPins>;
  showSticky: (id: string) => Promise<DeskPins>;
  resizeSticky: (
    id: string,
    mode: "compact" | "alert" | "choice" | "chat" | "menu" | "settings"
  ) => Promise<void>;
  pinned: () => Promise<string[] | DeskPins>;
  showDock: () => Promise<void>;
  dragBegin: () => void;
  dragMove: () => void;
  dragEnd: () => void;
  followCursor: (id: string) => void;
  openDirectory: () => Promise<string | null>;
  notify?: (opts: { title: string; body: string }) => Promise<boolean>;
  openPreview?: (opts: {
    id: string;
    kind: "image" | "sheet";
    petId?: string;
  }) => Promise<void>;
  openUrl?: (
    url: string
  ) => Promise<{ ok: boolean; url?: string; error?: string }>;
  screenshot?: () => Promise<{
    ok: boolean;
    mime?: string;
    base64?: string;
    error?: string;
  }>;
  micStatus?: () => Promise<{ ok: boolean; status: string }>;
  requestMic?: () => Promise<{
    ok: boolean;
    status: string;
    /** 実際に OS のダイアログを出せたか */
    prompted?: boolean;
    /** ダイアログが出せなかった場合の案内文 */
    hint?: string;
    error?: string;
  }>;
  openMicSettings?: () => Promise<boolean>;
  onPinned: (cb: (state: DeskPins) => void) => () => void;
};

declare global {
  interface Window {
    petassist?: DeskApi;
  }
}

export {};
