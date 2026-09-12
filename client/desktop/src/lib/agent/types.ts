export const SEND_TOOLS = ["slack_post", "x_post", "mail_send"] as const;

export function isSendTool(name: string) {
  return (SEND_TOOLS as readonly string[]).includes(name);
}

export type AgentRuntime = "trueforge" | "openai";

export type AgentProgressEvent = {
  type: "progress";
  progress: number;
};

export type AgentMetaEvent = {
  type: "meta";
  sessionId: string;
  runtime: AgentRuntime;
};

export type AgentTextEvent = {
  type: "text";
  text: string;
};

export type AgentApprovalEvent = {
  type: "approval";
  sessionId: string;
  toolName: string;
  detail: string;
  text: string;
  choices?: { id: string; label: string }[];
};

export type AgentDoneEvent = {
  type: "done";
  sessionId: string;
  text: string;
};

export type AgentErrorEvent = {
  type: "error";
  message: string;
};

export type AgentGrantEvent = {
  type: "grant";
  sessionId: string;
  reason: "folder";
};

export type HarnessKind = "sandbox" | "subagent" | "mcp" | "oauth";

export type AgentHarnessEvent = {
  type: "harness";
  kind: HarnessKind;
  detail?: string;
};

export type AgentHandoffEvent = {
  type: "handoff";
  from: string;
  to: string;
};

export type DeskArtifact =
  | {
      kind: "image";
      id: string;
      title?: string;
      url: string;
    }
  | {
      kind: "sheet";
      id: string;
      title?: string;
      headers: string[];
      rows: string[][];
    };

export type AgentArtifactEvent = {
  type: "artifact";
} & DeskArtifact;

export type AgentStreamEvent =
  | AgentMetaEvent
  | AgentProgressEvent
  | AgentTextEvent
  | AgentApprovalEvent
  | AgentDoneEvent
  | AgentErrorEvent
  | AgentGrantEvent
  | AgentHarnessEvent
  | AgentHandoffEvent
  | AgentArtifactEvent;

export type PendingKind = "tool_approval" | "ask_user";

export type PendingAction = {
  kind: PendingKind;
  threadId: string;
  toolCallId: string;
  toolName: string;
  argsText: string;
  openaiToolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
};

export type AgentSession = {
  id: string;
  petId: string;
  locale: "ja" | "en";
  runtime: AgentRuntime;
  trueforgeSessionId?: string;
  openaiMessages?: OpenAiMessage[];
  pending?: PendingAction;
  grants?: import("@/lib/grants").PetGrants;
  config?: import("@/lib/pet-config").PetConfig;
  pendingNames?: string[];
  deskIntent?: "zip" | "folder";
  deskPending?: {
    names: string[];
    extraPaths: string[];
    found: string[];
    intent: "zip" | "folder";
  };
};

export type OpenAiMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

export type OpenAiToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};
