"use client"

import * as React from "react"
import { z } from "zod"

import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Slider } from "@workspace/ui/components/slider"
import { Switch } from "@workspace/ui/components/switch"
import { Button } from "@workspace/ui/components/button"

import type { DevInput } from "./endpoints"

/** enum 選択肢をセグメント表示に切り替える上限数 */
const SEGMENT_MAX_OPTIONS = 4

export type DevFieldSpec =
  | {
      kind: "enum"
      name: string
      required: boolean
      description?: string
      options: { label: string; value: string | number }[]
      valueType: "string" | "number"
    }
  | {
      kind: "number"
      name: string
      required: boolean
      description?: string
      min?: number
      max?: number
      integer: boolean
    }
  | { kind: "boolean"; name: string; required: boolean; description?: string }
  | {
      kind: "string"
      name: string
      required: boolean
      description?: string
      format?: string
      maxLength?: number
    }
  /** object / array / unknown など、フォームで扱わずに JSON タブへ委ねる項目 */
  | { kind: "json"; name: string; required: boolean; description?: string }

type JsonSchemaNode = {
  type?: string | string[]
  enum?: unknown[]
  const?: unknown
  anyOf?: JsonSchemaNode[]
  oneOf?: JsonSchemaNode[]
  minimum?: number
  maximum?: number
  maxLength?: number
  format?: string
  description?: string
  default?: unknown
}

type JsonSchemaObject = JsonSchemaNode & {
  properties?: Record<string, JsonSchemaNode>
  required?: string[]
}

function nodeType(node: JsonSchemaNode): string | undefined {
  if (Array.isArray(node.type)) {
    return node.type.find((entry) => entry !== "null")
  }
  return node.type
}

/** anyOf/oneOf が literal の集合なら enum として扱う */
function literalUnionOptions(
  node: JsonSchemaNode
): { values: (string | number)[]; valueType: "string" | "number" } | null {
  const branches = node.anyOf ?? node.oneOf
  if (!branches || branches.length === 0) return null
  const values: (string | number)[] = []
  for (const branch of branches) {
    const literal = branch.const
    if (typeof literal === "string" || typeof literal === "number") {
      values.push(literal)
      continue
    }
    if (Array.isArray(branch.enum)) {
      for (const entry of branch.enum) {
        if (typeof entry === "string" || typeof entry === "number") {
          values.push(entry)
        } else {
          return null
        }
      }
      continue
    }
    return null
  }
  if (values.length === 0) return null
  const valueType = values.every((value) => typeof value === "number")
    ? "number"
    : "string"
  return { values, valueType }
}

function toFieldSpec(
  name: string,
  node: JsonSchemaNode,
  required: boolean
): DevFieldSpec {
  const base = { name, required, description: node.description }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    const values = node.enum.filter(
      (entry): entry is string | number =>
        typeof entry === "string" || typeof entry === "number"
    )
    if (values.length === node.enum.length) {
      return {
        ...base,
        kind: "enum",
        valueType: values.every((value) => typeof value === "number")
          ? "number"
          : "string",
        options: values.map((value) => ({ label: String(value), value })),
      }
    }
  }

  const union = literalUnionOptions(node)
  if (union) {
    return {
      ...base,
      kind: "enum",
      valueType: union.valueType,
      options: union.values.map((value) => ({ label: String(value), value })),
    }
  }

  const type = nodeType(node)
  if (type === "number" || type === "integer") {
    return {
      ...base,
      kind: "number",
      min: node.minimum,
      max: node.maximum,
      integer: type === "integer",
    }
  }
  if (type === "boolean") return { ...base, kind: "boolean" }
  if (type === "string") {
    return {
      ...base,
      kind: "string",
      format: node.format,
      maxLength: node.maxLength,
    }
  }
  return { ...base, kind: "json" }
}

/**
 * zod スキーマ → フォーム項目定義。
 * zod 4 の `z.toJSONSchema` を経由するため、内部構造（`_zod.def`）に依存しない。
 */
export function buildFields(schema: z.ZodType | undefined): DevFieldSpec[] {
  if (!schema) return []
  let jsonSchema: JsonSchemaObject
  try {
    jsonSchema = z.toJSONSchema(schema, {
      io: "input",
      unrepresentable: "any",
    }) as JsonSchemaObject
  } catch {
    return []
  }
  const properties = jsonSchema.properties
  if (!properties) return []
  const requiredKeys = new Set(jsonSchema.required ?? [])
  return Object.entries(properties).map(([name, node]) =>
    toFieldSpec(name, node, requiredKeys.has(name))
  )
}

/** 入力値を zod で検証し、エラーメッセージ配列を返す */
export function validateInput(
  schema: z.ZodType | undefined,
  input: unknown
): string[] {
  if (!schema) return []
  const result = schema.safeParse(input)
  if (result.success) return []
  return result.error.issues.map(
    (issue) =>
      `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`
  )
}

function placeholderFor(field: DevFieldSpec): string | undefined {
  if (field.kind !== "string") return undefined
  if (field.format === "uri" || field.name.toLowerCase().includes("url")) {
    return "https://example.com"
  }
  return undefined
}

function EnumField({
  field,
  value,
  onChange,
}: {
  field: Extract<DevFieldSpec, { kind: "enum" }>
  value: unknown
  onChange: (next: unknown) => void
}) {
  const current = value === undefined || value === null ? "" : String(value)
  const cast = (raw: string): string | number =>
    field.valueType === "number" ? Number(raw) : raw

  if (field.options.length <= SEGMENT_MAX_OPTIONS) {
    return (
      <div className="flex flex-wrap gap-2">
        {field.options.map((option) => (
          <Button
            key={String(option.value)}
            type="button"
            size="sm"
            variant={current === String(option.value) ? "default" : "outline"}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
        {!field.required && current !== "" ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(undefined)}
          >
            クリア
          </Button>
        ) : null}
      </div>
    )
  }

  const items = field.options.map((option) => ({
    label: option.label,
    value: String(option.value),
  }))

  return (
    <Select
      items={items}
      value={current === "" ? null : current}
      onValueChange={(next) => {
        if (next === null || next === undefined) {
          onChange(undefined)
          return
        }
        onChange(cast(String(next)))
      }}
    >
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function NumberField({
  field,
  value,
  onChange,
}: {
  field: Extract<DevFieldSpec, { kind: "number" }>
  value: unknown
  onChange: (next: unknown) => void
}) {
  const numeric = typeof value === "number" ? value : Number(value)
  const hasRange = field.min !== undefined && field.max !== undefined
  const safeValue = Number.isFinite(numeric) ? numeric : (field.min ?? 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Input
          type="number"
          className="w-32"
          value={Number.isFinite(numeric) ? String(numeric) : ""}
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : "any"}
          onChange={(event) => {
            const raw = event.target.value
            if (raw === "") {
              onChange(undefined)
              return
            }
            const parsed = Number(raw)
            onChange(Number.isFinite(parsed) ? parsed : undefined)
          }}
        />
        {hasRange ? (
          <span className="text-muted-foreground font-mono text-xs">
            {field.min} 〜 {field.max}
          </span>
        ) : null}
      </div>
      {hasRange ? (
        <Slider
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : undefined}
          value={safeValue}
          onValueChange={(next) => {
            onChange(Array.isArray(next) ? next[0] : next)
          }}
        />
      ) : null}
    </div>
  )
}

export function AutoForm({
  fields,
  value,
  onChange,
}: {
  fields: DevFieldSpec[]
  value: DevInput
  onChange: (next: DevInput) => void
}) {
  const setField = React.useCallback(
    (name: string, next: unknown) => {
      const draft: DevInput = { ...value }
      if (next === undefined) {
        delete draft[name]
      } else {
        draft[name] = next
      }
      onChange(draft)
    },
    [value, onChange]
  )

  if (fields.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        入力項目はありません。そのまま実行してください。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => (
        <div key={field.name} className="flex flex-col gap-2">
          <Label className="flex items-center gap-2 font-mono text-xs">
            {field.name}
            {field.required ? (
              <span className="text-destructive">*</span>
            ) : (
              <span className="text-muted-foreground">(任意)</span>
            )}
          </Label>
          {field.kind === "enum" ? (
            <EnumField
              field={field}
              value={value[field.name]}
              onChange={(next) => setField(field.name, next)}
            />
          ) : null}
          {field.kind === "number" ? (
            <NumberField
              field={field}
              value={value[field.name]}
              onChange={(next) => setField(field.name, next)}
            />
          ) : null}
          {field.kind === "boolean" ? (
            <Switch
              checked={value[field.name] === true}
              onCheckedChange={(checked) => setField(field.name, checked)}
            />
          ) : null}
          {field.kind === "string" ? (
            <Input
              value={
                typeof value[field.name] === "string"
                  ? (value[field.name] as string)
                  : ""
              }
              maxLength={field.maxLength}
              placeholder={placeholderFor(field)}
              onChange={(event) =>
                setField(
                  field.name,
                  event.target.value === "" && !field.required
                    ? undefined
                    : event.target.value
                )
              }
            />
          ) : null}
          {field.kind === "json" ? (
            <p className="text-muted-foreground text-xs">
              入れ子構造のため JSON タブで編集してください。
            </p>
          ) : null}
          {field.description ? (
            <p className="text-muted-foreground text-xs">{field.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
