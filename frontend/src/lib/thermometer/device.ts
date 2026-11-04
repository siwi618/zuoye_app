import {
  BAUD_RATE,
  FrameParser,
  type Live,
  type Message,
  type MeterStatus,
  QUERY_COUNT,
  pagesFor,
  readPagesCommand,
} from './protocol'

/** How long to listen for UT325F frames before deciding the port holds some other device. */
export const VERIFY_MS = 4000
/** Records request: give up when the meter is silent this long. */
const REPLY_TIMEOUT_MS = 3000

export class RecordsError extends Error {
  readonly reason: 'noReply' | 'interrupted'
  constructor(reason: 'noReply' | 'interrupted') {
    super(reason)
    this.reason = reason
  }
}

type Handlers = {
  onLive: (live: Live, at: number) => void
  onStatus: (status: MeterStatus) => void
  /** The port closed by itself (unplugged); not called after close(). */
  onLost: (error: unknown) => void
}

/**
 * A connection to the thermometer. It only listens until a valid UT325F frame has arrived
 * (the port might be another CH340 device, e.g. the DISPRO ammeter); after that the only
 * bytes it ever writes are the two read-only record commands.
 */
export class Thermometer {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private closing = false
  private loop: Promise<void> = Promise.resolve()
  private isVerified = false
  private onVerify: ((ok: boolean) => void) | null = null
  private sink: ((m: Message) => void) | null = null
  private port: SerialPort
  private handlers: Handlers
  readonly verified: Promise<boolean>

  constructor(port: SerialPort, handlers: Handlers) {
    this.port = port
    this.handlers = handlers
    this.verified = new Promise((resolve) => (this.onVerify = resolve))
  }

  /** Opens the port and starts listening; `verified` settles within VERIFY_MS. */
  async open() {
    await this.port.open({ baudRate: BAUD_RATE })
    this.reader = this.port.readable!.getReader()
    this.loop = this.readLoop()
    setTimeout(() => this.settle(false), VERIFY_MS)
  }

  async close() {
    if (this.closing) return
    this.closing = true
    this.settle(false)
    await this.reader?.cancel().catch(() => {})
    await this.loop
    await this.port.close().catch(() => {})
  }

  /** Reads every record stored on the meter. Pages arrive ~0.15 s apart. */
  async readRecords(onProgress: (done: number, total: number) => void): Promise<Uint8Array[]> {
    if (!this.isVerified) throw new Error('not verified')
    if (this.sink) throw new Error('busy')
    return new Promise<Uint8Array[]>((resolve, reject) => {
      const pages: Uint8Array[] = []
      let total = 0
      let timer = 0
      const finish = (err: RecordsError | null) => {
        clearTimeout(timer)
        this.sink = null
        if (err) reject(err)
        else resolve(pages)
      }
      const arm = (reason: RecordsError['reason']) => {
        clearTimeout(timer)
        timer = window.setTimeout(() => finish(new RecordsError(reason)), REPLY_TIMEOUT_MS)
      }
      this.sink = (m) => {
        if (m.kind === 'count') {
          total = pagesFor(m.count)
          if (total === 0) return finish(null)
          onProgress(0, total)
          arm('interrupted')
          this.write(readPagesCommand(0, total)).catch(() =>
            finish(new RecordsError('interrupted')),
          )
        } else if (m.kind === 'progress' && total) {
          arm('interrupted')
        } else if (m.kind === 'page' && total) {
          pages.push(m.data)
          onProgress(pages.length, total)
          arm('interrupted')
        } else if (m.kind === 'end' && total) {
          finish(null)
        }
      }
      arm('noReply')
      this.write(QUERY_COUNT).catch(() => finish(new RecordsError('noReply')))
    })
  }

  private settle(ok: boolean) {
    if (!this.onVerify) return
    this.isVerified = ok
    this.onVerify(ok)
    this.onVerify = null
  }

  private async readLoop() {
    const parser = new FrameParser()
    try {
      for (;;) {
        const { value, done } = await this.reader!.read()
        if (done) break
        const at = Date.now()
        for (const m of parser.feed(value)) {
          if (m.kind === 'live' || m.kind === 'status') this.settle(true)
          if (m.kind === 'live') this.handlers.onLive(m.live, at)
          else if (m.kind === 'status') this.handlers.onStatus(m.status)
          else this.sink?.(m)
        }
      }
    } catch (e) {
      if (!this.closing) {
        this.closing = true
        this.settle(false)
        this.reader?.releaseLock()
        await this.port.close().catch(() => {})
        this.handlers.onLost(e)
        return
      }
    }
    this.reader?.releaseLock()
  }

  private async write(bytes: Uint8Array) {
    if (!this.isVerified) throw new Error('not verified') // never write to an unknown device
    const writer = this.port.writable!.getWriter()
    try {
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  }
}
