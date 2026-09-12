"use client";

import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n/locale";
import { useFloatAnchor } from "@/lib/hooks/use-float-anchor";
import { useCompanion, usePhonePresence } from "@/lib/hooks/use-companion";
import { postCompanionParcel, postLeap } from "@/lib/companion/client";
import { fileToParcel } from "@/lib/companion/parcel";
import type { GatePanel } from "@/lib/pet-config";

type PetMenuProps = {
  petId: string;
  sticky?: boolean;
  stopped?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onTalk: () => void;
  onPanel: (panel: GatePanel) => void;
  onClose: () => void;
};

export function PetMenu({
  petId,
  sticky,
  stopped,
  hidden,
  pinned,
  anchorRef,
  onTalk,
  onPanel,
  onClose,
}: PetMenuProps) {
  const { t } = useI18n();
  const desk = typeof window !== "undefined" ? window.petassist : undefined;
  const companion = useCompanion();
  const presence = usePhonePresence();
  const { boxRef, style } = useFloatAnchor(anchorRef, Boolean(sticky));
  const paired = companion?.paired ?? presence.paired;
  const onPhone =
    (companion?.locations[petId] ?? presence.locations[petId]) === "phone" ||
    (companion?.locations[petId] ?? presence.locations[petId]) === "transit";

  const run = (fn: () => void | Promise<unknown>) => {
    void fn();
    onClose();
  };

  const node = (
    <div
      ref={boxRef}
      data-pet-float
      style={style}
      className="pet-no-drag z-[80] w-[176px] rounded-2xl bg-white p-1.5 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      <MenuItem onClick={() => run(onTalk)}>{t.menu.talk}</MenuItem>
      {paired ? (
        onPhone ? (
          <p className="px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
            {t.companion.onPhone}
          </p>
        ) : (
          <MenuItem
            onClick={() =>
              run(() => {
                if (companion) return companion.leapToPhone(petId);
                const t0 = Date.now();
                void desk?.leapPet?.(petId, "out");
                return postLeap({ id: petId, from: "pc", to: "phone", t0 });
              })
            }
          >
            {t.companion.jumpToPhone}
          </MenuItem>
        )
      ) : null}
      {paired && !onPhone ? (
        <label className="flex w-full cursor-pointer rounded-xl px-2.5 py-1.5 text-left text-[11px] font-medium text-[#302c55] hover:bg-slate-50">
          {companion?.parcels[petId]
            ? t.companion.replacePhoto
            : t.companion.carryPhoto}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              run(async () => {
                const parcel = await fileToParcel(file);
                if (!parcel) return;
                await postCompanionParcel({ id: petId, ...parcel });
              });
            }}
          />
        </label>
      ) : null}
      {desk ? (
        <MenuItem onClick={() => run(() => desk.showDock())}>
          {t.menu.openDock}
        </MenuItem>
      ) : null}
      <MenuItem onClick={() => run(() => onPanel("policy"))}>
        {t.menu.policy}
      </MenuItem>
      <MenuItem onClick={() => run(() => onPanel("grants"))}>
        {t.menu.grants}
      </MenuItem>
      <MenuItem onClick={() => run(() => onPanel("model"))}>
        {t.menu.model}
      </MenuItem>
      <MenuItem onClick={() => run(() => onPanel("tools"))}>
        {t.menu.tools}
      </MenuItem>
      <MenuItem onClick={() => run(() => onPanel("apps"))}>
        {t.menu.apps}
      </MenuItem>
      {desk && (sticky || pinned) ? (
        hidden ? (
          <MenuItem onClick={() => run(() => desk.showSticky(petId))}>
            {t.menu.showDesktop}
          </MenuItem>
        ) : (
          <MenuItem onClick={() => run(() => desk.hideSticky(petId))}>
            {t.menu.hide}
          </MenuItem>
        )
      ) : null}
      {sticky && desk ? (
        <MenuItem onClick={() => run(() => desk.unpin(petId))}>
          {t.menu.unpin}
        </MenuItem>
      ) : null}
      {!sticky && desk ? (
        <MenuItem onClick={() => run(() => desk.pin(petId))}>
          {t.menu.pin}
        </MenuItem>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

function MenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="flex w-full rounded-xl px-2.5 py-1.5 text-left text-[11px] font-medium text-[#302c55] hover:bg-slate-50"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
