import { expect, mock, test } from 'claude-code/testing'

import { buildTierMap, hasForYou, parseAgentModel, parseJudgeHeader, parsePhase, register } from './hooks/register'

const spawn = (description: string, parentAgentId?: string) =>
  ({ prompt: 'p', description, subagentType: 'my-implementer', parentAgentId }) as never

async function setup(_$: unknown, on: any) {
  onTool = undefined
  failState = false
  const clock = mock.clock(on)
  let n = 0
  on('agent.spawn', (_: unknown, e: any) => ({ model: models[e.description] ?? 'sonnet', agentId: `a${++n}` }))
  on('turn.complete', (_: unknown, e: any) => ({ text: e.answer }) as never)
  on('state.set', (_: unknown, e: any, next: any) => { if (failState) throw new Error('boom'); return next(e) })
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('tool.call', async () => {
    await onTool?.()
    return { result: { text: '', isError: false } } as never
  })
  return clock
}
const models: Record<string, string> = {}
let failState = false
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
  expect(all(narrow).filter(e => typeof e.props.width === 'number')).toEqual([])
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
  const col = all(root).find(e => kids(e).includes(desc))!
  expect(kids(col).indexOf(tool)).toBe(kids(col).indexOf(desc) + 1)
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
  const before = JSON.stringify(await desk($))
  await clock.advance(1000)
  await clock.advance(1000)
  expect(JSON.stringify(await desk($))).toBe(before)
  await clock.advance(60_000)
  expect(JSON.stringify(await desk($))).not.toBe(before)
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
  expect(textOf(root, /^◐$/)?.props.color).toBe('#1D9E75')
  expect(textOf(root, /^✓$/)?.props.color).toBe('#888780')
  expect(textOf(root, /^✗$/)?.props.color).toBe('#E24B4A')
})

test('elapsed minutes', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  await clock.advance(59_000)
  expect(textOf(await desk($), /^<1m$/)).toBeDefined()
  await clock.advance(1000)
  expect(textOf(await desk($), /^1m$/)).toBeDefined()
  await clock.advance(139_000)
  const b = JSON.stringify(await desk($))
  expect(b).toContain('"3m"')
  await clock.advance(20_000)
  expect(JSON.stringify(await desk($))).toBe(b)
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
  const [, chips, body, phaseBox, dur] = kids(rowBox)
  expect(chips!.props.flexWrap).toBe('wrap')
  expect(chips!.props.flexShrink).not.toBe(0)
  const head = kids(chips!)[0]!
  expect(head.props.flexShrink).not.toBe(0)
  expect(textOf(head, /my-orchestrator/)!.props.wrap).toBe('truncate-end')
  expect(body!.props.minWidth).toBeGreaterThanOrEqual(12)
  expect(textOf(phaseBox!, /^implement$/)!.props.wrap).toBe('truncate-end')
  expect(phaseBox!.props.flexShrink).not.toBe(0)
  // Only the duration stays fixed.
  expect(shown(dur!)).toMatch(/^<?\d+m$/)
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

test('nested agents draw tree connectors on desktop', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('outer'))
  await $.agent.spawn(spawn('inner one', 'a1'))
  await $.agent.spawn(spawn('inner two', 'a1'))
  await $.agent.spawn(spawn('deep', 'a2'))
  const seen: El[] = []
  onTool = async () => { seen.push(await desk($)) }
  await $.tool.call({ tool: 'Bash', command: 'ls', agentId: 'a4', tool_use_id: 't' } as never)
  const root = seen[0]!
  const prefix = (key: string) => {
    const r = all(root).find(e => e.props.key === key)!
    return texts(kids(r)[0]!).map(shown)
  }
  for (const key of ['a1', 'a2', 'a3', 'a4']) {
    const t = texts(kids(all(root).find(e => e.props.key === key)!)[0]!)[0]!
    expect(t.props.mono).toBe(true)
  }
  expect(prefix('a1')).toEqual(['└─'])
  expect(prefix('a2')).toEqual(['  ├─'])
  expect(prefix('a3')).toEqual(['  └─'])
  // The deep node's action line continues the open ancestor column.
  expect(prefix('a4')).toEqual(['  │ └─', '  │   '])
})
