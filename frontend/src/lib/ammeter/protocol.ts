// Serial protocol of the DISPRO current logger (reverse-engineered, same as the DISPRO Mac app).
// Frame: F1 <cmd> <ch> <len> <payload…> <xor> F2, xor = XOR of cmd..payload.
// Between F1 and F2, any F1/F2/F3 byte (checksum included) is escaped as F3, byte ^ 0x10.

export const BAUD_RATE = 460800
export const CH340_VENDOR_ID = 0x1a86

function escape(bytes: number[]): number[] {
  return bytes.flatMap((b) => (b >= 0xf1 && b <= 0xf3 ? [0xf3, b ^ 0x10] : [b]))
}

function frame(cmd: number, ch: number, payload: number[]): Uint8Array {
  const body = [cmd, ch, payload.length, ...payload]
  const xor = body.reduce((a, b) => a ^ b, 0)
  return new Uint8Array([0xf1, ...escape([...body, xor]), 0xf2])
}

/** Start sampling: payload = period in µs (uint32 LE) + mode byte 0. */
export function startCommand(periodUs: number): Uint8Array {
  const p = [0, 8, 16, 24].map((s) => (periodUs >>> s) & 0xff)
  return frame(0x01, 0xff, [...p, 0])
}

export const STOP_COMMAND = frame(0x02, 0xff, [])

/** Splits the byte stream into frames and returns the current readings (A) of data frames. */
export class FrameParser {
  private buf: number[] = []

  feed(chunk: Uint8Array): number[] {
    for (const b of chunk) this.buf.push(b)
    const values: number[] = []
    for (;;) {
      const s = this.buf.indexOf(0xf1)
      if (s < 0) {
        this.buf = []
        break
      }
      // F2 first = complete frame; another F1 first = truncated frame, restart from it
      let e = s + 1
      while (e < this.buf.length && this.buf[e] !== 0xf2 && this.buf[e] !== 0xf1) e++
      if (e === this.buf.length) {
        this.buf = this.buf.slice(s)
        break
      }
      if (this.buf[e] === 0xf2) {
        const v = decode(unescape(this.buf.slice(s + 1, e)))
        if (v !== null) values.push(v)
        this.buf = this.buf.slice(e + 1)
      } else {
        this.buf = this.buf.slice(e)
      }
    }
    return values
  }
}

function unescape(bytes: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    out.push(bytes[i] === 0xf3 && i + 1 < bytes.length ? bytes[++i] ^ 0x10 : bytes[i])
  }
  return out
}

/** Data frame: cmd=01 ch=00 len=04, payload float32 LE in amperes. Other frames → null. */
function decode(body: number[]): number | null {
  if (body.length < 4 || body[2] !== body.length - 4) return null
  if (body.slice(0, -1).reduce((a, b) => a ^ b, 0) !== body[body.length - 1]) return null
  if (body[0] !== 0x01 || body[1] !== 0x00 || body[2] !== 4) return null
  return new DataView(new Uint8Array(body.slice(3, 7)).buffer).getFloat32(0, true)
}
