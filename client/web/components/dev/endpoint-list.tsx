"use client"

import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

import {
  DEV_ENDPOINTS,
  GROUP_LABELS,
  GROUP_ORDER,
  type DevEndpoint,
  type DevEndpointGroup,
} from "@/lib/dev/endpoints"
import { MethodBadge } from "./method-badge"

export function EndpointList({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (endpoint: DevEndpoint) => void
}) {
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    endpoints: DEV_ENDPOINTS.filter((endpoint) => endpoint.group === group),
  })).filter((entry) => entry.endpoints.length > 0)

  return (
    <ScrollArea className="h-full">
      <nav className="flex flex-col gap-4 p-3">
        {grouped.map(({ group, endpoints }) => (
          <div key={group} className="flex flex-col gap-1">
            <h2 className="text-muted-foreground px-1 text-xs font-medium">
              {GROUP_LABELS[group as DevEndpointGroup]}
            </h2>
            {endpoints.map((endpoint) => (
              <button
                key={endpoint.id}
                type="button"
                onClick={() => onSelect(endpoint)}
                className={cn(
                  "hover:bg-muted flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors",
                  selectedId === endpoint.id && "bg-muted"
                )}
              >
                <MethodBadge method={endpoint.method} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">
                  {endpoint.path}
                </span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </ScrollArea>
  )
}
