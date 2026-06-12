/* ============================================================
   xlsx-lite — a tiny .xlsx writer (no dependencies).
   buildXlsx(sheets) -> Uint8Array of a valid .xlsx file.
   sheets: [{ name, rows: [[cell, ...]] }]  (cell = string | number | "" )
   Styling is automatic: row 0 is a bold header; numeric cells get a
   thousands/2dp number format. Stored (uncompressed) ZIP container.
   ============================================================ */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// strip XML-1.0-illegal control chars (keep tab/LF/CR), then escape metacharacters
const CTRL = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;
function escapeXml(s){
  return String(s).replace(CTRL, "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[m]));
}
function colLetter(n){ // 0-based -> A, B, ... Z, AA
  let s = "";
  n += 1;
  while(n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function isNum(v){ return typeof v === "number" && isFinite(v); }

function sheetXml(rows){
  let out = XML_HEAD +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row, ri) => {
    out += `<row r="${ri + 1}">`;
    (row || []).forEach((val, ci) => {
      if(val === "" || val == null) return;
      const ref = colLetter(ci) + (ri + 1);
      const header = ri === 0;
      if(isNum(val)){
        out += `<c r="${ref}" s="${header ? 1 : 2}"><v>${val}</v></c>`;
      } else {
        out += `<c r="${ref}" s="${header ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`;
      }
    });
    out += "</row>";
  });
  out += "</sheetData></worksheet>";
  return out;
}

function stylesXml(){
  return XML_HEAD +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>' +
    '<fonts count="2">' +
      '<font><sz val="11"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '</fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border/></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

function buildParts(sheets){
  const safe = sheets.map((s, i) => ({
    name: (String(s.name || ("Sheet" + (i + 1))).replace(/[\\/?*[\]:]/g, " ").slice(0, 31)) || ("Sheet" + (i + 1)),
    rows: s.rows || []
  }));
  const parts = {};
  parts["[Content_Types].xml"] = XML_HEAD +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    '</Types>';
  parts["_rels/.rels"] = XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>';
  parts["xl/workbook.xml"] = XML_HEAD +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    safe.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    '</sheets></workbook>';
  parts["xl/_rels/workbook.xml.rels"] = XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${safe.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>';
  parts["xl/styles.xml"] = stylesXml();
  safe.forEach((s, i) => { parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s.rows); });
  return parts;
}

/* ---------- minimal stored ZIP ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for(let n = 0; n < 256; n++){ let c = n; for(let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes){
  let c = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function u16(n){ return [n & 0xFF, (n >>> 8) & 0xFF]; }
function u32(n){ return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }

export function buildXlsx(sheets){
  const parts = buildParts(sheets);
  const enc = new TextEncoder();
  const files = Object.keys(parts).map(name => ({ name, data: enc.encode(parts[name]) }));

  const chunks = [];
  const central = [];
  let offset = 0;
  for(const f of files){
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(f.data.length), u32(f.data.length),
      u16(nameBytes.length), u16(0)
    );
    chunks.push(new Uint8Array(local), nameBytes, f.data);
    central.push({ name: nameBytes, crc, size: f.data.length, offset });
    offset += local.length + nameBytes.length + f.data.length;
  }
  const cdStart = offset;
  let cdSize = 0;
  for(const c of central){
    const hdr = [].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(c.crc), u32(c.size), u32(c.size),
      u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
    );
    chunks.push(new Uint8Array(hdr), c.name);
    cdSize += hdr.length + c.name.length;
  }
  chunks.push(new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
    u32(cdSize), u32(cdStart), u16(0)
  )));

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for(const c of chunks){ out.set(c, p); p += c.length; }
  return out;
}
