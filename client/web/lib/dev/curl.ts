import type { DevEndpoint, DevInput } from "./endpoints"
import { buildRequestUrl, buildRequestBody } from "./run"

/** シングルクォートを含む文字列を安全にシェル引数へ */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

export function buildCurl(
  endpoint: DevEndpoint,
  input: DevInput,
  origin?: string
): string {
  const base =
    origin ?? (typeof window === "undefined" ? "" : window.location.origin)
  const url = `${base}${buildRequestUrl(endpoint, input)}`
  const parts = ["curl", "-i", "-X", endpoint.method, shellQuote(url)]
  if (endpoint.method !== "GET") {
    const body = buildRequestBody(endpoint, input)
    parts.push("-H", shellQuote("content-type: application/json"))
    parts.push("-d", shellQuote(JSON.stringify(body)))
  }
  return parts.join(" ")
}
