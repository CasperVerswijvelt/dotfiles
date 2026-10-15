// OpenCode only reads AGENTS.md, and its `instructions` setting is ignored in v2.0.29.
// This adds every project CLAUDE.md from the project root down to the session directory,
// read fresh on each model call so edits apply at once.
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, relative, isAbsolute } from "node:path"
import { Plugin } from "@opencode/plugin"

const NAMES = ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"]

function directories(start: string, root: string | undefined): string[] {
  const inside = root !== undefined && !relative(root, start).startsWith("..") && !isAbsolute(relative(root, start))
  if (!inside) return [start]
  const dirs: string[] = []
  for (let dir = start; ; dir = dirname(dir)) {
    dirs.unshift(dir)
    if (dir === root || dir === dirname(dir)) return dirs
  }
}

async function load(start: string, root: string | undefined): Promise<string[]> {
  const texts: string[] = []
  for (const dir of directories(start, root)) {
    if (dir === homedir()) continue
    for (const name of NAMES) {
      const path = join(dir, name)
      const text = await readFile(path, "utf8").catch(() => undefined)
      if (text?.trim()) texts.push(`Instructions from: ${path}\n${text}`)
    }
  }
  return texts
}

export default Plugin.define({
  id: "dotfiles.claude-md",
  async setup(ctx) {
    const start = ctx.location.directory
    const root = ctx.location.project?.directory
    if (!start) return
    await ctx.session.hook("context", async (event) => {
      for (const text of await load(start, root)) event.system.push({ type: "text", text })
    })
  },
})
