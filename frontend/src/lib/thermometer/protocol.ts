// UNI-T UT325F thermometer serial protocol (decoded 2026-11-04 from live captures and the vendor app;
// same as the UT325F Mac app). Frame: AA 55 <len u16 BE = payload + 2> <payload> <u16 BE sum of all
// bytes from AA>. The meter streams live frames on its own (~3/s, none while HOLD is on).

export const BAUD_RATE = 115200
export const CH340_VENDOR_ID = 0x1a86
export const CHANNELS = 4
const RECORDS_PER_PAGE = 32
const MAX_PAGES = 2500

// Only two read-only commands: 33 = how many records, 32 = read pages of records.
// 34 erases the meter's memory and 3B resets its settings; nothing else has been tested. Never send them.
const ALLOWED = new Set([0x32, 0x33])

function frame(payload: number[]): Uint8Array {
  if (!ALLOWED.has(payload[0])) throw new Error(`command ${payload[0]} not allowed`)
  const n = payload.length + 2
  const f = [0xaa, 0x55, n >> 8, n & 0xff, ...payload]
  const sum = f.reduce((a, b) => (a + b) & 0xffff, 0)
  return new Uint8Array([...f, sum >> 8, sum & 0xff])
}

export const QUERY_COUNT = frame([0x33])

export function readPagesCommand(start: number, count: number): Uint8Array {
  return frame([0x32, start >> 8, start & 0xff, count >> 8, count & 0xff])
}

export function pagesFor(records: number): number {
  return Math.min(MAX_PAGES, Math.ceil(records / RECORDS_PER_PAGE))
}

/** Timing mode on the meter (MAX/MIN/AVG button). */
export type StatMode = 0 | 1 | 2 | 3
export const STAT_LABELS = ['', 'MAX', 'MIN', 'AVG']

export type Unit = 'C' | 'F' | 'K'
export const UNITS: Unit[] = ['C', 'F', 'K']
export const UNIT_SYMBOL: Record<Unit, string> = { C: '℃', F: '℉', K: 'K' }

export function fromCelsius(c: number, unit: Unit): number {
  return unit === 'F' ? (c * 9) / 5 + 32 : unit === 'K' ? c + 273.15 : c
}

/** One live frame. Temperatures are always °C whatever the meter shows; null = no probe. */
export type Live = {
  temps: (number | null)[]
  /** MAX/MIN/AVG in timing mode, else the same as temps */
  stats: (number | null)[]
  ambient: number
  timer: number
  mode: StatMode
}

/** Sent once each time a button on the meter changes its state. */
export type MeterStatus = {
  hold: boolean
  recording: boolean
  mode: StatMode
  unit: Unit | null
  dif: number
}

export type Message =
  | { kind: 'live'; live: Live }
  | { kind: 'status'; status: MeterStatus }
  | { kind: 'count'; count: number }
  | { kind: 'progress'; total: number; remaining: number }
  | { kind: 'page'; index: number; data: Uint8Array }
  | { kind: 'end' }
  | { kind: 'other'; type: number }

function f32(p: Uint8Array, o: number): number {
  return new DataView(p.buffer, p.byteOffset + o, 4).getFloat32(0, true)
}

export function decode(p: Uint8Array): Message {
  switch (p[0]) {
    case 0x01:
      if (p.length < 50) break
      return {
        kind: 'live',
        live: {
          temps: [0, 1, 2, 3].map((c) => (p[17 + c] === 0 ? f32(p, 1 + 4 * c) : null)),
          stats: [0, 1, 2, 3].map((c) =>
            p[17 + c] === 0 && p[37 + c] === 0 ? f32(p, 21 + 4 * c) : null,
          ),
          ambient: f32(p, 41),
          timer: ((p[45] << 24) | (p[46] << 16) | (p[47] << 8) | p[48]) >>> 0,
          mode: (p[49] <= 3 ? p[49] : 0) as StatMode,
        },
      }
    case 0x06:
      if (p.length < 13) break
      return {
        kind: 'status',
        status: {
          hold: p[2] !== 0,
          recording: p[5] !== 0,
          mode: (p[10] <= 3 ? p[10] : 0) as StatMode,
          unit: p[11] <= 2 ? UNITS[p[11]] : null,
          dif: p[12],
        },
      }
    case 0x05:
      if (p.length < 5) break
      return { kind: 'count', count: ((p[1] << 24) | (p[2] << 16) | (p[3] << 8) | p[4]) >>> 0 }
    case 0x03:
      if (p.length < 5) break
      return { kind: 'progress', total: (p[1] << 8) | p[2], remaining: (p[3] << 8) | p[4] }
    case 0x02:
      if (p.length < 3) break
      return { kind: 'page', index: (p[1] << 8) | p[2], data: p.slice(3) }
    case 0x04:
      return { kind: 'end' }
  }
  return { kind: 'other', type: p[0] }
}

/** Cuts the byte stream into checked frames; a bad frame drops one byte and looks for the next header. */
export class FrameParser {
  private buf = new Uint8Array(0)
  badFrames = 0

  feed(chunk: Uint8Array): Message[] {
    const merged = new Uint8Array(this.buf.length + chunk.length)
    merged.set(this.buf)
    merged.set(chunk, this.buf.length)
    const b = merged
    const out: Message[] = []
    let i = 0
    for (;;) {
      while (i + 1 < b.length && !(b[i] === 0xaa && b[i + 1] === 0x55)) i++
      if (i + 4 > b.length) break
      const len = (b[i + 2] << 8) | b[i + 3]
      if (len < 3 || len > 2048) {
        i++
        this.badFrames++
        continue
      }
      const end = i + 4 + len
      if (end > b.length) break
      let sum = 0
      for (let k = i; k < end - 2; k++) sum += b[k]
      if ((sum & 0xffff) !== ((b[end - 2] << 8) | b[end - 1])) {
        i++
        this.badFrames++
        continue
      }
      out.push(decode(b.slice(i + 4, end - 2)))
      i = end
    }
    this.buf = b.slice(Math.min(i, b.length))
    if (this.buf.length > 65536) this.buf = new Uint8Array(0)
    return out
  }
}

// ---- Records stored on the meter (STORE button) ----

export type MeterRecord = {
  time: Date
  temps: (number | null)[] // °C
  types: number[] // thermocouple type codes; 0 = K
}

const TYPE_NAMES = ['K', 'J', 'T', 'E', 'R', 'S', 'N'] // order after 0 = K is a guess from the manual

export function typeName(code: number): string {
  return TYPE_NAMES[code] ?? `?${code}`
}

/**
 * One 32-byte record: [0-1] checksum u16 LE = (sum of [2-31] + 0xAA55) & 0xFFFF,
 * [2-5] thermocouple types, [6-9] channel status (0 = probe in), [10-15] yy mm dd hh mm ss,
 * [16-31] T1–T4 float32 LE °C. Empty slots are all FF.
 */
export function parseRecord(r: Uint8Array): MeterRecord | 'empty' | 'bad' {
  if (r.length !== 32) return 'bad'
  if (r.every((x) => x === 0xff)) return 'empty'
  let sum = 0
  for (let k = 2; k < 32; k++) sum += r[k]
  if (((sum + 0xaa55) & 0xffff) !== (r[0] | (r[1] << 8))) return 'bad'
  const [y, mo, d, h, mi, s] = r.slice(10, 16)
  const time = new Date(2000 + y, mo - 1, d, h, mi, s)
  if (time.getMonth() !== mo - 1 || time.getDate() !== d || h > 23 || mi > 59 || s > 59)
    return 'bad'
  return {
    time,
    temps: [0, 1, 2, 3].map((c) => (r[6 + c] === 0 ? f32(r, 16 + 4 * c) : null)),
    types: Array.from(r.slice(2, 6)),
  }
}

export function parsePages(pages: Uint8Array[]): { records: MeterRecord[]; bad: number } {
  const records: MeterRecord[] = []
  let bad = 0
  for (const p of pages) {
    for (let o = 0; o + 32 <= p.length; o += 32) {
      const r = parseRecord(p.subarray(o, o + 32))
      if (r === 'bad') bad++
      else if (r !== 'empty') records.push(r)
    }
  }
  return { records, bad }
}

/** Consecutive records from one STORE run: split where time goes back or the interval changes. */
export type Segment = { id: number; records: MeterRecord[]; interval: number }

export function splitSegments(recs: MeterRecord[]): Segment[] {
  const groups: MeterRecord[][] = []
  let cur: MeterRecord[] = []
  for (const r of recs) {
    const last = cur[cur.length - 1]
    if (last) {
      const gap = (r.time.getTime() - last.time.getTime()) / 1000
      let cut = gap <= 0 || gap > 86401
      if (cur.length >= 2) {
        const iv = (cur[1].time.getTime() - cur[0].time.getTime()) / 1000
        if (Math.abs(gap - iv) > Math.max(1, iv * 0.5)) cut = true
      }
      if (cut) {
        groups.push(cur)
        cur = []
      }
    }
    cur.push(r)
  }
  if (cur.length) groups.push(cur)
  return groups.map((records, id) => ({
    id,
    records,
    interval:
      records.length > 1 ? (records[1].time.getTime() - records[0].time.getTime()) / 1000 : 0,
  }))
}
