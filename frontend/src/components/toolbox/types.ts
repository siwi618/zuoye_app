// A tool is either live (has a route) or planned (shown as a bud that has not grown yet).
export type Tool = {
  key: string
  status: 'live' | 'planned'
  to?: string
  icon?: string
}

export type Subject = {
  key: 'science' | 'humanities'
  tools: Tool[]
}

export type SceneProps = {
  subjects: Subject[]
}
