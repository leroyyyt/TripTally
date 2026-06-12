import { describe, it, expect } from "vitest";
import { buildXlsx } from "../js/xlsx.js";

// UTF-8 decode: ZIP header bytes become replacement chars, but the XML text
// (including accents like "café") is preserved for substring checks.
const decode = (bytes) => new TextDecoder("utf-8").decode(bytes);

describe("buildXlsx", () => {
  const sheets = [
    { name: "Summary", rows: [["Trip", 'Japan "2026"'], ["Total", 42.5]] },
    { name: "Expenses", rows: [["Date", "Item", "Amount"], ["2026-03-01", "Lunch, café", 12.5]] }
  ];
  const bytes = buildXlsx(sheets);

  it("returns a non-trivial Uint8Array starting with the ZIP signature", () => {
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });
  it("ends with the End-Of-Central-Directory signature", () => {
    const tail = bytes.slice(bytes.length - 22);
    expect(tail[0]).toBe(0x50); expect(tail[1]).toBe(0x4b);
    expect(tail[2]).toBe(0x05); expect(tail[3]).toBe(0x06);
  });
  it("contains the required OOXML parts and sheet names", () => {
    const s = decode(bytes);
    expect(s).toContain("[Content_Types].xml");
    expect(s).toContain("xl/workbook.xml");
    expect(s).toContain("xl/styles.xml");
    expect(s).toContain("xl/worksheets/sheet1.xml");
    expect(s).toContain("xl/worksheets/sheet2.xml");
    expect(s).toContain('name="Summary"');
    expect(s).toContain('name="Expenses"');
  });
  it("escapes XML metacharacters and keeps numbers as <v>", () => {
    const s = decode(bytes);
    expect(s).toContain("Japan &quot;2026&quot;");
    expect(s).toContain("Lunch, café"); // utf-8 preserved
    expect(s).toContain("<v>12.5</v>");
    expect(s).toContain("<v>42.5</v>");
  });
  it("sanitises illegal sheet-name characters and caps length", () => {
    const out = buildXlsx([{ name: "a/b:c*[weird]name that is definitely way too long for excel", rows: [["x"]] }]);
    const s = decode(out);
    expect(s).not.toContain("a/b:c*");
    const m = s.match(/name="([^"]+)"/);
    expect(m[1].length).toBeLessThanOrEqual(31);
  });
});
