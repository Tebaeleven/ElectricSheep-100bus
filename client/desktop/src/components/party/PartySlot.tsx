"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent,
} from "react";
import {
  STATUS_DOT,
  pickBubble,
  type PartyMember,
} from "@/data/party";
import { FACE_FILES, spriteFor } from "@/data/looks";
import { SpeechBubble, HoverDots } from "@/components/party/SpeechBubble";
import { PetMenu } from "@/components/party/PetMenu";
import { PetGateSheet } from "@/components/party/PetGateSheet";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import type { GatePanel } from "@/lib/pet-config";

const CLICK_WAIT_MS = 280;
const HOP_PAD = 18;

let pauseBound = false;
function bindPetPause() {
  if (pauseBound || typeof document === "undefined") return;
  pauseBound = true;
  const sync = () =>
    document.documentElement.classList.toggle("pet-paused", document.hidden);
  document.addEventListener("visibilitychange", sync);
  sync();
}

type PartySlotProps = {
  member: PartyMember;
  selected?: boolean;
  compact?: boolean;
  pinned?: boolean;
  tearOff?: boolean;
  sticky?: boolean;
  hidden?: boolean;
  away?: boolean;
  suppressBubble?: boolean;
  hideLabel?: boolean;
  onSelect?: (id: string) => void;
  onChat?: (id: string) => void;
  onMenuOpen?: (id: string) => boolean | void;
};

type SlotCallbacks = {
  onSelect?: (id: string) => void;
  onChat?: (id: string) => void;
  onMenuOpen?: (id: string) => boolean | void;
};

type PartySlotViewProps = Omit<PartySlotProps, keyof SlotCallbacks> & {
  callbacks: MutableRefObject<SlotCallbacks>;
};

function PartySlotInner({
  member,
  selected,
  compact,
  pinned,
  tearOff,
  sticky,
  hidden,
  away,
  suppressBubble,
  hideLabel,
  callbacks,
}: PartySlotViewProps) {
  const { locale, t } = useI18n();
  const pet = t.pets[member.id];
  const statusLabel = t.status[member.status];
  const hopRef = useRef<HTMLDivElement>(null);
  const [statusBubble, setStatusBubble] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<GatePanel | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ x: 0, y: 0, active: false, moved: false, done: false });
  const skipClickUntil = useRef(0);
  const clickTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const grown = useRef(false);
  const floatDelay = (member.id.charCodeAt(0) % 5) * 0.35;
  const status = member.status;
  const isBusy = status === "working";
  const needsYou = status === "need_approval";
  const stopped = status === "stopped";
  const failed = status === "failed";
  const done = status === "done";
  const showStatusPill = status !== "idle" && status !== "empty";
  const spriteSize = sticky ? 168 : compact ? 96 : 112;
  const spriteBoxW = spriteSize + 16;
  const spriteBoxH = spriteSize + HOP_PAD + 8;
  const hasFailedArt = Boolean(FACE_FILES[member.id]?.failed);
  const hasStoppedArt = Boolean(FACE_FILES[member.id]?.stopped);

  const clearClickTimer = () => {
    if (clickTimer.current != null) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };

  useEffect(() => {
    bindPetPause();
    return () => clearClickTimer();
  }, []);

  useEffect(() => {
    const clearHover = () => setHovered(false);
    window.addEventListener("blur", clearHover);
    document.addEventListener("mouseleave", clearHover);
    return () => {
      window.removeEventListener("blur", clearHover);
      document.removeEventListener("mouseleave", clearHover);
    };
  }, []);

  useEffect(() => {
    if (!statusBubble) return;
    if (failed || needsYou) return;
    const typing = Array.from(statusBubble).length * 28;
    const hide = setTimeout(() => setStatusBubble(null), 1800 + typing);
    return () => clearTimeout(hide);
  }, [statusBubble, failed, needsYou]);

  useEffect(() => {
    if (suppressBubble) {
      setStatusBubble(null);
      setMenuOpen(false);
      setPanel(null);
      return;
    }
    if (status === "idle" || status === "empty" || status === "stopped" || status === "done") return;
    setStatusBubble(pickBubble(member, pet?.bubbles[member.status]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- party object identity changes every tick
  }, [status, member.id, suppressBubble, locale]);

  useEffect(() => {
    if (!menuOpen && !panel) return;
    const onDoc = (e: Event) => {
      const node = e.target as Node | null;
      if (rootRef.current?.contains(node)) return;
      const el = node instanceof Element ? node : node?.parentElement;
      if (el?.closest("[data-pet-float]")) return;
      setMenuOpen(false);
      setPanel(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setPanel(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("contextmenu", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("contextmenu", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, panel]);

  useEffect(() => {
    if (!sticky) return;
    if (panel) {
      grown.current = true;
      void window.petassist?.resizeSticky(member.id, "settings");
      return;
    }
    if (menuOpen) {
      grown.current = true;
      void window.petassist?.resizeSticky(member.id, "menu");
      return;
    }
    if (suppressBubble) {
      grown.current = true;
      return;
    }
    if (!grown.current) return;
    grown.current = false;
    const wait = window.setTimeout(() => {
      void window.petassist?.resizeSticky(member.id, "compact");
    }, 400);
    return () => window.clearTimeout(wait);
  }, [menuOpen, panel, sticky, suppressBubble, member.id]);

  const hop = () => {
    const el = hopRef.current;
    if (!el) return;
    el.classList.remove("is-hopping");
    void el.offsetWidth;
    el.classList.add("is-hopping");
  };

  const chat = () => {
    setMenuOpen(false);
    setPanel(null);
    callbacks.current.onSelect?.(member.id);
    callbacks.current.onChat?.(member.id);
    if (!stopped) hop();
  };

  const desk = typeof window !== "undefined" ? window.petassist : undefined;
  const canMoveWindow = Boolean(sticky && desk);
  const canTearOff = Boolean(tearOff && desk);

  const openMenu = () => {
    if (callbacks.current.onMenuOpen?.(member.id) === false) return;
    callbacks.current.onSelect?.(member.id);
    setPanel(null);
    clearClickTimer();
    const show = () => {
      setMenuOpen(true);
      hop();
    };
    if (sticky && window.petassist?.resizeSticky) {
      void window.petassist.resizeSticky(member.id, "menu").then(show, show);
      return;
    }
    show();
  };

  const onPetClick = (e: ReactMouseEvent) => {
    if (Date.now() < skipClickUntil.current) return;
    if (drag.current.moved) return;
    if (e.detail >= 2) {
      clearClickTimer();
      openMenu();
      return;
    }
    clearClickTimer();
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      if (!sticky && canTearOff && desk) {
        callbacks.current.onSelect?.(member.id);
        void desk.pin(member.id);
        if (!stopped) hop();
        return;
      }
      chat();
    }, CLICK_WAIT_MS);
  };

  const onPetDoubleClick = (e: ReactMouseEvent) => {
    e.preventDefault();
    clearClickTimer();
    openMenu();
  };

  const onPetContextMenu = (e: ReactMouseEvent) => {
    e.preventDefault();
    if (Date.now() < skipClickUntil.current || drag.current.moved) return;
    openMenu();
  };

  const finishDrag = (shouldPin: boolean) => {
    if (drag.current.done) return;
    if (!drag.current.moved) {
      drag.current.active = false;
      return;
    }
    drag.current.done = true;
    drag.current.active = false;
    drag.current.moved = false;
    skipClickUntil.current = Date.now() + 400;
    setDragging(false);
    if (canMoveWindow) desk?.dragEnd();
    if (shouldPin) void desk?.pin(member.id);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (!canMoveWindow && !canTearOff) return;
    drag.current = { x: e.clientX, y: e.clientY, active: true, moved: false, done: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    const pin = canTearOff && !canMoveWindow;
    const onUp = () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("mouseup", onUp, true);
      finishDrag(pin);
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("mouseup", onUp, true);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active || drag.current.done) return;
    const dist = Math.hypot(e.clientX - drag.current.x, e.clientY - drag.current.y);
    if (dist > 4 && !drag.current.moved) {
      drag.current.moved = true;
      setDragging(true);
      setMenuOpen(false);
      setPanel(null);
      clearClickTimer();
      if (canMoveWindow) desk?.dragBegin();
      else if (canTearOff) desk?.followCursor(member.id);
    }
    if (drag.current.moved && canMoveWindow) desk?.dragMove();
  };

  const onPointerUp = () => {
    finishDrag(canTearOff && !canMoveWindow);
  };

  const hoverEllipsis =
    hovered &&
    !menuOpen &&
    !panel &&
    !suppressBubble &&
    !statusBubble &&
    !stopped &&
    !needsYou &&
    !isBusy &&
    !failed &&
    !done;

  const bubbleText =
    suppressBubble || menuOpen || panel || hoverEllipsis
      ? null
      : statusBubble;

  return (
    <div
      ref={rootRef}
      data-pet-id={member.id}
      className={cn(
        "group relative flex flex-col items-center overflow-visible pet-no-drag",
        pinned && "opacity-40",
      )}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={onPetContextMenu}
    >
      {menuOpen ? (
        <PetMenu
          petId={member.id}
          sticky={sticky}
          stopped={stopped}
          hidden={hidden}
          pinned={pinned}
          anchorRef={rootRef}
          onTalk={chat}
          onPanel={(next) => {
            setMenuOpen(false);
            setPanel(next);
          }}
          onClose={() => setMenuOpen(false)}
        />
      ) : null}
      {panel ? (
        <PetGateSheet
          petId={member.id}
          panel={panel}
          sticky={sticky}
          anchorRef={rootRef}
          onClose={() => setPanel(null)}
        />
      ) : null}
      <div className="relative flex flex-col items-center">
        <SpeechBubble
          text={bubbleText}
          placement="above"
          instant={false}
          onTalk={stopped ? undefined : chat}
        />
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            /* Electron moves the window and cancels the pointer; keep dragging. */
          }}
          onClick={onPetClick}
          onDoubleClick={onPetDoubleClick}
          className={cn(
            "relative flex flex-col items-center px-1.5 pb-1.5 pt-1 outline-none transition",
            sticky ? "rounded-none bg-transparent" : "rounded-2xl",
            dragging ? "cursor-grabbing" : "cursor-pointer",
            hovered && !menuOpen && "brightness-[1.03]",
            selected && !sticky && "ring-2 ring-pink-200",
            away && "opacity-40",
            !sticky && "min-w-[72px]"
          )}
          aria-label={`${pet?.name ?? member.nameJa} ${statusLabel}`}
        >
          <div
            data-pet-sprite
            className="relative overflow-visible"
            style={{ width: spriteBoxW, height: spriteBoxH }}
          >
            <div
              ref={hopRef}
              className="pet-hop-layer absolute bottom-0 left-1/2"
              style={{ width: spriteSize, height: spriteSize }}
              onAnimationEnd={(e) => {
                if (e.target === hopRef.current) {
                  hopRef.current?.classList.remove("is-hopping");
                }
              }}
            >
              <HoverDots show={hoverEllipsis} />
              {isBusy ? (
                <span className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/40 animate-ping" />
              ) : null}
              <img
                src={spriteFor(member)}
                alt=""
                width={spriteSize}
                height={spriteSize}
                className={cn(
                  "pet-bob relative z-[1] h-full w-full select-none object-contain object-center p-0",
                  sticky ? "drop-shadow-[0_1px_2px_rgba(0,0,0,0.18)]" : "drop-shadow-md",
                  stopped && !hasStoppedArt && "grayscale brightness-90 opacity-70",
                  failed && !hasFailedArt && "contrast-125",
                  needsYou && "drop-shadow-[0_0_8px_rgba(232,93,76,0.7)]",
                  isBusy && "is-busy",
                  needsYou && "is-need",
                  failed && "is-failed",
                  stopped && "is-stopped",
                  dragging && "is-dragging"
                )}
                style={{ "--pet-delay": `${floatDelay}s` } as CSSProperties}
                draggable={false}
              />
              <span
                className={cn(
                  "absolute right-1 bottom-1 z-[2] h-3 w-3 rounded-full ring-2 ring-white",
                  STATUS_DOT[status],
                  (isBusy || needsYou || failed) && "animate-pulse",
                  !showStatusPill && "hidden group-hover:block"
                )}
                title={statusLabel}
              />
            </div>
          </div>
          {showStatusPill ? (
            <span
              className={cn(
                "mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white",
                STATUS_DOT[status],
                (needsYou || failed || done) && "animate-pulse"
              )}
            >
              {statusLabel}
            </span>
          ) : null}
          {!hideLabel && !sticky && !compact ? (
            <span
              className={cn(
                "text-[11px] font-medium",
                showStatusPill ? "mt-0.5" : "mt-1",
                failed ? "text-red-600" : stopped ? "text-slate-400" : "text-slate-700"
              )}
            >
              {pet?.name ?? member.nameJa}
            </span>
          ) : null}
        </button>
      </div>
    </div>
  );
}

function sameSlot(prev: PartySlotViewProps, next: PartySlotViewProps) {
  return (
    prev.member.id === next.member.id &&
    prev.member.status === next.member.status &&
    prev.member.icon === next.member.icon &&
    prev.member.accent === next.member.accent &&
    prev.member.nameJa === next.member.nameJa &&
    prev.selected === next.selected &&
    prev.compact === next.compact &&
    prev.pinned === next.pinned &&
    prev.tearOff === next.tearOff &&
    prev.sticky === next.sticky &&
    prev.hidden === next.hidden &&
    prev.away === next.away &&
    prev.suppressBubble === next.suppressBubble &&
    prev.hideLabel === next.hideLabel
  );
}

const PartySlotView = memo(PartySlotInner, sameSlot);

export function PartySlot(props: PartySlotProps) {
  const callbacks = useRef<SlotCallbacks>({
    onSelect: props.onSelect,
    onChat: props.onChat,
    onMenuOpen: props.onMenuOpen,
  });
  callbacks.current.onSelect = props.onSelect;
  callbacks.current.onChat = props.onChat;
  callbacks.current.onMenuOpen = props.onMenuOpen;
  return (
    <PartySlotView
      member={props.member}
      selected={props.selected}
      compact={props.compact}
      pinned={props.pinned}
      tearOff={props.tearOff}
      sticky={props.sticky}
      hidden={props.hidden}
      away={props.away}
      suppressBubble={props.suppressBubble}
      hideLabel={props.hideLabel}
      callbacks={callbacks}
    />
  );
}
