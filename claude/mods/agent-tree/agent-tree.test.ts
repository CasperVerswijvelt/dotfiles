import { expect, mock, test } from 'claude-code/testing'

import { buildTierMap, fmtDuration, hasForYou, parseAgentModel, parseJudgeHeader, parsePhase, register } from './hooks/register'

const spawn = (description: string, parentAgentId?: string) =>
  ({ prompt: 'p', description, subagentType: 'my-implementer', parentAgentId }) as never

async function setup(_$: unknown, on: any) {
  onTool = undefined
  armed = false
  let inRead = false
  on('state.get', async (_: unknown, e: any, next: any) => {
    const r = await next(e)
    if (armed && !inRead && JSON.stringify(e).includes('"nodes"')) {
      armed = false
      inRead = true
      await spawnLate?.()
      inRead = false
    }
    return r
  })
  failState = false
  ticks = 0
  const clock = mock.clock(on)
  let n = 0
  on('agent.spawn', (_: unknown, e: any) => ({ model: models[e.description] ?? 'sonnet', agentId: e.resume?.agentId ?? `a${++n}` }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }) as never)
  on('state.set', (_: unknown, e: any, next: any) => { if (failState) throw new Error('boom'); if (JSON.stringify(e).includes('"tick"')) ticks++; return next(e) })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('tool.call', async () => {
    await onTool?.()
    return { result: { text: '', isError: false } } as never
  })
  return clock
}
const models: Record<string, string> = {}
let failState = false
let ticks = 0
let armed = false
let spawnLate: (() => Promise<unknown>) | undefined
let onTool: (() => Promise<void>) | undefined

test('nested spawns render as a tree on both surfaces, with tool and done state', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('outer'))
  await $.agent.spawn(spawn('inner task', 'a1'))
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a2', tool_use_id: 't1' } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'agent-tree', surface, component: 'Pane', props: {} as never, requestId: 'agent-tree' })
    if (surface === 'desktop') {
      expect((await ui.find({ type: 'Text', text: /inner task/ }))?.text).toBe('inner task')
    } else {
      expect((await ui.find({ type: 'Text', text: /Main/ }))?.text).toBeDefined()
      expect((await ui.find({ type: 'Text', text: /outer|worker/ }))?.text).toMatch(/^\s└─ ● my-implementer outer/)
      expect((await ui.find({ type: 'Text', text: /inner task/ }))?.text).toMatch(/^\s{3}└─ ● my-implementer inner task/)
    }
    await ui.unmount()
  }

  await $.turn.complete({ agentId: 'a2', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  const ui = await $.ui.mount({ plugin: 'agent-tree', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'agent-tree' })
  expect((await ui.find({ type: 'Text', text: /inner task/ }))?.text).toMatch(/✓/)
  expect((await ui.find({ type: 'Text', text: /outer|worker/ }))?.text).toMatch(/●/)
  await ui.unmount()
})

const mount = async ($: any, surface: 'terminal' | 'desktop', props: object = {}) =>
  $.ui.mount({ plugin: 'agent-tree', surface, component: 'Pane', props: props as never, requestId: 'agent-tree' })
type El = { type: string; props: Record<string, any>; children: unknown[] }
// The desktop tree as plain data, root Box first.
const desk = async ($: any, props: object = {}): Promise<El> => {
  const ui = await mount($, 'desktop', props)
  const root = await ui.find({ type: 'Box' })
  await ui.unmount()
  return root
}
const kids = (e: El): El[] => (e.children ?? []).filter((c): c is El => typeof c === 'object' && c !== null)
const all = (e: El): El[] => [e, ...kids(e).flatMap(all)]
const shown = (e: unknown): string =>
  typeof e === 'string' ? e : e && typeof e === 'object' ? ((e as El).children ?? []).map(shown).join('') : ''
const texts = (root: El) => all(root).filter(e => e.type === 'Text')
const textOf = (root: El, re: RegExp) => texts(root).find(e => re.test(shown(e)))
const say = (root: El) => texts(root).map(e => shown(e).trim())
const row = async (ui: any, d: string) => ui.find({ type: 'Text', text: new RegExp(d) })
const FILL = { o: '#CECBF6', s: '#9FE1CB', h: '#FAC775' }

test('desktop pane: one row per agent, done rows dimmed with tier colour', async ($, on) => {
  await setup($, on)
  Object.assign(models, { boss: 'opus', fast: 'haiku' })
  await $.agent.spawn(spawn('boss'))
  await $.agent.spawn(spawn('worker', 'a1'))
  await $.agent.spawn(spawn('fast', 'a1'))
  await $.agent.spawn(spawn('finished', 'a1'))
  await $.turn.complete({ agentId: 'a4', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  const root = await desk($)
  expect(all(root).filter(e => e.type === 'Box' && /^a\d+$/.test(e.props.key ?? ''))).toHaveLength(4)
  const chips = texts(root).filter(e => shown(e).includes('my-implementer'))
  expect(chips.map(e => e.props.backgroundColor)).toEqual([FILL.o, FILL.s, FILL.h, undefined])
  // The done row drops the fill and keeps the tier colour, dimmed.
  expect(chips[3]!.props.color).toBe('#1D9E75')
  expect(chips[3]!.props.dimColor).toBe(true)
  expect(textOf(root, /^finished$/)?.props.dimColor).toBe(true)
  expect(textOf(root, /^worker$/)?.props.dimColor).toBeFalsy()
  expect(say(root)).toContain('Haiku')
  expect(shown(root)).not.toContain('[sonnet]')
})

test('descriptions show verbatim on the desktop pane', async ($, on) => {
  await setup($, on)
  const d = '<script>alert(1)</script> & "x"'
  await $.agent.spawn(spawn(d))
  expect(shown(textOf(await desk($), /<script>/))).toBe(d)
})

test('the desktop pane is native elements, not an image', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  const ui = await mount($, 'desktop')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('desktop pane fills the sidebar width', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await $.agent.spawn(spawn('child', 'a1'))
  const narrow = await desk($, { bodyColumns: 30 })
  const wide = await desk($, { bodyColumns: 80 })
  expect(narrow.props.width).toBe('100%')
  // Only the tree lines have a fixed size: cells in ch, bars in fractions of a ch.
  expect(all(narrow).filter(e => typeof e.props.width === 'number' && e.props.width !== 2 && e.props.width !== 0.14)).toEqual([])
  expect(JSON.stringify(narrow)).toBe(JSON.stringify(wide))
})

const LONG = 'Implement the sidebar width fix so that the agents panel fills the whole pane and relays out when widened by hand ok yes'
const spawnLong = async ($: any, on: any, surface: 'terminal' | 'desktop', propsList: object[] = [{}]) => {
  await setup($, on)
  expect(LONG).toHaveLength(120)
  await $.agent.spawn(spawn(LONG))
  const seen: El[] = []
  onTool = async () => {
    for (const props of propsList) {
      const ui = await mount($, surface, props)
      seen.push(await ui.find({ type: 'Box' }))
      await ui.unmount()
    }
  }
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1', tool_use_id: 't' } as never)
  return seen
}

test('running agent shows its action on its own line under the description', async ($, on) => {
  const [root] = await spawnLong($, on, 'desktop') as [El]
  const desc = textOf(root, /^Implement the sidebar/)!
  expect(shown(desc)).toBe(LONG)
  expect(desc.props.wrap).toBe('truncate-end')
  const tool = textOf(root, /npm test/)!
  expect(tool.props.wrap).toBe('truncate-end')
  expect(shown(tool)).toBe('Bash npm test')
  expect(shown(desc)).not.toContain('npm test')
  // The action sits in the slot under line 1, not inside the description column.
  const slot = all(root).find(e => all(e).includes(tool) && e.props.height === 0.5)!
  const rest = all(root).find(e => kids(e).includes(slot))!
  expect(rest.props.flexDirection).toBe('column')
  expect(kids(rest).indexOf(slot)).toBe(1)
  expect(all(kids(rest)[0]!)).toContain(desc)
})

test('a row has the same height with and without an action', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('busy'))
  await $.agent.spawn(spawn('idle'))
  await $.agent.spawn(spawn('finished'))
  await $.turn.complete({ agentId: 'a3', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  let root!: El
  onTool = async () => { root = await desk($) }
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1', tool_use_id: 't' } as never)
  const rest = (key: string) => parts(all(root).find(e => e.props.key === key)!).rest
  const slotOf = (key: string) => kids(rest(key))[1]!
  const busy = slotOf('a1')
  // Exactly the old bottom padding (half a line): the action overflows it, so the row total is the same in every state.
  expect(busy.props.height).toBe(0.5)
  expect(busy.props.flexShrink).toBe(0)
  expect(busy.props.overflow).toBe('visible')
  expect(shown(busy)).toBe('Bash ls')
  // Idle and done rows get the same fixed slot, empty.
  for (const k of ['a2', 'a3']) {
    expect(slotOf(k).props).toEqual(busy.props)
    expect(shown(slotOf(k))).toBe('')
  }
  // Nothing else adds height: the content is exactly line 1 and the slot, with the same padding, in every state.
  for (const k of ['a1', 'a2', 'a3']) {
    expect(kids(rest(k))).toHaveLength(2)
    expect(rest(k).props).toEqual(rest('a1').props)
  }
  // Line 1 is unchanged by the action.
  const line1 = (k: string) => kids(rest(k))[0]!
  expect(texts(line1('a1')).map(e => e.props.size)).toEqual(texts(line1('a2')).map(e => e.props.size))
  expect(line1('a1').props).toEqual(line1('a2').props)
})

test('the action sits in the row spacing under the name chip', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('top'))
  await $.agent.spawn(spawn('child', 'a1'))
  let root!: El
  onTool = async () => { root = await desk($) }
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a2', tool_use_id: 't' } as never)
  const row = all(root).find(e => e.props.key === 'a2')!
  const { connector, mark, rest } = parts(row)
  const [line1, slot] = kids(rest)
  // The slot replaces the bottom padding: only the top padding remains, so line 1 sits where it always did.
  expect(rest.props.flexDirection).toBe('column')
  expect(rest.props.paddingTop).toBe(1)
  expect(rest.props.paddingY).toBeUndefined()
  expect(rest.props.paddingBottom).toBeUndefined()
  expect(rest.props.paddingLeft).toBeUndefined()
  expect(slot!.props.height).toBe(0.5)
  expect(slot!.props.overflow).toBe('visible')
  // The action's wrapper cannot shrink, so the overflow paints instead of clipping.
  const wrap = kids(slot!)[0]!
  expect(wrap.props.flexShrink).toBe(0)
  const action = kids(wrap)[0]!
  expect(shown(action)).toBe('Bash ls')
  // At the content's left edge, like line 1: no indent box, padding or margin.
  for (const e of [line1!, slot!, wrap, action]) {
    expect(e.props.paddingLeft).toBeUndefined()
    expect(e.props.marginLeft).toBeUndefined()
  }
  expect(shown(action)).not.toMatch(/^\s/)
  expect(action.props).toMatchObject({ size: 'caption', dimColor: true, wrap: 'truncate-end' })
  // Line 1 starts with the name chip.
  expect(shown(texts(line1!)[0]!)).toMatch(/my-implementer/)
  expect(kids(kids(line1!)[0]!)[0]).toBeDefined()
  // The connector still spans the slot: it is a sibling of the whole content, with a growing lower bar.
  expect(connector.props.height).toBeUndefined()
  expect(kids(kids(connector).at(-1)!)[1]!.props.flexGrow).toBe(1)
  expect(row.props.alignItems).toBeUndefined()
  // The parent bar runs down the mark column to the row's bottom.
  expect(mark.props.flexDirection).toBe('column')
})

test('terminal shows the action on its own line', async ($, on) => {
  const [root, plain] = await spawnLong($, on, 'terminal', [{ bodyColumns: 200 }, {}]) as [El, El]
  const desc = textOf(root, /Implement the sidebar/)!
  expect(shown(desc)).toContain(LONG)
  expect(shown(desc)).not.toContain('npm test')
  const tool = textOf(root, /npm test/)!
  expect(tool).not.toBe(desc)
  const col = all(root).find(e => kids(e).includes(desc))!
  expect(kids(col).indexOf(tool)).toBe(kids(col).indexOf(desc) + 1)
  expect(shown(textOf(plain, /Implement the sidebar/)!)).not.toContain(LONG)
  expect(shown(textOf(plain, /Implement the sidebar/)!)).toContain('~')
})

test('empty pane keeps the empty text and the legend on separate rows', async ($, on) => {
  await setup($, on)
  const root = await desk($)
  expect(root.props.flexDirection).toBe('column')
  const rows = kids(root)
  const empty = rows.findIndex(r => /No agents yet/.test(shown(r)))
  const legend = rows.findIndex(r => /Opus/.test(shown(r)))
  expect(empty).toBeGreaterThanOrEqual(0)
  expect(legend).toBeGreaterThan(empty)
  expect(say(rows[legend]! as El)).toEqual(['Opus', 'Sonnet', 'Haiku'])
})

// Padding units are half a line on desktop, so 2 is one full line (19.5px at 13px). It is the only spacing change.
const legendGap = async ($: any, withAgents: boolean) => {
  const root = await desk($)
  const rows = kids(root)
  const legend = rows.find(r => /Opus/.test(shown(r)))!
  expect(legend.props.paddingTop).toBe(2)
  expect(legend.props.padding).toBeUndefined()
  expect(legend.props.paddingY).toBeUndefined()
  expect(legend.props.marginTop).toBeUndefined()
  expect(legend.props.gap).toBe(2)
  expect(root.props.gap).toBe(1)
  expect(rows.some(r => /No agents yet/.test(shown(r)))).toBe(!withAgents)
}

test('the legend sits one line below the last row, with agents', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await legendGap($, true)
})

test('the legend sits one line below the last row, empty state', async ($, on) => {
  await setup($, on)
  await legendGap($, false)
})

test('tool.call still returns next result when the mod bookkeeping throws', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  failState = true
  const r = await $.tool.call({ tool: 'Bash', agentId: 'a1', tool_use_id: 't' } as never)
  expect(r).toEqual({ result: { text: '', isError: false } })
})

test('tool.call shows the current tool while it runs', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  let seen = ''
  onTool = async () => {
    const ui = await $.ui.mount({ plugin: 'agent-tree', surface: 'terminal', component: 'Pane', props: {} as never, requestId: 'agent-tree' })
    seen = (await ui.find({ type: 'Text', text: /Edit GroupStore/ }))?.text ?? ''
    await ui.unmount()
  }
  await $.tool.call({ tool: 'Edit', file_path: '/x/GroupStore.swift', agentId: 'a1', tool_use_id: 't' } as never)
  expect(seen).toMatch(/Edit GroupStore\.swift/)
  expect(seen).not.toMatch(/worker/)
})

test('a clock tick that changes no displayed value leaves the tree unchanged', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await clock.advance(1000)
  const before = JSON.stringify(await desk($))
  await $.turn.complete({ agentId: 'a1', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  const done = JSON.stringify(await desk($))
  expect(done).not.toBe(before)
  await clock.advance(1000)
  await clock.advance(60_000)
  expect(JSON.stringify(await desk($))).toBe(done)
})

test('the clock ticks every second only while an agent runs', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await clock.advance(5000)
  expect(ticks).toBe(5)
  await $.turn.complete({ agentId: 'a1', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await clock.advance(1000)
  const stopped = ticks
  await clock.advance(10_000)
  expect(ticks).toBe(stopped)
  await $.agent.spawn(resume('a1'))
  await clock.advance(2000)
  expect(ticks).toBe(stopped + 2)
})

test('a spawn while the tick is stopping keeps the tick alive', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('first'))
  await $.turn.complete({ agentId: 'a1', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  // The next tick's stop reads "none running"; a spawn lands before that read resumes.
  spawnLate = () => $.agent.spawn(spawn('second'))
  armed = true
  await clock.advance(1000)
  const before = ticks
  await clock.advance(3000)
  expect(ticks).toBe(before + 3)
})

test('a running agent\'s seconds advance on the tick', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  expect(textOf(await desk($), /^0s$/)).toBeDefined()
  await clock.advance(1000)
  expect(textOf(await desk($), /^1s$/)).toBeDefined()
  await clock.advance(11_000)
  expect(textOf(await desk($), /^12s$/)).toBeDefined()
})

test('duration format boundaries', () => {
  const at = (m: number, s = 0) => fmtDuration((m * 60 + s) * 1000)
  expect(fmtDuration(0)).toBe('0s')
  expect(at(0, 59)).toBe('59s')
  expect(at(1)).toBe('1m')
  expect(at(59, 59)).toBe('59m')
  expect(at(60)).toBe('1h 0m')
  expect(at(65)).toBe('1h 5m')
  expect(at(119, 59)).toBe('1h 59m')
  expect(at(10 * 60 + 5)).toBe('10h 5m')
  expect(fmtDuration(-5000)).toBe('0s')
})

test('the time column keeps a minimum width so a changing value moves nothing', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  const t = textOf(await desk($), /^0s$/)
  expect(t?.props.tabular).toBe(true)
  const wrap = all(await desk($)).find(e => e.type === 'Box' && e.props.minWidth === 7 && JSON.stringify(e).includes('"0s"'))
  expect(wrap).toBeDefined()
})

test('turn.complete still returns next result when the mod bookkeeping throws', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  failState = true
  const r = await $.turn.complete({ agentId: 'a1', answer: 'hi', durationMs: 1, isAborted: false, turnId: 't' } as never)
  expect(r).toEqual({ text: 'hi' })
})

test('a spawn result with no model for my-scout gets the Haiku colour', async ($, on) => {
  await setup($, on)
  models.look = ''
  await $.agent.spawn({ prompt: 'p', description: 'look', subagentType: 'my-scout' } as never)
  delete models.look
  expect(textOf(await desk($), /my-scout/)?.props.backgroundColor).toBe(FILL.h)
})

test('a throwing tool call clears currentTool and rethrows', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  onTool = async () => { throw new Error('tool failed') }
  await expect($.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1', tool_use_id: 't' } as never)).rejects.toThrow()
  onTool = undefined
  const ui = await mount($, 'terminal')
  expect((await row(ui, 'worker'))?.text).not.toMatch(/Bash/)
  await ui.unmount()
})

test('status glyphs', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('running one'))
  await $.agent.spawn(spawn('done one'))
  await $.agent.spawn(spawn('failed one'))
  await $.turn.complete({ agentId: 'a2', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await $.turn.complete({ agentId: 'a3', answer: '', durationMs: 1, isAborted: true, turnId: 't' } as never)
  const root = await desk($)
  expect(textOf(root, /^●$/)?.props.color).toBe('#1D9E75')
  expect(textOf(root, /^✓$/)?.props.color).toBe('#888780')
  expect(textOf(root, /^✗$/)?.props.color).toBe('#E24B4A')
})

test('elapsed time', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await clock.advance(59_000)
  expect(textOf(await desk($), /^59s$/)).toBeDefined()
  await clock.advance(1000)
  expect(textOf(await desk($), /^1m$/)).toBeDefined()
  await clock.advance(139_000)
  expect(JSON.stringify(await desk($))).toContain('"3m"')
  await clock.advance(20_000)
  expect(JSON.stringify(await desk($))).toContain('"3m"')
  await clock.advance(57 * 60_000)
  expect(JSON.stringify(await desk($))).toContain('"1h 0m"')
})

test('command name', async ($, on) => {
  await setup($, on)
  const names: string[] = []
  on('command.register', (_: unknown, e: any) => { names.push(e.name); return { value: { command: e.name } } as never })
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  await $.session.start({ cwd: '/tmp' } as never)
  expect(names).toEqual(['agent-tree'])
})

test('agent frontmatter parsing', () => {
  expect(parseAgentModel('---\nname: a\nmodel: opus\n---\nbody')).toBe('opus')
  expect(parseAgentModel('---\nmodel: sonnet\n---\n')).toBe('sonnet')
  expect(parseAgentModel('---\nmodel: haiku\n---\n')).toBe('haiku')
  expect(parseAgentModel('---\nmodel: "Opus"\n---\n')).toBe('opus')
  expect(parseAgentModel("---\nmodel: 'haiku'\n---\n")).toBe('haiku')
  expect(parseAgentModel('no frontmatter\nmodel: opus')).toBeUndefined()
  expect(parseAgentModel('---\nname: a\n---\nmodel: opus')).toBeUndefined()
  const map = buildTierMap([
    { name: 'my-scout.md', text: '---\nmodel: haiku\n---\n' },
    { name: 'file.md', text: '---\nname: renamed\nmodel: opus\n---\n' },
    { name: 'none.md', text: 'plain' },
  ])
  expect(map).toEqual({ 'my-scout': 'haiku', renamed: 'opus' })
})

test('tier map from agents folder', async ($, on) => {
  await setup($, on)
  on('env.get', () => ({ value: '/home/x' }) as never)
  on('fs.list', (_: unknown, e: any) => ({ value: e.path === '/home/x/.claude/agents' ? [{ name: 'custom-agent.md', kind: 'other', size: 0, mtimeMs: 0, isLink: true }] : [] }) as never)
  on('fs.read', () => ({ value: '---\nmodel: haiku\n---\n' }) as never)
  on('session.start', () => ({ cwd: '/tmp' }) as never)
  await $.session.start({ cwd: '/tmp' } as never)
  models.look = ''
  await $.agent.spawn({ prompt: 'p', description: 'look', subagentType: 'custom-agent' } as never)
  delete models.look
  expect(textOf(await desk($), /custom-agent/)?.props.backgroundColor).toBe(FILL.h)
})

test('phase parsing', () => {
  expect(parsePhase('review: x')).toBe('review')
  expect(parsePhase('Review:x')).toBe('review')
  expect(parsePhase('  GATE : full')).toBe('gate')
  expect(parsePhase('implement: task 2')).toBe('implement')
  expect(parsePhase('fix the bug')).toBeUndefined()
  expect(parsePhase('deploy: x')).toBeUndefined()
  expect(parsePhase('review')).toBeUndefined()
})

test('orchestrator phase label', async ($, on) => {
  await setup($, on)
  await $.agent.spawn({ prompt: 'p', description: 'the plan', subagentType: 'my-orchestrator' } as never)
  await $.agent.spawn(spawn('implement: a', 'a1'))
  await $.agent.spawn(spawn('review: b', 'a1'))
  const ui = await mount($, 'terminal')
  expect((await row(ui, 'the plan'))?.text).toMatch(/my-orchestrator review .*the plan/)
  await ui.unmount()
  expect(textOf(await desk($), /^review$/)?.props.italic).toBe(true)
  await $.turn.complete({ agentId: 'a3', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  const ui2 = await mount($, 'terminal')
  expect((await row(ui2, 'the plan'))?.text).toMatch(/my-orchestrator implement .*the plan/)
  await ui2.unmount()
  expect(textOf(await desk($), /^implement$/)?.props.italic).toBe(true)
})

const spawnAs = (type: string, description: string, parentAgentId?: string) =>
  ({ prompt: 'p', description, subagentType: type, parentAgentId }) as never
const finish = ($: any, agentId: string, answer: string) =>
  $.turn.complete({ agentId, answer, durationMs: 1, isAborted: false, turnId: 't' } as never)

test('judge header parsing', () => {
  expect(parseJudgeHeader('feat/x [A-] round 1\nbody')).toEqual({ grade: 'A-', round: 1 })
  expect(parseJudgeHeader('PR 12 [F] round 1')).toEqual({ grade: 'F', round: 1 })
  expect(parseJudgeHeader('feat/y [B] round 2')).toEqual({ grade: 'B', round: 2 })
  expect(parseJudgeHeader('feat/x [E] round 1')).toBeUndefined()
  expect(parseJudgeHeader('no header here')).toBeUndefined()
  expect(parseJudgeHeader('\n\n`feat/x [C] round 2`\nmore')).toEqual({ grade: 'C', round: 2 })
  expect(parseJudgeHeader('```\nfeat/x [C] round 2\n```')).toEqual({ grade: 'C', round: 2 })
  expect(parseJudgeHeader('Done.\n\nx [B] round 1')).toBeUndefined()
  expect(parseJudgeHeader('**feat/x [D] round 1**')).toEqual({ grade: 'D', round: 1 })
})

test('review chip on orchestrator', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await $.agent.spawn(spawnAs('my-reviewer', 'review: correctness', 'a1'))
  await finish($, 'a2', 'feat/x [B] round 1\nok')
  const ui = await mount($, 'terminal')
  expect((await row(ui, 'the plan'))?.text).toContain('B \u00B7 r1')
  await ui.unmount()
  expect(say(await desk($))).toContain('B \u00B7 r1')
  await $.agent.spawn(spawnAs('my-reviewer', 'review: tests', 'a1'))
  await finish($, 'a3', 'feat/x [F] round 2')
  const root = await desk($)
  expect(say(root)).toContain('F \u00B7 r2')
  expect(say(root)).not.toContain('B \u00B7 r1')
  expect(textOf(root, /F \u00B7 r2/)?.props.backgroundColor).toBe('#E24B4A')
})

test('quoted header leaves chip', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await $.agent.spawn(spawnAs('my-reviewer', 'review: correctness', 'a1'))
  await finish($, 'a2', 'feat/x [B] round 1\nok')
  await $.agent.spawn(spawnAs('my-reviewer', 'review: tests', 'a1'))
  await finish($, 'a3', 'Found one issue.\n\nThe judge wrote:\nfeat/x [F] round 2')
  const root = await desk($)
  expect(say(root)).toContain('B \u00B7 r1')
  expect(say(root)).not.toContain('F \u00B7 r2')
})

test('for you detection', () => {
  expect(hasForYou('report\n\u26A0\uFE0F For you: decide X')).toBe(true)
  expect(hasForYou('report\nFor you: decide X')).toBe(true)
  expect(hasForYou('**\u26A0\uFE0F For you:** decide X')).toBe(true)
  expect(hasForYou('`For you`: decide X')).toBe(true)
  expect(hasForYou('Done. This is for you: a thing. Also For you: x')).toBe(false)
  expect(hasForYou('nothing needed for you here')).toBe(false)
  expect(hasForYou('')).toBe(false)
})

test('needs you flag', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await finish($, 'a1', 'Done\n\u26A0\uFE0F For you: pick one')
  const ui = await mount($, 'terminal')
  expect((await row(ui, 'the plan'))?.text).toContain('needs you')
  await ui.unmount()
  expect(say(await desk($))).toContain('needs you')
  await finish($, 'a1', 'Done, nothing open')
  expect(shown(await desk($))).not.toContain('needs you')
})

test('narrow row keeps room for the description', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await $.agent.spawn(spawnAs('my-reviewer', 'review: correctness', 'a1'))
  await finish($, 'a2', 'feat/x [B] round 1')
  await $.agent.spawn(spawnAs('my-implementer', 'implement: x', 'a1'))
  await $.agent.spawn(spawnAs('my-orchestrator', 'second'))
  await finish($, 'a4', 'Done\n⚠️ For you: pick')
  const root = await desk($)
  const rowBox = all(root).find(e => e.props.key === 'a1')!
  const [chips, body, phaseBox, dur] = kids(kids(kids(kids(rowBox)[1]!)[1]!)[0]!)
  expect(chips!.props.flexWrap).toBe('wrap')
  expect(chips!.props.flexShrink).not.toBe(0)
  const head = kids(chips!)[0]!
  expect(head.props.flexShrink).not.toBe(0)
  expect(textOf(head, /my-orchestrator/)!.props.wrap).toBe('truncate-end')
  expect(body!.props.minWidth).toBeGreaterThanOrEqual(12)
  expect(textOf(phaseBox!, /^implement$/)!.props.wrap).toBe('truncate-end')
  expect(phaseBox!.props.flexShrink).not.toBe(0)
  // Only the duration stays fixed.
  expect(shown(dur!)).toMatch(/^\d+s$/)
  expect(dur!.props.flexShrink).toBe(0)
  expect(rowBox.props.width).toBe('100%')
  expect(shown(chips!)).toContain('B · r1')
})

test('legend row wraps at narrow widths', async ($, on) => {
  await setup($, on)
  const root = await desk($)
  const legend = kids(root).find(r => /Opus/.test(shown(r)))!
  expect(legend.props.flexWrap).toBe('wrap')
})

test('multi-line command shows on one action line', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  const cmd = "cat <<'EOF'\n  line one\n\n\tline two\nEOF"
  const seen: Record<string, El> = {}
  onTool = async () => {
    for (const surface of ['desktop', 'terminal'] as const) {
      const ui = await mount($, surface, { bodyColumns: 200 })
      seen[surface] = await ui.find({ type: 'Box' })
      await ui.unmount()
    }
  }
  await $.tool.call({ tool: 'Bash', command: cmd, agentId: 'a1', tool_use_id: 't' } as never)
  for (const root of Object.values(seen)) {
    const tool = textOf(root, /cat <</)!
    expect(shown(tool).trim()).not.toMatch(/\s{2}|[\n\t]/)
    expect(shown(tool)).toContain("Bash cat <<'EOF' line one line two EOF")
  }
})

test('terminal row never exceeds bodyColumns', async ($, on) => {
  await setup($, on)
  let parent: string | undefined
  for (let i = 1; i <= 8; i++) {
    await $.agent.spawn(spawn(`${i === 8 ? LONG : 'level'} ${i}`, parent))
    parent = `a${i}`
  }
  await finish($, 'a1', '')
  const ui = await mount($, 'terminal', { bodyColumns: 40 })
  const root = await ui.find({ type: 'Box' })
  await ui.unmount()
  const rows = all(root).filter(e => /^a\d+$/.test(e.props?.key ?? '')).map(b => texts(b)[0]!)
  expect(rows).toHaveLength(8)
  for (const r of rows) expect(r.props.wrap).toBe('truncate-end')
  // Where the fixed part fits, the description is clipped so the row fits too.
  expect(shown(rows[0]!).length).toBeLessThanOrEqual(40)
  const shallow = await mount($, 'terminal', { bodyColumns: 60 })
  const sroot = await shallow.find({ type: 'Box' })
  await shallow.unmount()
  expect(shown(texts(sroot).find(e => /level 2/.test(shown(e)))!).length).toBeLessThanOrEqual(60)
})

test('done and failed rows recede as a whole on desktop', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await $.agent.spawn(spawnAs('my-reviewer', 'review: x', 'a1'))
  await finish($, 'a2', 'feat/x [F] round 1')
  await $.agent.spawn(spawn('worker', 'a1'))
  await $.turn.complete({ agentId: 'a3', answer: '', durationMs: 1, isAborted: true, turnId: 't' } as never)
  await finish($, 'a1', 'Done\n⚠️ For you: pick')
  const root = await desk($)
  for (const key of ['a1', 'a2', 'a3']) {
    const r = all(root).find(e => e.props.key === key)!
    const ts = texts(r)
    expect(ts.length).toBeGreaterThan(0)
    for (const t of ts) {
      if (/F · r1|needs you/.test(shown(t))) continue
      expect(t.props.dimColor).toBe(true)
      expect(t.props.backgroundColor).toBeUndefined()
    }
  }
  expect(textOf(root, /my-orchestrator/)?.props.color).toBe('#1D9E75')
})

test('done rows keep the grade and needs-you chips readable', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawnAs('my-orchestrator', 'the plan'))
  await $.agent.spawn(spawnAs('my-reviewer', 'review: x', 'a1'))
  await finish($, 'a2', 'feat/x [F] round 1')
  await finish($, 'a1', 'Done\n⚠️ For you: pick')
  const root = await desk($)
  const grade = textOf(root, /F · r1/)!
  const needs = textOf(root, /needs you/)!
  expect(grade.props).toMatchObject({ backgroundColor: '#E24B4A', color: '#FFFFFF' })
  expect(needs.props).toMatchObject({ backgroundColor: '#EF9F27', color: '#412402' })
  expect(grade.props.dimColor).toBeUndefined()
  expect(needs.props.dimColor).toBeUndefined()
  expect(textOf(root, /my-orchestrator/)?.props.dimColor).toBe(true)
  expect(textOf(root, /the plan/)?.props.dimColor).toBe(true)
})

// Code points Anthropic Mono (the app's mono face) contains, checked with fontTools: space, box-drawing, marks.
const FACE = new Set([0x20, 0x2500, 0x2502, 0x2514, 0x25cf, 0x2713, 0x2717])
const BAR = 0.14
const ARM = 0.05
const CELL = 2
const bars = (e: El) => all(e).filter(x => x.type === 'Box' && x.props.width === BAR && x.props.backgroundColor)
const arms = (e: El) => all(e).filter(x => x.type === 'Box' && x.props.height === ARM && x.props.backgroundColor)

// The row's connector and content boxes.
const parts = (row: El) => {
  const [connector, content] = kids(row)
  return { connector: connector!, content: content!, mark: kids(content!)[0]!, rest: kids(content!)[1]! }
}

test('child trunk aligns with the parent connector', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('top'))
  await $.agent.spawn(spawn('mid one', 'a1'))
  await $.agent.spawn(spawn('mid two', 'a1'))
  await $.agent.spawn(spawn('deep', 'a2'))
  await $.agent.spawn(spawn('other top'))
  const seen: Record<string, El> = {}
  for (const id of ['a2', 'a4']) {
    onTool = async () => { seen[id] = await desk($) }
    await $.tool.call({ tool: 'Bash', command: 'ls', agentId: id, tool_use_id: 't' } as never)
  }
  const rowIn = (root: El, key: string) => all(root).find(e => e.props.key === key)!
  // The rows sit in one Box with no gap: the connector column is never interrupted.
  const list = all(seen.a4!).find(e => kids(e).includes(rowIn(seen.a4!, 'a1')))!
  expect(list.props.gap).toBeUndefined()
  // Per row: cells of one fixed width per depth, then which cells carry a trunk bar, an arm, a lower bar.
  const shape = (root: El, key: string) => {
    const row = rowIn(root, key)
    expect(row.props.alignItems).toBeUndefined()
    const { connector, rest } = parts(row)
    expect(connector.props.gap).toBeUndefined()
    // No fixed height: the connector stretches with the row, action line included.
    expect(connector.props.height).toBeUndefined()
    expect(connector.props.alignItems).toBeUndefined()
    // Vertical spacing lives inside the content, never between connector rows.
    expect(rest.props.paddingTop).toBe(1)
    expect(row.props.padding).toBeUndefined()
    const cells = kids(connector)
    const own = cells[cells.length - 1]!
    // Open ancestors: a trunk bar over the whole cell height.
    for (const cell of cells.slice(0, -1)) expect(cell.props.flexDirection).toBe('row')
    // The node itself: a first line the height of one line, the bar down to its middle with the arm across at the bottom of it,
    // then a lower bar that grows with the row (through the action line) unless this is the last child.
    const [first, lower] = kids(own)
    expect(first!.props.height).toBe(1)
    expect(first!.props.flexShrink).toBe(0)
    const [top, armCol] = kids(first!)
    expect(top!.props.width).toBe(BAR)
    expect(armCol!.props.justifyContent).toBe('flex-end')
    expect(kids(armCol!)[0]!.props.height).toBe(ARM)
    expect(lower!.props.flexGrow).toBe(1)
    expect(bars(lower!)).toHaveLength(bars(own).length === 2 ? 1 : 0)
    return cells.map(cell => {
      expect(cell.props.width).toBe(CELL)
      return { bars: bars(cell).length, arm: arms(cell).length }
    })
  }
  const trunk = { bars: 1, arm: 0 }
  const tee = { bars: 2, arm: 1 }
  const elbow = { bars: 1, arm: 1 }
  expect(shape(seen.a4!, 'a1')).toEqual([tee])
  expect(shape(seen.a4!, 'a2')).toEqual([trunk, tee])
  expect(shape(seen.a4!, 'a3')).toEqual([trunk, elbow])
  // The deep row, with the action line, keeps both open ancestors' trunks.
  expect(textOf(seen.a4!, /^Bash ls$/)).toBeDefined()
  expect(shape(seen.a4!, 'a4')).toEqual([trunk, trunk, elbow])
  expect(shape(seen.a4!, 'a5')).toEqual([elbow])
  // A tee row with an action line: its lower bar grows with the row.
  expect(textOf(seen.a2!, /^Bash ls$/)).toBeDefined()
  expect(shape(seen.a2!, 'a2')).toEqual([trunk, tee])
})

test('a parent\'s line reaches its first child', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('top'))
  await $.agent.spawn(spawn('child', 'a1'))
  await $.agent.spawn(spawn('grandchild', 'a2'))
  await $.agent.spawn(spawn('second top'))
  let root!: El
  onTool = async () => { root = await desk($) }
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a1', tool_use_id: 't' } as never)
  const row = (key: string) => all(root).find(e => e.props.key === key)!
  const topConn = parts(row('a1')).connector
  // The bar sits under the mark, in the column where the children's connector cells start.
  const lineOf = (key: string) => {
    const { content, mark, rest } = parts(row(key))
    expect(content.props.paddingY).toBeUndefined()
    expect(rest.props.paddingTop).toBe(1)
    expect(mark.props.flexDirection).toBe('column')
    const [markBox, line] = kids(mark)
    expect(texts(markBox!)).toHaveLength(1)
    return line
  }
  // A parent with children: a bar that grows to the bottom of its row, action line included.
  const topLine = lineOf('a1')!
  expect(topLine.props).toMatchObject({ width: BAR, flexGrow: 1, backgroundColor: '#888780' })
  expect(textOf(row('a1'), /^Bash ls$/)).toBeDefined()
  expect(lineOf('a2')!.props).toMatchObject({ width: BAR, flexGrow: 1 })
  // The content starts where the first child's own connector cell starts: one cell more than the parent's connector.
  expect(kids(parts(row('a2')).connector)).toHaveLength(kids(topConn).length + 1)
  expect(kids(parts(row('a3')).connector)).toHaveLength(kids(parts(row('a2')).connector).length + 1)
  // A row without children draws none.
  expect(lineOf('a3')).toBeUndefined()
  expect(lineOf('a4')).toBeUndefined()
})

test('no prefix or mark character outside the mono face coverage', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('top'))
  await $.agent.spawn(spawn('child', 'a1'))
  await $.agent.spawn(spawn('failed', 'a1'))
  await $.turn.complete({ agentId: 'a2', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await $.turn.complete({ agentId: 'a3', answer: '', durationMs: 1, isAborted: true, turnId: 't' } as never)
  let root!: El
  onTool = async () => { root = await desk($) }
  await $.tool.call({ tool: 'Bash', command: 'npm test', agentId: 'a1', tool_use_id: 't' } as never)
  const monos = texts(root).filter(t => t.props.mono === true)
  expect(monos.map(shown).sort()).toEqual(['●', '✓', '✗'])
  for (const t of monos) for (const ch of shown(t)) expect(FACE.has(ch.codePointAt(0)!)).toBe(true)
  // Everything else stays in the normal face: chips, descriptions, action text, time.
  for (const re of [/my-implementer/, /^top$/, /^child$/, /^failed$/, /npm test/, /^\d+s$/]) {
    const t = textOf(root, re)
    expect(t).toBeDefined()
    expect(t!.props.mono).toBeFalsy()
  }
  for (const t of texts(root).filter(t => !monos.includes(t))) expect(t.props.mono).toBeFalsy()
  // Glyphs the face lacks fall back to another font and shift: never drawn.
  expect(shown(root)).not.toMatch(/[├◐]/)
  // The marks keep their status colours (the parent is still running).
  expect(monos.map(t => t.props.color)).toEqual(['#1D9E75', '#888780', '#E24B4A'])
})

const resume = (agentId: string, description = '', parentAgentId?: string) =>
  ({ prompt: 'again', description, subagentType: 'my-orchestrator', parentAgentId, resume: { agentId } }) as never
const keyed = (root: El) => all(root).filter(e => e.type === 'Box' && /^a\d+$/.test(e.props.key ?? '')).map(e => e.props.key)

test('a resumed agent keeps one row', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn({ ...spawn('Layout fixes'), subagentType: 'my-orchestrator' } as never)
  await $.turn.complete({ agentId: 'a1', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await clock.advance(51 * 60_000)
  for (let i = 0; i < 3; i++) {
    await $.agent.spawn(resume('a1'))
    await $.turn.complete({ agentId: 'a1', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  }
  await $.agent.spawn(resume('a1'))
  const root = await desk($)
  expect(keyed(root)).toEqual(['a1'])
  // Back to running, description kept, elapsed counts from the resume.
  expect(textOf(root, /^●$/)).toBeDefined()
  expect(textOf(root, /^Layout fixes$/)).toBeDefined()
  expect(textOf(root, /^0s$/)).toBeDefined()
  await $.agent.spawn(resume('a1', 'New task'))
  expect(textOf(await desk($), /^New task$/)).toBeDefined()
})

test('an agent resumed between children lists every child once', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn({ ...spawn('boss'), subagentType: 'my-orchestrator' } as never)
  await $.agent.spawn(spawn('impl one', 'a1'))
  await $.agent.spawn({ ...spawn('bg review', 'a1'), background: true } as never)
  for (const id of ['a2', 'a3', 'a1']) await $.turn.complete({ agentId: id, answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await clock.advance(30 * 60_000)
  await $.agent.spawn(resume('a1'))
  await $.agent.spawn(spawn('review two', 'a1'))
  await $.agent.spawn({ ...spawn('bg impl', 'a1'), background: true } as never)
  await $.turn.complete({ agentId: 'a4', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  await $.agent.spawn(resume('a1'))
  await $.agent.spawn(spawn('review three', 'a1'))
  const root = await desk($)
  expect(keyed(root)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
  for (const d of ['impl one', 'bg review', 'review two', 'bg impl', 'review three']) {
    expect(texts(root).filter(t => shown(t) === d)).toHaveLength(1)
  }
})

test('a resumed agent drops its old grade chip', async ($, on) => {
  await setup($, on)
  await $.agent.spawn({ ...spawn('plan'), subagentType: 'my-orchestrator' } as never)
  await $.agent.spawn({ ...spawn('review: x', 'a1'), subagentType: 'my-reviewer' } as never)
  await finish($, 'a2', 'feat/x [A] round 1')
  await finish($, 'a1', 'Done')
  expect(textOf(await desk($), /A · r1/)).toBeDefined()
  await $.agent.spawn(resume('a1'))
  expect(textOf(await desk($), /A · r1/)).toBeUndefined()
})
