import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { AgentTreeNode } from '../types'

const PANE = 'agent-tree'
const ROOT = 'main'
const GONE_MS = 120_000
const nodes = atom({ plugin: 'agent-tree', key: 'nodes' } as const, [] as AgentTreeNode[])
const tick = atom({ plugin: 'agent-tree', key: 'tick' } as const, 0)

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}~` : s)
const span = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

// Model tier: o(pus), s(onnet), h(aiku) or g(ray). The agent type backs up a missing model (roles per the dotfiles).
const tier = (n: AgentTreeNode) => {
  const of = (m: string) => (/opus|orchestrator/i.test(m) ? 'o' : /sonnet|implementer|reviewer/i.test(m) ? 's' : /haiku|scout/i.test(m) ? 'h' : 'g')
  const byModel = of(n.model ?? '')
  return byModel === 'g' ? of(n.type) : byModel
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
  let opened = false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'agents', description: 'Show the live agent tree in a pane' })
    return next(e)
  })

  on('command.run', { command: 'agents' }, async $ => {
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
      timer ??= $.clock.every(1000, async () => {
        await update($, tick, n => n + 1)
        if (!(await read($, nodes)).some(n => n.status === 'running')) {
          timer?.cancel()
          timer = undefined
        }
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
    if (e.agentId !== undefined) {
      try {
        const endedAt = await $.clock.now()
        await update($, nodes, patch(e.agentId, { status: e.isAborted ? 'failed' : 'done', endedAt, currentTool: undefined }))
      } catch (err) {
        $.ui.log(`agent-tree: turn bookkeeping failed: ${String(err)}`, { to: 'debug' })
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    await read($, tick)
    const list = await read($, nodes)
    const now = await $.clock.now()
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
        const elbow = `<path d="M${px} ${Y(parent) + 8}V${cy}H${cx - 6}" fill="none" class="c" stroke-dasharray="3 3"${run ? '' : ' opacity="0.5"'}>${
          run ? '<animate attributeName="stroke-dashoffset" from="6" to="0" dur="1s" repeatCount="indefinite"/>' : ''
        }</path>`
        const mark = run
          ? `<circle cx="${cx}" cy="${cy}" r="4" fill="#639922"><animate attributeName="opacity" values="1;0.25;1" dur="1.2s" repeatCount="indefinite"/></circle>`
          : n.status === 'done'
            ? `<path d="M${cx - 4} ${cy}l3 3l5 -6" fill="none" stroke="#888780" stroke-width="1.8"/>`
            : `<path d="M${cx - 4} ${cy - 4}l8 8m0 -8l-8 8" fill="none" stroke="#E24B4A" stroke-width="1.8"/>`
        const pw = Math.round(n.type.length * 6.6 + 14)
        const pxl = X(depth) + 16
        const dx = pxl + pw + 8
        const tool = run && n.currentTool ? clip(n.currentTool, 18) : ''
        const room = W - 52 - dx - (tool ? tool.length * 6.3 + 8 : 0)
        return `<g${run ? '' : ' opacity="0.55"'}>${elbow}<g>${mark}<g class="${k}"><rect x="${pxl}" y="${cy - 10}" width="${pw}" height="20" rx="10" stroke-width="0.5"/><text x="${pxl + pw / 2}" y="${cy + 4}" text-anchor="middle" class="t" font-size="12.5">${esc(n.type)}</text></g><text x="${dx}" y="${cy + 5}" class="d">${esc(clip(n.description, Math.max(6, Math.floor(room / 7.2))))}</text>${tool ? `<text x="${W - 52}" y="${cy + 4}" text-anchor="end" class="s">${esc(tool)}</text>` : ''}<text x="${W - 8}" y="${cy + 4}" text-anchor="end" class="s">${mins(n)}</text></g></g>`
      })
      const total = (rows.length + 2) * H
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${total}" width="${W}" height="${total}" font-family="-apple-system, system-ui, sans-serif" font-size="14">` +
        `<style>.o rect{fill:#CECBF6;stroke:#534AB7}.o .t{fill:#3C3489}.s rect{fill:#9FE1CB;stroke:#0F6E56}.s .t{fill:#085041}.m{fill:#534AB7}` +
        `.h rect{fill:#FAC775;stroke:#BA7517}.h .t{fill:#633806}.g rect{fill:#F1EFE8;stroke:#5F5E5A}.g .t{fill:#444441}` +
        `.c{stroke:#B4B2A9}text.d{fill:#2C2C2A}text.s{fill:#5F5E5A;font-size:12.5px}` +
        `@media (prefers-color-scheme:dark){.o rect{fill:#3C3489;stroke:#AFA9EC}.o .t{fill:#CECBF6}.s rect{fill:#085041;stroke:#5DCAA5}.s .t{fill:#9FE1CB}` +
        `.h rect{fill:#633806;stroke:#EF9F27}.h .t{fill:#FAC775}.m{fill:#AFA9EC}.g rect{fill:#444441;stroke:#B4B2A9}.g .t{fill:#D3D1C7}.c{stroke:#5F5E5A}text.d{fill:#D3D1C7}text.s{fill:#B4B2A9}}</style>` +
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
              <Text color={color(n)}>{n.type}</Text> {clip(n.description, 40)}{n.model ? ` [${n.model}]` : ''} {time(n)}{tool}
            </Text>
          )
        })}
      </Box>
    )
  })
}
