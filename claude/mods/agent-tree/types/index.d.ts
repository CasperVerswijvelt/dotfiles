export type AgentTreeNode = {
  id: string
  parentId: string
  type: string
  description: string
  model?: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed'
  currentTool?: string
  review?: { grade: string; round: number }
  needsYou?: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'agent-tree': { nodes: AgentTreeNode[]; tick: number; minute: number }
  }
}
