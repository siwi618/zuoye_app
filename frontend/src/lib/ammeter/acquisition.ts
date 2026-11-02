import { BAUD_RATE, FrameParser, SENSOR_INFO_COMMAND, STOP_COMMAND, startCommand } from './protocol'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Which sensor is on channel 0, read from its EEPROM while the logger is idle.
 * null if the logger doesn't answer; throws if the port can't be opened (e.g. in use).
 */
export async function readSensorId(port: SerialPort): Promise<number | null> {
  await port.open({ baudRate: BAUD_RATE })
  const reader = port.readable!.getReader()
  const parser = new FrameParser()
  try {
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
      const r = await Promise.race([reader.read(), sleep(left).then(() => null)])
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
