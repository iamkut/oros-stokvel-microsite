// Minimal PDF 1.4 builder for a landscape tabular report.
//
// Single font family (Helvetica + Helvetica-Bold), WinAnsi encoding, paginated
// table with a title row. No external dependencies.

export interface PdfTableSpec {
  title: string;
  subtitle?: string;
  columns: { header: string; width: number }[]; // widths in PDF points
  rows: string[][];
}

// Map a JS code point to a WinAnsi (CP1252) byte, or 0x3f ('?') if unmappable.
const WINANSI_EXTRA: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84,
  0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f
};

function codeToWinAnsi(code: number): number {
  if (code === 0x0a) return 0x0a;
  if (code >= 0x20 && code <= 0x7e) return code;
  if (code >= 0xa0 && code <= 0xff) return code;
  return WINANSI_EXTRA[code] ?? 0x3f;
}

// Convert a string of arbitrary Unicode text into a Latin-1-chars string
// where each 16-bit char code is already a valid PDF (WinAnsi) byte.
function toLatin1Chars(s: string): string {
  let out = '';
  for (const ch of s) {
    out += String.fromCharCode(codeToWinAnsi(ch.codePointAt(0)!));
  }
  return out;
}

// Latin-1-chars string -> raw bytes (one byte per char).
function latin1ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function pdfLiteral(s: string): string {
  const safe = toLatin1Chars(s);
  let out = '(';
  for (let i = 0; i < safe.length; i++) {
    const b = safe.charCodeAt(i);
    if (b === 0x28) out += '\\(';
    else if (b === 0x29) out += '\\)';
    else if (b === 0x5c) out += '\\\\';
    else out += String.fromCharCode(b);
  }
  out += ')';
  return out;
}

// Helvetica width table (1/1000 em, per Adobe standard metrics).
const HELV_WIDTHS: Record<number, number> = (() => {
  const w: Record<number, number> = {};
  for (let i = 32; i < 256; i++) w[i] = 500;
  const assign = (chars: string, width: number) => {
    for (const c of chars) w[c.charCodeAt(0)] = width;
  };
  assign(' !', 278);
  assign('"', 355);
  assign('#$', 556);
  assign('%', 889);
  assign('&', 667);
  assign("'", 191);
  assign('()', 333);
  assign('*', 389);
  assign('+', 584);
  assign(',', 278);
  assign('-', 333);
  assign('.', 278);
  assign('/', 278);
  assign('0123456789', 556);
  assign(':;', 278);
  assign('<=>', 584);
  assign('?', 556);
  assign('@', 1015);
  assign('ABCDEFHKLNOPQRSUVWXYZ', 667);
  assign('G', 778);
  assign('I', 278);
  assign('J', 500);
  assign('M', 833);
  assign('T', 611);
  assign('[\\]', 278);
  assign('^', 469);
  assign('_', 556);
  assign('`', 333);
  assign('abcdeghknopqu', 556);
  assign('f', 278);
  assign('ijl', 222);
  assign('m', 833);
  assign('rstv', 333);
  assign('w', 722);
  assign('xy', 500);
  assign('z', 500);
  assign('{|}', 260);
  assign('~', 584);
  return w;
})();

function stringWidth(s: string, fontSize: number): number {
  let total = 0;
  const chars = toLatin1Chars(s);
  for (let i = 0; i < chars.length; i++) {
    total += HELV_WIDTHS[chars.charCodeAt(i)] ?? 500;
  }
  return (total * fontSize) / 1000;
}

function truncateToWidth(s: string, maxWidth: number, fontSize: number): string {
  if (stringWidth(s, fontSize) <= maxWidth) return s;
  const ellipsis = '...';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = s.slice(0, mid) + ellipsis;
    if (stringWidth(candidate, fontSize) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + ellipsis;
}

export function buildPdf(spec: PdfTableSpec): Uint8Array {
  // Landscape US Letter
  const pageW = 792;
  const pageH = 612;
  const marginX = 36;
  const marginTop = 54;
  const marginBottom = 48;

  const titleSize = 16;
  const subSize = 10;
  const headerSize = 9;
  const bodySize = 9;
  const rowH = 14;
  const headerH = 18;

  const bodyTop = pageH - marginTop - titleSize - (spec.subtitle ? subSize + 6 : 0) - 10;

  const colX: number[] = [];
  {
    let x = marginX;
    for (const c of spec.columns) {
      colX.push(x);
      x += c.width;
    }
  }

  const rowsPerPage = Math.max(
    1,
    Math.floor((bodyTop - headerH - marginBottom) / rowH)
  );
  const totalPages = Math.max(1, Math.ceil(spec.rows.length / rowsPerPage));

  // Object bodies as Latin-1-chars strings.
  const objects: string[] = [];
  const addObj = (body: string): number => { objects.push(body); return objects.length; };

  // Reserved slots:
  //  1: Catalog
  //  2: Pages (filled in later)
  //  3: Helvetica
  //  4: Helvetica-Bold
  addObj('<< /Type /Catalog /Pages 2 0 R >>');
  addObj('<<>>'); // placeholder for Pages, index 2
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  const pageObjIds: number[] = [];

  for (let p = 0; p < totalPages; p++) {
    const start = p * rowsPerPage;
    const end = Math.min(start + rowsPerPage, spec.rows.length);
    const lines: string[] = [];

    // Title
    lines.push('BT');
    lines.push(`/F2 ${titleSize} Tf`);
    lines.push(`0.113 0.184 0.470 rg`);
    lines.push(`1 0 0 1 ${marginX} ${pageH - marginTop} Tm`);
    lines.push(`${pdfLiteral(spec.title)} Tj`);
    lines.push('ET');

    if (spec.subtitle) {
      lines.push('BT');
      lines.push(`/F1 ${subSize} Tf`);
      lines.push(`0.3 0.3 0.3 rg`);
      lines.push(`1 0 0 1 ${marginX} ${pageH - marginTop - titleSize - 4} Tm`);
      lines.push(`${pdfLiteral(spec.subtitle)} Tj`);
      lines.push('ET');
    }

    // Page footer
    const pageLabel = `Page ${p + 1} of ${totalPages}`;
    const plW = stringWidth(pageLabel, bodySize);
    lines.push('BT');
    lines.push(`/F1 ${bodySize} Tf`);
    lines.push(`0.4 0.4 0.4 rg`);
    lines.push(`1 0 0 1 ${pageW - marginX - plW} ${marginBottom - 18} Tm`);
    lines.push(`${pdfLiteral(pageLabel)} Tj`);
    lines.push('ET');

    // Header background
    lines.push('0.113 0.184 0.470 rg');
    lines.push(`${marginX} ${bodyTop - headerH} ${pageW - 2 * marginX} ${headerH} re f`);

    // Header text
    lines.push('BT');
    lines.push(`/F2 ${headerSize} Tf`);
    lines.push('1 1 1 rg');
    const headerBaseline = bodyTop - headerH + 5;
    spec.columns.forEach((c, i) => {
      const text = truncateToWidth(c.header, c.width - 8, headerSize);
      lines.push(`1 0 0 1 ${colX[i] + 4} ${headerBaseline} Tm`);
      lines.push(`${pdfLiteral(text)} Tj`);
    });
    lines.push('ET');

    // Zebra rows
    for (let r = start; r < end; r++) {
      const localIdx = r - start;
      if (localIdx % 2 === 1) {
        lines.push('0.95 0.96 1 rg');
        const rowY = bodyTop - headerH - (localIdx + 1) * rowH;
        lines.push(`${marginX} ${rowY} ${pageW - 2 * marginX} ${rowH} re f`);
      }
    }

    // Row text
    lines.push('BT');
    lines.push(`/F1 ${bodySize} Tf`);
    lines.push('0.08 0.19 0.44 rg');
    for (let r = start; r < end; r++) {
      const localIdx = r - start;
      const row = spec.rows[r];
      const rowY = bodyTop - headerH - localIdx * rowH;
      const baseline = rowY - rowH + 4;
      spec.columns.forEach((c, i) => {
        const raw = row[i] ?? '';
        const text = truncateToWidth(raw, c.width - 8, bodySize);
        lines.push(`1 0 0 1 ${colX[i] + 4} ${baseline} Tm`);
        lines.push(`${pdfLiteral(text)} Tj`);
      });
    }
    lines.push('ET');

    // Divider under header
    lines.push('0.5 0.5 0.5 RG 0.5 w');
    lines.push(`${marginX} ${bodyTop - headerH} m ${pageW - marginX} ${bodyTop - headerH} l S`);

    const streamStr = lines.join('\n');
    const streamSafe = toLatin1Chars(streamStr);
    const streamObjId = addObj(
      `<< /Length ${streamSafe.length} >>\nstream\n${streamSafe}\nendstream`
    );

    const pageId = addObj(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
      `/Contents ${streamObjId} 0 R >>`
    );
    pageObjIds.push(pageId);
  }

  // Fill in Pages
  const kids = pageObjIds.map(id => `${id} 0 R`).join(' ');
  objects[1] = `<< /Type /Pages /Count ${pageObjIds.length} /Kids [${kids}] >>`;

  // Assemble file as Latin-1-chars string, then convert to bytes.
  const chunks: string[] = [];
  const offsets: number[] = [];
  let offset = 0;

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  chunks.push(header);
  offset += header.length;

  objects.forEach((body, i) => {
    const id = i + 1;
    offsets.push(offset);
    const chunk = `${id} 0 obj\n${body}\nendobj\n`;
    chunks.push(chunk);
    offset += chunk.length;
  });

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += off.toString().padStart(10, '0') + ' 00000 n \n';
  }
  chunks.push(xref);
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  );

  return latin1ToBytes(chunks.join(''));
}
