import { BAUD_RATE, FrameParser, SENSOR_INFO_COMMAND, STOP_COMMAND, startCommand } from './protocol'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * How long to listen before writing anything. The logger is silent when idle; other CH340
 * devices (e.g. a USB thermometer, which sends every ~0.36 s) talk on their own.
 */
const LISTEN_MS = 600

/** The port answers like some other CH340 device, not the DISPRO logger: nothing was sent to it. */
export class NotAmmeterError extends Error {
  constructor() {
    super('not a DISPRO logger')
    this.name = 'NotAmmeterError'
  }
}

type Read = ReadableStreamReadResult<Uint8Array>

/**
 * read() with a timeout (null when it runs out). A read that timed out stays pending and is
 * reused by the next call; starting a new one would let the old one swallow the next chunk.
 */
function timedReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  let pending: Promise<Read> | null = null
  return async (ms: number): Promise<Read | null> => {
    pending ??= reader.read()
    const r = await Promise.race([pending, sleep(ms).then(() => null)])
    if (r) pending = null
    return r
  }
}

/**
 * Listen without writing. Silence or well-formed logger frames (a run left over from last
 * time) mean the logger; bytes that never form a frame mean some other device.
 */
async function isLogger(read: (ms: number) => Promise<Read | null>): Promise<boolean> {
  const parser = new FrameParser()
  let bytes = 0
  const deadline = Date.now() + LISTEN_MS
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0) break
    const r = await read(left)
    if (!r || r.done) break
    bytes += r.value.length
    parser.feed(r.value)
    if (parser.validFrames > 0) return true
  }
  return bytes === 0
}

/**
 * Which sensor is on channel 0, read from its EEPROM while the logger is idle.
 * null if the logger doesn't answer; throws NotAmmeterError (without writing) if the port is
 * some other device, or an error if it can't be opened (e.g. in use).
 */
export async function readSensorId(port: SerialPort): Promise<number | null> {
  await port.open({ baudRate: BAUD_RATE })
  const reader = port.readable!.getReader()
  const parser = new FrameParser()
  const read = timedReader(reader)
  try {
    if (!(await isLogger(read))) throw new NotAmmeterError()
    const writer = port.writable!.getWriter()
    try {
      await writer.write(STOP_COMMAND)
      await sleep(100)
      await writer.write(SENSOR_INFO_COMMAND)
    } finally {
      writer.releaseLock()
    }
    const deadline = Date.now() + 500
    while (parser.sensorId === null) {
      const left = deadline - Date.now()
      if (left <= 0) break
      const r = await read(left)
      if (!r || r.done) break
      parser.feed(r.value)
    }
    return parser.sensorId
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
    await port.close().catch(() => {})
  }
}

/**
 * One acquisition run on an already-chosen port: opens it, sends start, reports readings
 * through onValues, and on stop() sends the stop command and closes the port.
 * onError fires when the device goes away mid-run (unplugged); readings so far are kept by the caller.
 */
export class Acquisition {
  private port: SerialPort
  private periodUs: number
  private onValues: (values: number[]) => void
  private onError: (error: unknown) => void
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private stopping = false
  private done: Promise<void> = Promise.resolve()

  constructor(
    port: SerialPort,
    periodUs: number,
    onValues: (values: number[]) => void,
    onError: (error: unknown) => void,
  ) {
    this.port = port
    this.periodUs = periodUs
    this.onValues = onValues
    this.onError = onError
  }

  async start() {
    await this.port.open({ baudRate: BAUD_RATE })
    this.reader = this.port.readable!.getReader()
    // Stop once first to clear a run left over from last time, and drop what it still sends
    let accepting = false
    const parser = new FrameParser()
    this.done = this.readLoop(parser, () => accepting)
    await this.write(STOP_COMMAND)
    await new Promise((r) => setTimeout(r, 100))
    accepting = true
    await this.write(startCommand(this.periodUs))
  }

  async stop() {
    if (this.stopping) return
    this.stopping = true
    try {
      await this.write(STOP_COMMAND)
      await new Promise((r) => setTimeout(r, 200)) // device answers with cmd=05
    } catch {
      // already unplugged
    }
    await this.reader?.cancel().catch(() => {})
    await this.done
    await this.port.close().catch(() => {})
  }

  private async readLoop(parser: FrameParser, accepting: () => boolean) {
    try {
      for (;;) {
        const { value, done } = await this.reader!.read()
        if (done) break
        const values = parser.feed(value)
        if (accepting() && values.length) this.onValues(values)
      }
    } catch (e) {
      if (!this.stopping) this.onError(e)
    } finally {
      this.reader?.releaseLock()
    }
    if (!this.stopping) {
      this.stopping = true
      await this.port.close().catch(() => {})
    }
  }

  private async write(bytes: Uint8Array) {
    const writer = this.port.writable!.getWriter()
    try {
      await writer.write(bytes)
    } finally {
      writer.releaseLock()
    }
  }
}
