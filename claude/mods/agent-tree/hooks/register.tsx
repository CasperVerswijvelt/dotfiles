import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentTreeNode } from '../types'

const PANE = 'agent-tree'
const ROOT = 'main'
const GONE_MS = 120_000
const nodes = atom({ plugin: 'agent-tree', key: 'nodes' } as const, [] as AgentTreeNode[])
// Terminal redraw, once a second. The desktop pane reads `minute` instead: it redraws at most once a minute.
const tick = atom({ plugin: 'agent-tree', key: 'tick' } as const, 0)
const minute = atom({ plugin: 'agent-tree', key: 'minute' } as const, 0)
const COMMAND = 'agent-tree'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}~` : s)
const span = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

const PHASES = ['plan', 'implement', 'gate', 'review', 'land', 'report']
// `<phase>: <what>` gives the phase; anything else gives undefined.
export const parsePhase = (description: string): string | undefined => {
  const m = /^\s*([a-z]+)\s*:/i.exec(description)
  const p = m?.[1]?.toLowerCase()
  return p !== undefined && PHASES.includes(p) ? p : undefined
}

// The judge header of a review report: `<branch> [<grade>] round <n>`, on the first non-empty line, in any markdown.
// Later lines are ignored, so a report that quotes a header does not count. Code fence lines are skipped.
export const parseJudgeHeader = (text: string): { grade: string; round: number } | undefined => {
  const first = text.split('\n').find((l) => l.trim() !== '' && !/^\s*`{3,}/.test(l))
  const m = first === undefined ? null : /^[ \t>*_`#-]*[^\s`*_\[][^\n]*?\[(A-|A|B|C|D|F)\][`*_]*[ \t]+round[ \t]+(\d+)/.exec(first)
  return m ? { grade: m[1]!, round: Number(m[2]) } : undefined
}

// An orchestrator report with a `For you` line: at the start of a line, emoji, bold and backticks optional.
export const hasForYou = (text: string): boolean => /^[ \t>*_`-]*(?:\u26A0\uFE0F?[ \t]*)?[*_`]*For you[*_`]*[ \t]*[:\uFF1A]/m.test(text)

const chipFill = (grade: string) =>
  grade === 'F' ? { fill: '#E24B4A', text: '#FFFFFF' }
  : grade.startsWith('A') ? { fill: '#C0DD97', text: '#27500A' }
  : { fill: '#D3D1C7', text: '#2C2C2A' }

// The `model:` value of a file's frontmatter, lowercased and unquoted.
export const parseAgentModel = (text: string): string | undefined => {
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const v = fm && /^model:[ \t]*(.*?)[ \t]*$/m.exec(fm[1]!)?.[1]?.replace(/^(["'])(.*)\1$/, '$2').trim()
  return v ? v.toLowerCase() : undefined
}
const parseAgentName = (text: string): string | undefined => {
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  const v = fm && /^name:[ \t]*(.*?)[ \t]*$/m.exec(fm[1]!)?.[1]?.replace(/^(["'])(.*)\1$/, '$2').trim()
  return v || undefined
}

// Agent type -> model text, from agent files: the frontmatter `name:`, else the basename.
export const buildTierMap = (files: { name: string; text: string }[]): Record<string, string> => {
  const map: Record<string, string> = {}
  for (const f of files) {
    const model = parseAgentModel(f.text)
    if (model !== undefined) map[parseAgentName(f.text) ?? f.name.replace(/\.md$/, '')] = model
  }
  return map
}

// Model tier: o(pus), s(onnet), h(aiku) or g(ray). The agent type backs up a missing model: the agent files first, then the built-in roles.
const of = (m: string) => (/opus|orchestrator/i.test(m) ? 'o' : /sonnet|implementer|reviewer/i.test(m) ? 's' : /haiku|scout/i.test(m) ? 'h' : 'g')
const tierIn = (map: Record<string, string>, n: AgentTreeNode) => {
  const byModel = of(n.model ?? '')
  if (byModel !== 'g') return byModel
  const byFile = of(map[n.type] ?? '')
  return byFile === 'g' ? of(n.type) : byFile
}

// Tool name plus a short hint: file name, command or pattern.
const label = (e: { tool: unknown }) => {
  const i = e as unknown as Record<string, unknown>
  const hint = i.file_path ?? i.command ?? i.pattern ?? i.description
  // One line: every whitespace run, newlines of a heredoc included, becomes one space.
  return typeof hint === 'string' ? `${String(e.tool)} ${clip((hint.split('/').pop() ?? '').replace(/\s+/g, ' ').trim(), 80)}` : String(e.tool)
}

// Tier colours of the desktop pane: a light chip fill with dark ink reads on both themes; marks are mid tones.
const TIER = {
  o: { fill: '#CECBF6', ink: '#3C3489', mark: '#7F77DD' },
  s: { fill: '#9FE1CB', ink: '#085041', mark: '#1D9E75' },
  h: { fill: '#FAC775', ink: '#633806', mark: '#EF9F27' },
  g: { fill: '#F1EFE8', ink: '#444441', mark: '#888780' },
}
// Status and accent colours of the desktop pane, named once.
const DONE = TIER.g.mark
const FAILED = chipFill('F').fill
const NEEDS = { fill: TIER.h.mark, ink: '#412402' }
const MAIN = TIER.o.mark

const patch = (id: string, change: Partial<AgentTreeNode>) => (list: AgentTreeNode[]) =>
  list.map(n => (n.id === id ? { ...n, ...change } : n))

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined
  let minuteTimer: { cancel: () => void } | undefined
  let opened = false
  let agentModels: Record<string, string> = {}
  const tier = (n: AgentTreeNode) => tierIn(agentModels, n)

  on('session.start', async ($, e, next) => {
    // Each registration on its own: one refusal must not drop the rest of this hook.
    try {
      await $.command.register({ name: COMMAND, description: 'Show the live agent tree in a pane' })
    } catch (err) {
      $.ui.log(`agent-tree: command registration failed: ${String(err)}`, { to: 'debug' })
    }
    // Roles from ~/.claude/agents/*.md; any failure keeps the built-in roles.
    try {
      const home = await $.env.get('HOME')
      if (home) {
        const dir = `${home}/.claude/agents`
        const files: { name: string; text: string }[] = []
        for (const f of await $.fs.list(dir)) {
          if (!f.name.endsWith('.md')) continue
          try {
            files.push({ name: f.name, text: await $.fs.read(`${dir}/${f.name}`) })
          } catch {
            // One unreadable file does not drop the others.
          }
        }
        agentModels = buildTierMap(files)
      }
    } catch (err) {
      $.ui.log(`agent-tree: reading agent files failed: ${String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Agents pane opened.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined || r.agentId === undefined) return r
    // Bookkeeping is best-effort: a failure here must not fail the real spawn.
    try {
      const node: AgentTreeNode = {
        id: r.agentId,
        parentId: e.parentAgentId ?? ROOT,
        type: e.subagentType,
        description: e.description,
        model: r.model,
        startedAt: await $.clock.now(),
        status: 'running',
      }
      await update($, nodes, list => [...list, node])
      // A once-a-second redraw, only while something runs.
      const stop = async () => {
        if ((await read($, nodes)).some(n => n.status === 'running')) return
        timer?.cancel()
        timer = undefined
        minuteTimer?.cancel()
        minuteTimer = undefined
      }
      timer ??= $.clock.every(1000, async () => {
        await update($, tick, n => n + 1)
        await stop()
      })
      minuteTimer ??= $.clock.every(60_000, async () => {
        await update($, minute, n => n + 1)
        await stop()
      })
      if (!opened) {
        opened = true
        void $.ui.open({ id: PANE, title: 'Agents' })
      }
    } catch (err) {
      $.ui.log(`agent-tree: spawn bookkeeping failed: ${String(err)}`, { to: 'debug' })
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      try {
        await update($, nodes, patch(id, { currentTool: label(e) }))
      } catch (err) {
        $.ui.log(`agent-tree: tool bookkeeping failed: ${String(err)}`, { to: 'debug' })
      }
    }
    try {
      return await next(e)
    } finally {
      if (id !== undefined) {
        try {
          await update($, nodes, patch(id, { currentTool: undefined }))
        } catch (err) {
          $.ui.log(`agent-tree: tool bookkeeping failed: ${String(err)}`, { to: 'debug' })
        }
      }
    }
  })

  on('turn.complete', async ($, e, next) => {
    // Read first, always: the engine refuses a conditional read.
    const list = await read($, nodes)
    if (e.agentId !== undefined) {
      try {
        const endedAt = await $.clock.now()
        const me = list.find(n => n.id === e.agentId)
        const header = me?.type === 'my-reviewer' && !e.isAborted ? parseJudgeHeader(e.answer) : undefined
        const boss = list.find(n => n.id === me?.parentId)
        const change: Partial<AgentTreeNode> = { status: e.isAborted ? 'failed' : 'done', endedAt, currentTool: undefined }
        if (me?.type === 'my-orchestrator' && !e.isAborted) change.needsYou = hasForYou(e.answer)
        await update($, nodes, list2 =>
          patch(e.agentId!, change)(list2).map(n => (header && boss?.type === 'my-orchestrator' && n.id === boss.id ? { ...n, review: header } : n)),
        )
      } catch (err) {
        $.ui.log(`agent-tree: turn bookkeeping failed: ${String(err)}`, { to: 'debug' })
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, nodes)
    const now = await $.clock.now()
    // Subscribe to the one redraw clock this surface needs.
    if (e.surface === 'terminal') await read($, tick)
    else await read($, minute)
    const kids = (id: string) => list.filter(n => n.parentId === id)
    // Finished a while ago, with every descendant gone too.
    const isGone = (n: AgentTreeNode): boolean =>
      n.status !== 'running' && now - (n.endedAt ?? now) > GONE_MS && kids(n.id).every(isGone)
    // `trail` is the tree glyphs of the ancestors.
    const rows: { n: AgentTreeNode; depth: number; last: boolean; trail: string }[] = []
    const walk = (id: string, depth: number, trail: string) => {
      const ks = kids(id).filter(n => !isGone(n))
      ks.forEach((n, i) => {
        const last = i === ks.length - 1
        rows.push({ n, depth, last, trail })
        walk(n.id, depth + 1, trail + (last ? '  ' : '│ '))
      })
    }
    walk(ROOT, 1, '')
    // An orchestrator's phase: its most recent running child with a valid prefix.
    const phase = (n: AgentTreeNode) =>
      n.type === 'my-orchestrator'
        ? kids(n.id)
            .filter(c => c.status === 'running')
            .reverse()
            .map(c => parsePhase(c.description))
            .find(p => p !== undefined)
        : undefined
    const chipText = (n: AgentTreeNode) => (n.review ? `${n.review.grade} \u00B7 r${n.review.round}` : '')
    const time = (n: AgentTreeNode) => span((n.endedAt ?? now) - n.startedAt)
    const color = (n: AgentTreeNode) => ({ o: 'magenta', s: 'cyan', h: 'yellow', g: undefined })[tier(n)]
    // Whole minutes only, so the tree stays the same between ticks.
    const mins = (n: AgentTreeNode) => {
      const m = Math.floor(((n.endedAt ?? now) - n.startedAt) / 60_000)
      return m < 1 ? '<1m' : `${m}m`
    }

    if (e.surface !== 'terminal') {
      // Native Box and Text: no pixel width anywhere, so the pane fills the sidebar and relays out when it is resized.
      // A chip is a filled label; on a receded row the type chip drops the fill and shows its label in `tone`, dimmed.
      // The grade and needs-you chips never recede: they are what a finished row exists to show.
      const chip = (fill: string, ink: string, text: string, opts: { key?: string; dim?: boolean; tone?: string; cut?: boolean } = {}) =>
        opts.dim ? (
          <Text key={opts.key} wrap={opts.cut ? 'truncate-end' : undefined} color={opts.tone ?? ink} dimColor size="caption" weight="semibold">{` ${text} `}</Text>
        ) : (
          <Text key={opts.key} wrap={opts.cut ? 'truncate-end' : undefined} backgroundColor={fill} color={ink} size="caption" weight="semibold">{` ${text} `}</Text>
        )
      const rowEls = rows.map(({ n, trail, last }) => {
        const run = n.status === 'running'
        const t = TIER[tier(n)]
        const dim = !run
        const ph = phase(n)
        const tool = run && n.currentTool ? n.currentTool : undefined
        const cc = n.review ? chipFill(n.review.grade) : undefined
        return (
          <Box key={n.id} flexDirection="row" width="100%" gap={1}>
            <Box flexDirection="column" flexShrink={0}>
              {/* Connector and status mark are adjacent mono Texts, so the prefix has a fixed width per depth. */}
              <Box flexDirection="row">
                <Text mono dimColor>{`${trail}${last ? '└─' : '├─'}`}</Text>
                {run ? <Text mono color={t.mark}>{' ◐'}</Text> : n.status === 'done' ? <Text mono color={DONE} dimColor>{' ✓'}</Text> : <Text mono color={FAILED} dimColor>{' ✗'}</Text>}
              </Box>
              {tool && <Text mono dimColor>{`${trail}${last ? '  ' : '│ '}`}</Text>}
            </Box>
            {/* Shrinks last: the description gives way first, down to its minimum. */}
            <Box flexDirection="row" flexShrink={0.2} minWidth={0} flexWrap="wrap" gap={1} alignItems="flex-start">
              <Box flexDirection="row" flexShrink={1} minWidth={0} gap={1} alignItems="flex-start">
                {chip(t.fill, t.ink, n.type, { dim, tone: t.mark, cut: true })}
              </Box>
              {cc && chip(cc.fill, cc.text, chipText(n))}
              {n.needsYou && chip(NEEDS.fill, NEEDS.ink, 'needs you')}
            </Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={12}>
              <Text wrap="truncate-end" dimColor={dim}>{n.description}</Text>
              {tool && <Text wrap="truncate-end" dimColor size="caption">{tool}</Text>}
            </Box>
            {ph && (
              <Box flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end" italic dimColor size="caption">{ph}</Text>
              </Box>
            )}
            <Box flexShrink={0}>
              <Text tabular dimColor size="caption">{mins(n)}</Text>
            </Box>
          </Box>
        )
      })
      return (
        <Box flexDirection="column" width="100%" gap={1} padding={1}>
          <Text weight="semibold" color={MAIN}>Main</Text>
          {rows.length === 0 ? (
            <Box paddingLeft={2}><Text dimColor>No agents yet</Text></Box>
          ) : (
            <Box flexDirection="column" width="100%" gap={1}>{rowEls}</Box>
          )}
          <Box flexDirection="row" flexWrap="wrap" gap={2}>
            {([['o', 'Opus'], ['s', 'Sonnet'], ['h', 'Haiku']] as const).map(([k, name]) => chip(TIER[k].fill, TIER[k].ink, name, { key: k }))}
          </Box>
        </Box>
      )
    }

    // The description is limited by the body width when the surface reports it, else 40 cells.
    const cols = typeof (e.props as { bodyColumns?: unknown } | undefined)?.bodyColumns === 'number' ? (e.props as { bodyColumns: number }).bodyColumns : undefined
    return (
      <Box flexDirection="column">
        <Text bold color="magenta">Main</Text>
        {rows.length === 0 && <Text dimColor>No agents yet</Text>}
        {rows.map(({ n, trail, last }) => {
          const run = n.status === 'running'
          const mark = run ? '●' : n.status === 'done' ? '✓' : '✗'
          const ph = phase(n)
          const rev = n.review ? ` [${chipText(n)}]` : ''
          const flag = n.needsYou ? ' [needs you]' : ''
          const model = n.model ? ` [${n.model}]` : ''
          // Everything on the row but the description, to size it against.
          const fixed = ` ${trail}${last ? '└─' : '├─'} ${mark} ${n.type}${ph ? ` ${ph}` : ''}${rev}${flag} ${model} ${time(n)}`.length
          // Never wider than the body: the description gets what the fixed part leaves, and the row truncates as a last resort.
          const limit = cols === undefined ? 40 : Math.max(0, cols - fixed)
          return (
            <Box key={n.id} flexDirection="column">
              <Text wrap="truncate-end" dimColor={n.status === 'done'} color={n.status === 'failed' ? 'red' : undefined}>
                {' '}<Text dimColor>{trail}{last ? '└─' : '├─'}</Text> <Text color={run ? 'green' : undefined}>{mark}</Text>{' '}
                <Text color={color(n)}>{n.type}</Text>{ph ? <Text dimColor> {ph}</Text> : null}{n.review ? <Text color={n.review.grade === 'F' ? 'red' : n.review.grade.startsWith('A') ? 'green' : undefined}>{rev}</Text> : null}{n.needsYou ? <Text color="yellow">{flag}</Text> : null} {limit > 0 ? clip(n.description, limit) : ''}{model} {time(n)}
              </Text>
              {run && n.currentTool ? (
                <Text wrap="truncate-end" dimColor>{`  ${trail}${last ? '  ' : '│ '}   ${n.currentTool}`}</Text>
              ) : null}
            </Box>
          )
        })}
      </Box>
    )
  })
}
