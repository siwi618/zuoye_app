import { type Unit, UNIT_SYMBOL, fromCelsius } from './protocol'

/** One exported row: time, T1–T4 in °C (null = no probe), optional thermocouple type names. */
export type ExportRow = { time: Date; temps: (number | null)[]; types?: string[] }

const OPEN = '--\\--' // what the vendor's own export writes for a channel without a probe

const pad = (n: number) => String(n).padStart(2, '0')

export function formatTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fileStamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const num = (x: number) => String(+x.toFixed(3))

/** CSV with BOM so Excel reads the Chinese header; channels without a probe stay empty. */
export function toCsv(rows: ExportRow[], unit: Unit, header: { no: string; time: string }): Blob {
  const u = UNIT_SYMBOL[unit]
  const lines = [`\uFEFF${header.no},${header.time},T1(${u}),T2(${u}),T3(${u}),T4(${u})`]
  rows.forEach((r, k) => {
    const temps = r.temps.map((c) => (c === null ? '' : num(fromCelsius(c, unit))))
    lines.push([k + 1, formatTime(r.time), ...temps].join(','))
  })
  return new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' })
}

/** xlsx with the vendor's columns: NO. / time / Tn Temperature / Tn Thermocouple. */
export function toXlsx(rows: ExportRow[], unit: Unit): Blob {
  const u = UNIT_SYMBOL[unit]
  const col = (i: number) => String.fromCharCode(65 + i)
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const str = (c: string, r: number, v: string, s = 0) =>
    `<c r="${c}${r}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t>${esc(v)}</t></is></c>`
  const nmb = (c: string, r: number, v: number, s = 0) =>
    `<c r="${c}${r}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`
  // Excel date: days since 1899-12-30 in local time
  const serial = (d: Date) => (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569

  const cols = ['NO.', 'time']
  for (let c = 1; c <= 4; c++) cols.push(`T${c} Temperature(${u})`, `T${c} Thermocouple`)
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>',
    '<col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="21" customWidth="1"/>',
    '<col min="3" max="10" width="20" customWidth="1"/></cols><sheetData>',
    `<row r="1">${cols.map((v, i) => str(col(i), 1, v, 1)).join('')}</row>`,
  ]
  rows.forEach((row, k) => {
    const r = k + 2
    const cells = [nmb('A', r, k + 1), nmb('B', r, serial(row.time), 2)]
    row.temps.forEach((c, ch) => {
      cells.push(
        c === null
          ? str(col(2 + 2 * ch), r, OPEN)
          : nmb(col(2 + 2 * ch), r, +fromCelsius(c, unit).toFixed(3), 3),
      )
      const ty = row.types?.[ch]
      if (ty) cells.push(str(col(3 + 2 * ch), r, ty))
    })
    out.push(`<row r="${r}">${cells.join('')}</row>`)
  })
  out.push('</sheetData></worksheet>')

  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      '_rels/.rels',
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `${head}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    ],
    ['xl/worksheets/sheet1.xml', out.join('')],
  ]
  const enc = new TextEncoder()
  return new Blob([zipStore(files.map(([n, s]) => [n, enc.encode(s)]))], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ---- Minimal zip writer: stored entries only (no compression), which xlsx allows ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(d: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStore(files: [string, Uint8Array][]): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const header = (size: number, write: (v: DataView) => void) => {
    const b = new Uint8Array(size)
    write(new DataView(b.buffer))
    return b
  }
  for (const [name, data] of files) {
    const nb = enc.encode(name)
    const crc = crc32(data)
    const local = header(30, (v) => {
      v.setUint32(0, 0x04034b50, true)
      v.setUint16(4, 20, true)
      v.setUint16(6, 0x0800, true) // UTF-8 names
      v.setUint16(12, 0x21, true) // 1980-01-01
      v.setUint32(14, crc, true)
      v.setUint32(18, data.length, true)
      v.setUint32(22, data.length, true)
      v.setUint16(26, nb.length, true)
    })
    central.push(
      header(46, (v) => {
        v.setUint32(0, 0x02014b50, true)
        v.setUint16(4, 20, true)
        v.setUint16(6, 20, true)
        v.setUint16(8, 0x0800, true)
        v.setUint16(14, 0x21, true)
        v.setUint32(16, crc, true)
        v.setUint32(20, data.length, true)
        v.setUint32(24, data.length, true)
        v.setUint16(28, nb.length, true)
        v.setUint32(42, offset, true)
      }),
      nb,
    )
    chunks.push(local, nb, data)
    offset += 30 + nb.length + data.length
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0)
  const end = header(22, (v) => {
    v.setUint32(0, 0x06054b50, true)
    v.setUint16(8, files.length, true)
    v.setUint16(10, files.length, true)
    v.setUint32(12, cdSize, true)
    v.setUint32(16, offset, true)
  })
  const all = [...chunks, ...central, end]
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0))
  let p = 0
  for (const c of all) {
    out.set(c, p)
    p += c.length
  }
  return out
}
