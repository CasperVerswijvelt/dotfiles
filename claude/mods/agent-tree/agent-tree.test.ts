import { expect, mock, test } from 'claude-code/testing'

import { register } from './hooks/register'

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
      expect((await ui.find({ type: 'Svg' }))?.props.source).toMatch(/inner task/)
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

const mount = async ($: any, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'agent-tree', surface, component: 'Pane', props: {} as never, requestId: 'agent-tree' })
const svg = async ($: any) => {
  const ui = await mount($, 'desktop')
  const node = await ui.find({ type: 'Svg' })
  await ui.unmount()
  return node
}
const rowsOf = (s: string) => s.match(/<g class="[osh]"><rect x="\d+" y="\d+" width="\d+" height="20"/g)?.length ?? 0
const row = async (ui: any, d: string) => ui.find({ type: 'Text', text: new RegExp(d) })

test('desktop svg: one row per agent, animation only on running, done rows dimmed with tier colour', async ($, on) => {
  await setup($, on)
  Object.assign(models, { boss: 'opus', fast: 'haiku' })
  await $.agent.spawn(spawn('boss'))
  await $.agent.spawn(spawn('worker', 'a1'))
  await $.agent.spawn(spawn('fast', 'a1'))
  await $.agent.spawn(spawn('finished', 'a1'))
  await $.turn.complete({ agentId: 'a4', answer: '', durationMs: 1, isAborted: false, turnId: 't' } as never)
  const source = (await svg($)).props.source
  expect(rowsOf(source)).toBe(4)
  expect(source.match(/attributeName="stroke-dashoffset"/g)).toHaveLength(3)
  expect(source.match(/values="1;0\.25;1"/g)).toHaveLength(3)
  expect(source).toMatch(/<g opacity="0\.55">[\s\S]*<g class="s"><rect x="\d+" y="\d+" width="\d+" height="20"/)
  expect(source).toContain('>Haiku<')
  expect(source).not.toContain('[sonnet]')
  expect(source).not.toContain('<title>')
})

test('descriptions are escaped in the svg', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('<script>alert(1)</script> & "x"'))
  const source = (await svg($)).props.source
  expect(source).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
  expect(source).not.toContain('<script>')
})

test('the desktop svg is an image, not an interactive frame', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  expect((await svg($)).props.isInteractive).toBeFalsy()
})

test('the svg is drawn 1:1: width and height props equal the viewBox', async ($, on) => {
  await setup($, on)
  await $.agent.spawn(spawn('worker'))
  const node = await svg($)
  const [w, h] = node.props.source.match(/viewBox="0 0 (\d+) (\d+)"/).slice(1).map(Number)
  expect([node.props.width, node.props.height]).toEqual([w, h])
})

test('empty pane says so', async ($, on) => {
  await setup($, on)
  expect((await svg($)).props.source).toMatch(/No agents yet/)
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
    seen = (await ui.find({ type: 'Text', text: /outer|worker/ }))?.text ?? ''
    await ui.unmount()
  }
  await $.tool.call({ tool: 'Edit', file_path: '/x/GroupStore.swift', agentId: 'a1', tool_use_id: 't' } as never)
  expect(seen).toMatch(/Edit GroupStore\.swift/)
})

test('a clock tick that changes no displayed value leaves the svg source unchanged', async ($, on) => {
  const clock = await setup($, on)
  await $.agent.spawn(spawn('worker'))
  const before = (await svg($)).props.source
  await clock.advance(1000)
  await clock.advance(1000)
  expect((await svg($)).props.source).toBe(before)
  await clock.advance(60_000)
  expect((await svg($)).props.source).not.toBe(before)
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
  expect((await svg($)).props.source).toMatch(/<g class="h"><rect x="\d+" y="\d+" width="\d+" height="20"/)
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
