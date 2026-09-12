"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchHarnessStatus,
  streamAgentTurn,
  type HarnessStatus,
  type TurnOutcome,
} from "@/lib/agent/client";
import type { AgentStreamEvent } from "@/lib/agent/types";
import { GrantPicker } from "@/components/party/GrantPicker";
import { Button } from "@/components/ui/button";
import {
  grantsFor,
  loadGrants,
  saveGrants,
  type GrantsMap,
} from "@/lib/grants-store";
import {
  configFor,
  loadConfigs,
  saveConfigs,
  type ConfigMap,
} from "@/lib/pet-config-store";
import { publishDeskGrants } from "@/lib/desk-channel";
import type { PetGrants } from "@/lib/grants";
import { useDesk } from "@/lib/hooks/use-desk";
import { useI18n } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

const PET_ID = "ghost";

export type GhostWorkMode = "care" | "agent";

export function useGhostHarness(lang: "ja" | "en") {
  const { t } = useI18n();
  const desk = useDesk();
  const [harness, setHarness] = useState<HarnessStatus | null>(null);
  const [grantsMap, setGrantsMap] = useState<GrantsMap>({});
  const [configMap, setConfigMap] = useState<ConfigMap>({});
  const [policyDraft, setPolicyDraft] = useState("");
  const sessionIdRef = useRef<string | undefined>(undefined);
  const [pendingApproval, setPendingApproval] = useState<{
    tool: string;
    detail?: string;
  } | null>(null);

  useEffect(() => {
    setGrantsMap(loadGrants());
    const configs = loadConfigs();
    setConfigMap(configs);
    setPolicyDraft(configFor(configs, PET_ID).policy);
    void fetchHarnessStatus().then(setHarness);
  }, []);

  const grants = grantsFor(grantsMap, PET_ID);
  const config = configFor(configMap, PET_ID);

  const setGrants = useCallback((next: PetGrants) => {
    setGrantsMap((prev) => {
      const map = { ...prev, [PET_ID]: next };
      saveGrants(map);
      return map;
    });
    publishDeskGrants(PET_ID, next);
  }, []);

  const savePolicy = useCallback(() => {
    setConfigMap((prev) => {
      const cur = configFor(prev, PET_ID);
      const map = {
        ...prev,
        [PET_ID]: { ...cur, policy: policyDraft },
      };
      saveConfigs(map);
      return map;
    });
  }, [policyDraft]);

  const harnessLabel =
    harness == null
      ? t.harness.checking
      : harness.runtime === "trueforge"
        ? t.harness.trueforge
        : harness.runtime === "openai"
          ? t.harness.openai
          : t.harness.offline;

  const runAgent = useCallback(
    async (input: {
      message?: string;
      approval?: "allow" | "deny";
      onDelta?: (text: string) => void;
    }): Promise<TurnOutcome> => {
      const out = await streamAgentTurn(
        {
          petId: PET_ID,
          locale: lang,
          sessionId: sessionIdRef.current,
          message: input.message,
          approval: input.approval,
          grants: grantsFor(loadGrants(), PET_ID),
          config: configFor(loadConfigs(), PET_ID),
        },
        (event: AgentStreamEvent, current) => {
          if (event.type === "text" || event.type === "done") {
            input.onDelta?.(current.text);
          }
        }
      );
      if (out.sessionId) sessionIdRef.current = out.sessionId;
      if (out.approval) {
        setPendingApproval({
          tool: out.approval.toolName,
          detail: out.approval.detail,
        });
      } else {
        setPendingApproval(null);
      }
      return out;
    },
    [lang]
  );

  const refreshHarness = useCallback(() => {
    void fetchHarnessStatus().then(setHarness);
  }, []);

  return {
    petId: PET_ID,
    harness,
    harnessLabel,
    grants,
    setGrants,
    config,
    policyDraft,
    setPolicyDraft,
    savePolicy,
    pendingApproval,
    setPendingApproval,
    runAgent,
    refreshHarness,
    deskAvailable: desk.available,
  };
}

type HarnessMenuProps = {
  harnessLabel: string;
  grants: PetGrants;
  setGrants: (next: PetGrants) => void;
  deskAvailable: boolean;
  policyDraft: string;
  setPolicyDraft: (v: string) => void;
  savePolicy: () => void;
  workMode: GhostWorkMode;
  setWorkMode: (m: GhostWorkMode) => void;
  onRefreshHarness: () => void;
};

export function GhostHarnessMenu({
  harnessLabel,
  grants,
  setGrants,
  deskAvailable,
  policyDraft,
  setPolicyDraft,
  savePolicy,
  workMode,
  setWorkMode,
  onRefreshHarness,
}: HarnessMenuProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">おはなし / おしごと</p>
        <div className="flex gap-2">
          <Button
            variant={workMode === "care" ? "care" : "careSoft"}
            size="lg"
            className="flex-1"
            onClick={() => setWorkMode("care")}
          >
            おはなし
          </Button>
          <Button
            variant={workMode === "agent" ? "care" : "careSoft"}
            size="lg"
            className="flex-1"
            onClick={() => setWorkMode("agent")}
          >
            おしごと
          </Button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[#302c55]/65">
          {workMode === "care"
            ? "話しかけ・調子の話。軽い返答。"
            : "TrueForge / エージェント。権限のある仕事を任せる。"}
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[#302c55]">ハーネス</p>
          <button
            type="button"
            className="text-xs text-[#e56b8c] underline-offset-2 hover:underline"
            onClick={onRefreshHarness}
          >
            再確認
          </button>
        </div>
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-sm font-semibold",
            harnessLabel.includes("TrueForge") || harnessLabel === "TrueForge"
              ? "bg-emerald-50 text-emerald-800"
              : "bg-[#f0f3f8] text-[#302c55]"
          )}
          data-testid="harness-badge"
        >
          {harnessLabel}
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-[#302c55]">回答方針</p>
        <textarea
          value={policyDraft}
          onChange={(e) => setPolicyDraft(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[#302c55]/20 bg-[#f7f8fb] px-3 py-2 text-sm text-[#302c55] outline-none focus:border-[#e56b8c]"
          placeholder="なるべく早めに終わらせる…"
        />
        <Button variant="careSoft" className="mt-2 w-full" onClick={savePolicy}>
          方針を保存
        </Button>
      </div>

      <GrantPicker
        grants={grants}
        deskAvailable={deskAvailable}
        onChange={setGrants}
      />
    </div>
  );
}
