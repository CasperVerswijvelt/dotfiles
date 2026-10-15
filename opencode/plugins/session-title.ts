// Names a session "<PROJECT>: <SUMMARY>" from its first prompt, like the Claude Code hook
// claude/scripts/session-title.sh. Both read the instruction from claude/session-title.md.
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, join } from "node:path"
import { Plugin } from "@opencode/plugin"

const INSTRUCTION = join(homedir(), "dotfiles/claude/session-title.md")
const MODEL = { providerID: "anthropic", id: "claude-haiku-5-5" }

function text(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("\n")
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.text === "string") return record.text
    return text(record.content ?? record.parts)
  }
  return ""
}

function slug(summary: string): string {
  return summary.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).slice(0, 3).join("-")
}

export default Plugin.define({
  id: "dotfiles.session-title",
  async setup(ctx) {
    const directory = ctx.location.project?.canonical ?? ctx.location.directory
    if (!directory) return
    const project = basename(directory).toUpperCase()
    await ctx.session.hook("title", async (event) => {
      const prompt = text(event.messages).slice(0, 2000)
      const instruction = await readFile(INSTRUCTION, "utf8").catch(() => undefined)
      if (!prompt || !instruction) return
      const reply = await ctx.generate
        .text({ model: MODEL, prompt: `${instruction}\nMessage:\n${prompt}` })
        .catch(() => undefined)
      const summary = slug(text(reply))
      if (summary) event.result = `${project}: ${summary}`
    })
  },
})
