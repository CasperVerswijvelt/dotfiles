// Names a session "<PROJECT>: <SUMMARY>" from its first prompt, like the Claude Code hook
// claude/scripts/session-title.sh. Both read the instruction from claude/session-title.md.
// The prefix is only set inside a git repo; elsewhere the title is just the summary.
import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, dirname, join } from "node:path"
import { promisify } from "node:util"
import { Plugin } from "@opencode/plugin"

const run = promisify(execFile)

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

// The main checkout's folder, also from inside a worktree. Undefined outside a git repo.
async function projectName(directory: string): Promise<string | undefined> {
  try {
    const { stdout } = await run("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"])
    const common = stdout.trim()
    return common ? basename(dirname(common)).toUpperCase() : undefined
  } catch {
    return undefined
  }
}

function slug(summary: string): string {
  return summary.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).slice(0, 3).join("-")
}

export default Plugin.define({
  id: "dotfiles.session-title",
  async setup(ctx) {
    const directory = ctx.location.directory ?? ctx.location.project?.canonical
    if (!directory) return
    const project = await projectName(directory)
    await ctx.session.hook("title", async (event) => {
      const prompt = text(event.messages).slice(0, 2000)
      const instruction = await readFile(INSTRUCTION, "utf8").catch(() => undefined)
      if (!prompt || !instruction) return
      const reply = await ctx.generate
        .text({ model: MODEL, prompt: `${instruction}\nMessage:\n${prompt}` })
        .catch(() => undefined)
      const summary = slug(text(reply))
      if (summary) event.result = project ? `${project}: ${summary}` : summary
    })
  },
})
