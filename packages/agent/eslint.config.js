import { config } from "@workspace/eslint-config/base"

/** @type {import("eslint").Linter.Config} */
export default [
  // `mastra dev` / `mastra build` の生成物（.gitignore 済み）は lint 対象外
  { ignores: [".mastra/**"] },
  ...config,
]
