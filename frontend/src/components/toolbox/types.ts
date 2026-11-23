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
  // A tool held out by the octopus on the seabed rather than grown on the coral (活动指南).
  held?: Tool
  // An event is open today: the octopus turns purple, its suckers light up like party bulbs, and it
  // wears a party hat and blows a party horn when tapped.
  festive?: boolean
}
