import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentTreeNode } from '../types'

const PANE = 'agent-tree'
const ROOT = 'main'
const GONE_MS = 120_000
const nodes = atom({ plugin: 'agent-tree', key: 'nodes' } as const, [] as AgentTreeNode[])
// Terminal redraw, once a second. The desktop Svg reads `minute` instead: it redraws at most once a minute.
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
  grade === 'F' ? { fill: '#E24B4A', stroke: '#A32D2D', text: '#FFFFFF' }
  : grade.startsWith('A') ? { fill: '#C0DD97', stroke: '#3B6D11', text: '#27500A' }
  : { fill: '#D3D1C7', stroke: '#5F5E5A', text: '#2C2C2A' }

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
  return typeof hint === 'string' ? `${String(e.tool)} ${clip(hint.split('/').pop() ?? '', 30)}` : String(e.tool)
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

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
    const rows: { n: AgentTreeNode; depth: number; at: number; parent: number; last: boolean; trail: string }[] = []
    const walk = (id: string, depth: number, parent: number, trail: string) => {
      const ks = kids(id).filter(n => !isGone(n))
      ks.forEach((n, i) => {
        const last = i === ks.length - 1
        rows.push({ n, depth, at: rows.length + 1, parent, last, trail })
        walk(n.id, depth + 1, rows.length, trail + (last ? '  ' : '│ '))
      })
    }
    walk(ROOT, 1, 0, '')
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
    // Whole minutes only, so the SVG source (and its frame) stays the same between ticks.
    const mins = (n: AgentTreeNode) => {
      const m = Math.floor(((n.endedAt ?? now) - n.startedAt) / 60_000)
      return m < 1 ? '&lt;1m' : `${m}m`
    }

    if (e.surface !== 'terminal') {
      const { Svg } = $.ui.resolve(e)
      // One SVG unit is one CSS px: the Svg gets the viewBox's own size, so it is not scaled.
      const W = 440
      const H = 30
      const X = (d: number) => 10 + d * 18
      const Y = (at: number) => at * H + H / 2
      const parts = rows.map(({ n, depth, at, parent }) => {
        const run = n.status === 'running'
        const k = tier(n)
        const cx = X(depth) + 6
        const cy = Y(at)
        const px = X(depth - 1) + 6
        const elbow = `<path d="M${px} ${Y(parent) + 8}V${cy}H${cx - 6}" fill="none" class="c" stroke-dasharray="3 3"${run ? '' : ' opacity="0.5"'}/>`
        // A glyph per status, so colour is never the only signal. All static.
        const glyph = (ch: string, extra: string) => `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="13" ${extra}>${ch}</text>`
        const mark = run ? glyph('◐', `class="gl ${k}"`) : n.status === 'done' ? glyph('✓', 'fill="#888780"') : glyph('✗', 'fill="#E24B4A"')
        const pw = Math.round(n.type.length * 6.6 + 14)
        const pxl = X(depth) + 16
        const chip = chipText(n)
        const cw = Math.round(chip.length * 7 + 12)
        const fw = 66
        const cc = n.review ? chipFill(n.review.grade) : undefined
        const chipSvg = cc ? `<rect x="${pxl + pw + 6}" y="${cy - 9}" width="${cw}" height="18" rx="9" fill="${cc.fill}" stroke="${cc.stroke}" stroke-width="0.5"/><text x="${pxl + pw + 6 + cw / 2}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${cc.text}">${chip}</text>` : ''
        const fx = pxl + pw + 6 + (cc ? cw + 4 : 0)
        const flagSvg = n.needsYou ? `<rect x="${fx}" y="${cy - 9}" width="${fw}" height="18" rx="9" fill="#EF9F27" stroke="#854F0B" stroke-width="0.5"/><text x="${fx + fw / 2}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#412402">needs you</text>` : ''
        const dx = pxl + pw + 8 + (cc ? cw + 4 : 0) + (n.needsYou ? fw + 4 : 0)
        const tool = run && n.currentTool ? clip(n.currentTool, 18) : ''
        const ph = phase(n)
        const phw = ph ? ph.length * 6 + 14 : 0
        const room = W - 52 - dx - phw - (tool ? tool.length * 6.3 + 8 : 0)
        return `<g${run ? '' : ' opacity="0.55"'}>${elbow}<g>${mark}<g class="${k}"><rect x="${pxl}" y="${cy - 10}" width="${pw}" height="20" rx="10" stroke-width="0.5"/><text x="${pxl + pw / 2}" y="${cy + 4}" text-anchor="middle" class="t" font-size="12.5">${esc(n.type)}</text></g><text x="${dx}" y="${cy + 5}" class="d">${esc(clip(n.description, Math.max(6, Math.floor(room / 7.2))))}</text>${ph ? `<text x="${W - 52 - (tool ? tool.length * 6.3 + 8 : 0)}" y="${cy + 4}" text-anchor="end" class="s" font-style="italic">${ph}</text>` : ''}${tool ? `<text x="${W - 52}" y="${cy + 4}" text-anchor="end" class="s">${esc(tool)}</text>` : ''}<text x="${W - 8}" y="${cy + 4}" text-anchor="end" class="s">${mins(n)}</text></g></g>${chipSvg}${flagSvg}`
      })
      const total = (rows.length + 2) * H
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${total}" width="${W}" height="${total}" font-family="-apple-system, system-ui, sans-serif" font-size="14">` +
        `<style>.o rect{fill:#CECBF6;stroke:#534AB7}.o .t{fill:#3C3489}.s rect{fill:#9FE1CB;stroke:#0F6E56}.s .t{fill:#085041}.m{fill:#534AB7}` +
        `.h rect{fill:#FAC775;stroke:#BA7517}.h .t{fill:#633806}.g rect{fill:#F1EFE8;stroke:#5F5E5A}.g .t{fill:#444441}` +
        `.o.gl{fill:#534AB7}.s.gl{fill:#0F6E56}.h.gl{fill:#BA7517}.g.gl{fill:#5F5E5A}.c{stroke:#B4B2A9}text.d{fill:#2C2C2A}text.s{fill:#5F5E5A;font-size:12.5px}` +
        `@media (prefers-color-scheme:dark){.o rect{fill:#3C3489;stroke:#AFA9EC}.o .t{fill:#CECBF6}.s rect{fill:#085041;stroke:#5DCAA5}.s .t{fill:#9FE1CB}` +
        `.o.gl{fill:#AFA9EC}.s.gl{fill:#5DCAA5}.h.gl{fill:#EF9F27}.g.gl{fill:#B4B2A9}.h rect{fill:#633806;stroke:#EF9F27}.h .t{fill:#FAC775}.m{fill:#AFA9EC}.g rect{fill:#444441;stroke:#B4B2A9}.g .t{fill:#D3D1C7}.c{stroke:#5F5E5A}text.d{fill:#D3D1C7}text.s{fill:#B4B2A9}}</style>` +
        `<text x="${X(0)}" y="${Y(0) + 5}" font-weight="600" class="m">Main</text>` +
        (rows.length ? parts.join('') : `<text x="${X(1)}" y="${Y(1) + 5}" class="s">No agents yet</text>`) +
        ([['o', 'Opus'], ['s', 'Sonnet'], ['h', 'Haiku']] as const)
          .map(([c, t], i) => `<g class="${c}"><rect x="${X(0) + i * 80}" y="${total - 22}" width="12" height="12" rx="3" stroke-width="0.5"/><text x="${X(0) + i * 80 + 18}" y="${total - 12}" class="s">${t}</text></g>`)
          .join('') +
        '</svg>'
      return (
        <Svg
          source={source}
          alt={`Agent tree: ${rows.map(({ n }) => `${n.type} ${n.description} ${n.status}`).join('; ') || 'no agents yet'}`}
          width={W}
          height={total}
        />
      )
    }

    return (
      <Box flexDirection="column">
        <Text bold color="magenta">Main</Text>
        {rows.length === 0 && <Text dimColor>No agents yet</Text>}
        {rows.map(({ n, trail, last }) => {
          const run = n.status === 'running'
          const mark = run ? '●' : n.status === 'done' ? '✓' : '✗'
          const tool = run && n.currentTool ? ` > ${n.currentTool}` : ''
          return (
            <Text key={n.id} dimColor={n.status === 'done'} color={n.status === 'failed' ? 'red' : undefined}>
              {' '}<Text dimColor>{trail}{last ? '└─' : '├─'}</Text> <Text color={run ? 'green' : undefined}>{mark}</Text>{' '}
              <Text color={color(n)}>{n.type}</Text>{phase(n) ? <Text dimColor> {phase(n)}</Text> : null}{n.review ? <Text color={n.review.grade === 'F' ? 'red' : n.review.grade.startsWith('A') ? 'green' : undefined}> [{chipText(n)}]</Text> : null}{n.needsYou ? <Text color="yellow"> [needs you]</Text> : null} {clip(n.description, 40)}{n.model ? ` [${n.model}]` : ''} {time(n)}{tool}
            </Text>
          )
        })}
      </Box>
    )
  })
}
