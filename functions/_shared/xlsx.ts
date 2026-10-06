// Minimal XLSX (OOXML) builder.
//
// XLSX files are ZIP archives of XML. We only need text cells with an optional
// bold header style, so we hand-build the XML parts and pack them into a
// STORE-only (uncompressed) ZIP. No external dependency, works on Workers.

interface SheetColumn {
  header: string;
  width?: number; // in Excel character units
}

export interface SheetSpec {
  name: string;
  columns: SheetColumn[];
  rows: (string | number | boolean | null | undefined)[][];
}

function xmlEscape(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colLetter(index: number): string {
  // 0 -> A, 25 -> Z, 26 -> AA
  let n = index;
  let s = '';
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

function sheetXml(spec: SheetSpec): string {
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  parts.push(
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  );

  const widths = spec.columns.filter(c => typeof c.width === 'number');
  if (widths.length) {
    parts.push('<cols>');
    spec.columns.forEach((c, i) => {
      if (typeof c.width === 'number') {
        parts.push(
          `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`
        );
      }
    });
    parts.push('</cols>');
  }

  parts.push('<sheetData>');

  // Header row
  parts.push('<row r="1">');
  spec.columns.forEach((c, i) => {
    const ref = `${colLetter(i)}1`;
    parts.push(
      `<c r="${ref}" t="inlineStr" s="1"><is><t xml:space="preserve">${xmlEscape(
        c.header
      )}</t></is></c>`
    );
  });
  parts.push('</row>');

  // Data rows
  spec.rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 2;
    parts.push(`<row r="${rowNum}">`);
    row.forEach((val, i) => {
      const ref = `${colLetter(i)}${rowNum}`;
      if (typeof val === 'number' && Number.isFinite(val)) {
        parts.push(`<c r="${ref}"><v>${val}</v></c>`);
      } else {
        const text = val == null ? '' : String(val);
        parts.push(
          `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
            text
          )}</t></is></c>`
        );
      }
    });
    parts.push('</row>');
  });

  parts.push('</sheetData>');
  parts.push('</worksheet>');
  return parts.join('');
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>';

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>';

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '</Relationships>';

function workbookXml(sheetName: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' +
    `<sheet name="${xmlEscape(sheetName)}" sheetId="1" r:id="rId1"/>` +
    '</sheets>' +
    '</workbook>'
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1D2F78"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2">' +
  '<xf fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '</cellXfs>' +
  '</styleSheet>';

// ---------- ZIP (STORE-only) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function dosDateTime(d: Date): { date: number; time: number } {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((Math.floor(d.getSeconds() / 2)) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0xf) << 5) |
    (d.getDate() & 0x1f);
  return { date, time };
}

function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const now = new Date();
  const { date, time } = dosDateTime(now);

  interface Prepared {
    nameBytes: Uint8Array;
    data: Uint8Array;
    crc: number;
    localOffset: number;
  }
  const prepared: Prepared[] = [];

  // Compute sizes first
  let localTotal = 0;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const localSize = 30 + nameBytes.length + e.data.length;
    prepared.push({ nameBytes, data: e.data, crc, localOffset: localTotal });
    localTotal += localSize;
  }

  let centralSize = 0;
  for (const p of prepared) {
    centralSize += 46 + p.nameBytes.length;
  }

  const total = localTotal + centralSize + 22;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;

  // Local file headers + data
  for (const p of prepared) {
    dv.setUint32(o, 0x04034b50, true); o += 4;
    dv.setUint16(o, 20, true); o += 2; // version needed
    dv.setUint16(o, 0, true); o += 2;  // flags
    dv.setUint16(o, 0, true); o += 2;  // method = store
    dv.setUint16(o, time, true); o += 2;
    dv.setUint16(o, date, true); o += 2;
    dv.setUint32(o, p.crc, true); o += 4;
    dv.setUint32(o, p.data.length, true); o += 4; // compressed
    dv.setUint32(o, p.data.length, true); o += 4; // uncompressed
    dv.setUint16(o, p.nameBytes.length, true); o += 2;
    dv.setUint16(o, 0, true); o += 2;  // extra len
    out.set(p.nameBytes, o); o += p.nameBytes.length;
    out.set(p.data, o); o += p.data.length;
  }

  const centralStart = o;

  // Central directory
  for (const p of prepared) {
    dv.setUint32(o, 0x02014b50, true); o += 4;
    dv.setUint16(o, 20, true); o += 2; // version made by
    dv.setUint16(o, 20, true); o += 2; // version needed
    dv.setUint16(o, 0, true); o += 2;  // flags
    dv.setUint16(o, 0, true); o += 2;  // method
    dv.setUint16(o, time, true); o += 2;
    dv.setUint16(o, date, true); o += 2;
    dv.setUint32(o, p.crc, true); o += 4;
    dv.setUint32(o, p.data.length, true); o += 4;
    dv.setUint32(o, p.data.length, true); o += 4;
    dv.setUint16(o, p.nameBytes.length, true); o += 2;
    dv.setUint16(o, 0, true); o += 2;  // extra len
    dv.setUint16(o, 0, true); o += 2;  // comment len
    dv.setUint16(o, 0, true); o += 2;  // disk number
    dv.setUint16(o, 0, true); o += 2;  // internal attrs
    dv.setUint32(o, 0, true); o += 4;  // external attrs
    dv.setUint32(o, p.localOffset, true); o += 4;
    out.set(p.nameBytes, o); o += p.nameBytes.length;
  }

  // End of central directory
  dv.setUint32(o, 0x06054b50, true); o += 4;
  dv.setUint16(o, 0, true); o += 2;
  dv.setUint16(o, 0, true); o += 2;
  dv.setUint16(o, prepared.length, true); o += 2;
  dv.setUint16(o, prepared.length, true); o += 2;
  dv.setUint32(o, centralSize, true); o += 4;
  dv.setUint32(o, centralStart, true); o += 4;
  dv.setUint16(o, 0, true); o += 2;

  return out;
}

export function buildXlsx(sheet: SheetSpec): Uint8Array {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: enc.encode(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: enc.encode(workbookXml(sheet.name)) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode(WORKBOOK_RELS_XML) },
    { name: 'xl/styles.xml', data: enc.encode(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheetXml(sheet)) }
  ];
  return buildZip(entries);
}
