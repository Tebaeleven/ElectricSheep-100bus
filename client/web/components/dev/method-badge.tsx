import { Badge } from "@workspace/ui/components/badge"

export function MethodBadge({ method }: { method: string }) {
  return (
    <Badge
      variant={method === "GET" ? "secondary" : "default"}
      className="font-mono"
    >
      {method}
    </Badge>
  )
}
