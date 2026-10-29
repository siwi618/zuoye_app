// Reads .lds experiment files saved by DISPRO (XML): takes the last group that has a time column
// and a value column. Mirrors LDS.swift in the DISPRO Mac app.

export function parseLds(text: string): { t: number[]; i: number[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('invalid')

  const groups = Array.from(doc.getElementsByTagName('Group')).reverse()
  for (const group of groups) {
    const cols = Array.from(group.children)
      .filter((c) => c.tagName === 'Column')
      .map((c) => {
        const info = Array.from(c.children).find((e) => e.tagName === 'info')
        const field = (name: string) =>
          Array.from(info?.children ?? []).find((e) => e.tagName === name)?.textContent ?? ''
        const data = Array.from(c.children).find((e) => e.tagName === 'Data')?.textContent ?? ''
        return {
          name: field('name'),
          unit: field('unit'),
          data: data.split(' ').filter(Boolean).map(Number).filter(Number.isFinite),
        }
      })
      .filter((c) => c.data.length > 0)
    const time = cols.find((c) => c.unit === '秒' || c.name === '时间')
    const value = time && cols.find((c) => c.name !== time.name)
    if (!time || !value) continue
    const scale = value.unit === 'mA' ? 0.001 : 1
    const n = Math.min(time.data.length, value.data.length)
    return { t: time.data.slice(0, n), i: value.data.slice(0, n).map((v) => v * scale) }
  }
  throw new Error('empty')
}
