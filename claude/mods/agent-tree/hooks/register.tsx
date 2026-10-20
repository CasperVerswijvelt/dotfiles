import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentTreeNode } from '../types'

const PANE = 'agent-tree'
const ROOT = 'main'
const GONE_MS = 120_000
const nodes = atom({ plugin: 'agent-tree', key: 'nodes' } as const, [] as AgentTreeNode[])
// Redraw clock, once a second while an agent runs: the durations show seconds.
const tick = atom({ plugin: 'agent-tree', key: 'tick' } as const, 0)
const COMMAND = 'agent-tree'

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}~` : s)
const span = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

// Desktop duration: 12s, 4m, 1h 5m.
export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
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
// Desktop tree lines: Box bars. `width` counts ch and `height` lh, both fractional: 0.14ch and 0.05lh are about 1px.
const LINE = TIER.g.mark
const BAR = 0.14
const ARM = 0.05
const CELL = 2

const patch = (id: string, change: Partial<AgentTreeNode>) => (list: AgentTreeNode[]) =>
  list.map(n => (n.id === id ? { ...n, ...change } : n))

export const register: Register = on => {
  let timer: { cancel: () => void } | undefined
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
      const now = await $.clock.now()
      const node: AgentTreeNode = {
        id: r.agentId,
        parentId: e.parentAgentId ?? ROOT,
        type: e.subagentType,
        description: e.description,
        model: r.model,
        startedAt: now,
        status: 'running',
      }
      // A resume answers the agent's own id: update its row in place, never add a second.
      await update($, nodes, list =>
        list.some(n => n.id === node.id)
          ? list.map(n =>
              n.id === node.id
                ? { ...n, description: e.description || n.description, model: r.model ?? n.model, startedAt: now, endedAt: undefined, status: 'running' as const, needsYou: undefined, review: undefined }
                : n,
            )
          : [...list, node],
      )
      // A once-a-second redraw, only while something runs.
      const stop = async () => {
        if ((await read($, nodes)).some(n => n.status === 'running')) return
        timer?.cancel()
        timer = undefined
      }
      timer ??= $.clock.every(1000, async () => {
        await update($, tick, n => n + 1)
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
    await read($, tick)
    const kids = (id: string) => list.filter(n => n.parentId === id)
    // Finished a while ago, with every descendant gone too.
    const isGone = (n: AgentTreeNode): boolean =>
      n.status !== 'running' && now - (n.endedAt ?? now) > GONE_MS && kids(n.id).every(isGone)
    // `trail` is the tree glyphs of the ancestors (terminal); `open` says which ancestors have more children below (desktop).
    const rows: { n: AgentTreeNode; depth: number; last: boolean; trail: string; open: boolean[] }[] = []
    const walk = (id: string, depth: number, trail: string, open: boolean[]) => {
      // Only a whole finished top-level tree fades: a visible agent keeps every child, so a resume shows its history.
      const ks = kids(id).filter(n => id !== ROOT || !isGone(n))
      ks.forEach((n, i) => {
        const last = i === ks.length - 1
        rows.push({ n, depth, last, trail, open })
        walk(n.id, depth + 1, trail + (last ? '  ' : '│ '), [...open, !last])
      })
    }
    walk(ROOT, 1, '', [])
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
    const elapsed = (n: AgentTreeNode) => fmtDuration((n.endedAt ?? now) - n.startedAt)

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
      // The tree lines are thin Boxes, not glyphs: the mono face has no tee and the fallback glyph sits differently.
      // A cell is CELL wide per depth; the connector stretches the full row height, so the trunk runs through the action slot.
      const bar = <Box width={BAR} backgroundColor={LINE} flexShrink={0} />
      const rowEls = rows.map(({ n, last, open }) => {
        const run = n.status === 'running'
        const t = TIER[tier(n)]
        const dim = !run
        const ph = phase(n)
        const tool = run && n.currentTool ? n.currentTool : undefined
        const cc = n.review ? chipFill(n.review.grade) : undefined
        const parent = kids(n.id).length > 0
        return (
          <Box key={n.id} flexDirection="row" width="100%">
            <Box flexDirection="row" flexShrink={0}>
              {open.map((o, i) => <Box key={String(i)} width={CELL} flexShrink={0} flexDirection="row">{o && bar}</Box>)}
              <Box width={CELL} flexShrink={0} flexDirection="column">
                {/* First line: the bar down to its middle, and the arm across. */}
                <Box height={1} flexShrink={0} flexDirection="row">
                  {bar}
                  <Box flexGrow={1} flexDirection="column" justifyContent="flex-end"><Box height={ARM} backgroundColor={LINE} /></Box>
                </Box>
                <Box flexGrow={1} flexDirection="row">{!last && bar}</Box>
              </Box>
            </Box>
            {/* The mark column carries the parent's line: a bar in the children's connector column, from below the mark to the row's bottom. */}
            <Box flexDirection="row" flexGrow={1} gap={1}>
              <Box flexDirection="column" flexShrink={0}>
                <Box paddingTop={1}>
                  {run ? <Text mono color={t.mark}>●</Text> : n.status === 'done' ? <Text mono color={DONE} dimColor>✓</Text> : <Text mono color={FAILED} dimColor>✗</Text>}
                </Box>
                {parent && <Box width={BAR} flexGrow={1} backgroundColor={LINE} />}
              </Box>
              {/* The row's spacing is inside here, so the connector column has no gaps: padding above line 1, the slot below it. */}
              <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} paddingTop={1}>
                {/* Line 1: chips, description, phase, time. */}
                <Box flexDirection="row" minWidth={0} gap={1}>
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
                  </Box>
                  {ph && (
                    <Box flexShrink={1} minWidth={0}>
                      <Text wrap="truncate-end" italic dimColor size="caption">{ph}</Text>
                    </Box>
                  )}
                  {/* Wide enough for 1h 59m, right aligned: a changing value moves nothing. */}
                  <Box flexShrink={0} minWidth={5} justifyContent="flex-end">
                    <Text tabular dimColor size="caption">{elapsed(n)}</Text>
                  </Box>
                </Box>
                {/* The spacing under line 1 is a fixed slot, as tall as the bottom padding it replaces, so a row never changes height.
                    The action overflows it downward into the next row's empty top padding: 9.75px + 16px caption fits in the 19.5px between two line 1s. */}
                <Box height={0.5} flexShrink={0} overflow="visible" flexDirection="column" minWidth={0}>
                  {/* Not shrinkable: a truncating Text alone would shrink to the slot and clip. */}
                  {tool && <Box flexShrink={0}><Text wrap="truncate-end" dimColor size="caption">{tool}</Text></Box>}
                </Box>
              </Box>
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
            <Box flexDirection="column" width="100%">{rowEls}</Box>
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
