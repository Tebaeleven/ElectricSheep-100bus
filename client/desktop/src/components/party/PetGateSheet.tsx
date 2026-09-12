"use client";

import { useEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { GrantPicker } from "@/components/party/GrantPicker";
import { CapabilityList } from "@/components/party/CapabilityList";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/hooks/use-desk";
import { useFloatAnchor } from "@/lib/hooks/use-float-anchor";
import { useI18n } from "@/lib/i18n/locale";
import {
  APP_CATALOG,
  MODEL_CATALOG,
  parsePetConfig,
  toolsForPetCatalog,
  type GatePanel,
  type PetConfig,
  type PetImageModelId,
} from "@/lib/pet-config";
import { configFor, loadConfigs, saveConfigs } from "@/lib/pet-config-store";
import { grantsFor, loadGrants, saveGrants } from "@/lib/grants-store";
import { parseGrants, type PetGrants } from "@/lib/grants";
import { publishDeskConfig, publishDeskGrants } from "@/lib/desk-channel";
import { fetchHarnessStatus, resetAgentSessions } from "@/lib/agent/client";

type PetGateSheetProps = {
  petId: string;
  panel: GatePanel;
  sticky?: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

export function PetGateSheet({
  petId,
  panel,
  sticky,
  anchorRef,
  onClose,
}: PetGateSheetProps) {
  const { locale, t } = useI18n();
  const desk = useDesk();
  const [config, setConfig] = useState<PetConfig>(() =>
    configFor(loadConfigs(), petId)
  );
  const [grants, setGrants] = useState<PetGrants>(() =>
    grantsFor(loadGrants(), petId)
  );
  const [policyDraft, setPolicyDraft] = useState(config.policy);
  const [imageModels, setImageModels] = useState<
    Array<{ id: string; label: string }>
  >([{ id: "auto", label: "Auto" }]);

  useEffect(() => {
    const next = configFor(loadConfigs(), petId);
    setConfig(next);
    setPolicyDraft(next.policy);
    setGrants(grantsFor(loadGrants(), petId));
  }, [petId, panel]);

  useEffect(() => {
    if (panel !== "model") return;
    void fetchHarnessStatus().then((status) => {
      if (status.imageModels?.length) setImageModels(status.imageModels);
    });
  }, [panel]);

  const persistConfig = (next: PetConfig) => {
    const parsed = parsePetConfig(next);
    setConfig(parsed);
    const map = { ...loadConfigs(), [petId]: parsed };
    saveConfigs(map);
    publishDeskConfig(petId, parsed);
    void resetAgentSessions(petId);
  };

  const persistGrants = (next: PetGrants) => {
    const parsed = parseGrants(next);
    setGrants(parsed);
    const map = { ...loadGrants(), [petId]: parsed };
    saveGrants(map);
    publishDeskGrants(petId, parsed);
    void resetAgentSessions(petId);
  };

  const ja = locale === "ja";
  const catalog = toolsForPetCatalog(petId);
  const { boxRef, style } = useFloatAnchor(anchorRef, Boolean(sticky));

  const node = (
    <div
      ref={boxRef}
      data-pet-float
      style={style}
      className="pet-no-drag z-[80] w-[248px] rounded-2xl bg-white p-2.5 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold tracking-wide text-[hsl(var(--primary))]">
          {panel === "policy"
            ? t.gate.ai
            : panel === "model"
              ? t.gate.llm
              : panel === "tools"
                ? t.gate.mcp
                : panel === "apps"
                  ? t.menu.apps
                  : t.menu.grants}
        </p>
        <button
          type="button"
          className="text-[10px] text-slate-400 hover:text-slate-700"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      {panel === "policy" ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-[#302c55]">
            {t.gate.policyHeading}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            {t.gate.policyHint}
          </p>
          <textarea
            value={policyDraft}
            onChange={(e) => setPolicyDraft(e.target.value)}
            placeholder={t.gate.policyPlaceholder}
            rows={5}
            className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-[#302c55] outline-none"
          />
          <Button
            size="sm"
            className="mt-2 h-8 w-full text-xs"
            onClick={() => persistConfig({ ...config, policy: policyDraft })}
          >
            {t.gate.save}
          </Button>
        </>
      ) : null}

      {panel === "model" ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-[#302c55]">
            {t.gate.modelHeading}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            {t.gate.modelHint}
          </p>
          <select
            value={config.model}
            onChange={(e) =>
              persistConfig({
                ...config,
                model: e.target.value as PetConfig["model"],
              })
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-[#302c55] outline-none"
          >
            {MODEL_CATALOG.map((row) => (
              <option key={row.id} value={row.id}>
                {row.id === "auto" ? (ja ? "自動（ハーネス）" : "Auto (harness)") : row.label}
              </option>
            ))}
          </select>
          <p className="mb-1 mt-3 text-[11px] font-medium text-[#302c55]">
            {t.gate.imageHeading}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            {imageModels.length > 1 ? t.gate.imageHint : t.gate.imageNone}
          </p>
          <select
            value={config.imageModel}
            disabled={imageModels.length <= 1}
            onChange={(e) =>
              persistConfig({
                ...config,
                imageModel: e.target.value as PetImageModelId,
              })
            }
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-[#302c55] outline-none disabled:opacity-50"
          >
            {imageModels.map((row) => (
              <option key={row.id} value={row.id}>
                {row.id === "auto" ? (ja ? "自動" : "Auto") : row.label}
              </option>
            ))}
          </select>
        </>
      ) : null}

      {panel === "tools" ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-[#302c55]">
            {t.gate.toolsHeading}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            {t.gate.toolsHint}
          </p>
          <div className="max-h-44 space-y-1 overflow-auto">
            {catalog.map((row) => {
              const on = !config.disabledTools.includes(row.name);
              return (
                <label
                  key={row.name}
                  className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-[11px] text-[#302c55]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? [...config.disabledTools, row.name]
                        : config.disabledTools.filter((n) => n !== row.name);
                      persistConfig({ ...config, disabledTools: next });
                    }}
                  />
                  {ja ? row.ja : row.en}
                </label>
              );
            })}
          </div>
        </>
      ) : null}

      {panel === "apps" ? (
        <>
          <p className="mb-1 text-[11px] font-medium text-[#302c55]">
            {t.gate.appsHeading}
          </p>
          <p className="mb-2 text-[10px] leading-snug text-slate-500">
            {t.gate.appsHint}
          </p>
          <div className="max-h-44 space-y-1 overflow-auto">
            {APP_CATALOG.map((row) => {
              const on = config.apps.includes(row.id);
              return (
                <label
                  key={row.id}
                  className="flex items-center gap-2 rounded-lg px-1 py-0.5 text-[11px] text-[#302c55]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? config.apps.filter((id) => id !== row.id)
                        : [...config.apps, row.id];
                      persistConfig({ ...config, apps: next });
                    }}
                  />
                  {ja ? row.ja : row.en}
                </label>
              );
            })}
          </div>
        </>
      ) : null}

      {panel === "grants" ? (
        <>
          <GrantPicker
            grants={grants}
            deskAvailable={desk.available}
            onChange={persistGrants}
          />
          <CapabilityList
            className="mt-2"
            compact
            petId={petId}
            grants={grants}
            config={config}
          />
        </>
      ) : null}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
