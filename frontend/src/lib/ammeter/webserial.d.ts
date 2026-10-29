// Minimal Web Serial API types (not in TypeScript's DOM lib).
// https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API

interface SerialPortInfo {
  usbVendorId?: number
  usbProductId?: number
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null
  readonly writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number }): Promise<void>
  close(): Promise<void>
  getInfo(): SerialPortInfo
}

interface Serial extends EventTarget {
  requestPort(options?: { filters?: SerialPortInfo[] }): Promise<SerialPort>
  getPorts(): Promise<SerialPort[]>
}

interface Navigator {
  readonly serial?: Serial
}
