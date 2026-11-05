// The works of the literature tool (the sphere's outer shell). Everything students add to a work
// — quotes, #device tags, analyses — lives in the database under the work's key.

export interface Work {
  key: string
  title: string
  author: string
  year: number
  group?: string // works published together, e.g. 阿城「三王」
}

export const WORKS: Work[] = [
  {
    key: 'moon',
    title: '月亮与六便士',
    author: '毛姆',
    year: 1919,
  },
  {
    key: 'chess',
    title: '棋王',
    author: '阿城',
    year: 1984,
    group: '三王',
  },
  {
    key: 'tree',
    title: '树王',
    author: '阿城',
    year: 1985,
    group: '三王',
  },
  {
    key: 'kids',
    title: '孩子王',
    author: '阿城',
    year: 1985,
    group: '三王',
  },
]

export const findWork = (key: string | undefined) => WORKS.find((w) => w.key === key)

// A work's own page; with `tag`, its analyses are filtered to that #tag.
export const workPath = (key: string, tag?: string) =>
  `/tools/literature/works/${key}${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`
