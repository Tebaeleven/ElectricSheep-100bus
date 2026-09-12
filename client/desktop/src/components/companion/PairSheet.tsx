"use client";

import { Button } from "@/components/ui/button";
import { useCompanion } from "@/lib/hooks/use-companion";
import { useI18n } from "@/lib/i18n/locale";

export function PairSheet() {
  const companion = useCompanion();
  const { t } = useI18n();
  if (!companion?.sheetOpen) return null;
  const { pairInfo, paired, setSheetOpen, disconnect, openPairSheet } = companion;
  const copy = t.companion;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={() => setSheetOpen(false)}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pair-sheet-title"
      >
        <p
          id="pair-sheet-title"
          className="text-base font-bold text-[#302c55]"
        >
          {copy.title}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          {copy.hint}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
          {copy.wifi}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          {copy.firewall}
        </p>

        {pairInfo?.qr ? (
          <img
            src={pairInfo.qr}
            alt=""
            width={200}
            height={200}
            className="mx-auto mt-4 rounded-2xl border border-slate-100"
          />
        ) : null}

        {pairInfo?.code ? (
          <p className="mt-3 text-center text-[11px] text-slate-400">
            {copy.codeLabel}{" "}
            <span className="font-mono text-lg font-semibold tracking-[0.3em] text-[#302c55]">
              {pairInfo.code}
            </span>
          </p>
        ) : null}

        {pairInfo?.url ? (
          <p className="mt-1 break-all text-center text-[10px] text-slate-400">
            {pairInfo.url}
          </p>
        ) : !pairInfo?.lanIp ? (
          <p className="mt-3 text-center text-[12px] text-orange-600">
            {copy.noLan}
          </p>
        ) : null}

        <p className="mt-3 text-center text-[12px] font-medium text-[#302c55]">
          {paired ? copy.connected : copy.waiting}
        </p>

        <div className="mt-4 flex gap-2">
          {paired ? (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => void disconnect()}
            >
              {copy.disconnect}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => void openPairSheet()}
            >
              {copy.connect}
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            onClick={() => setSheetOpen(false)}
          >
            {t.talk.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
