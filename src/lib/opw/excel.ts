import JSZip from "jszip";
import { linesToText, parseShoppingList } from "./parse-list";

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export async function buildTemplateXlsx(): Promise<Blob> {
  const rows = [
    ["貨品", "數量"],
    ["金象牌香米 5kg", "1"],
    ["可口可樂 330毫升", "2"],
    ["黃道益活絡油", "1"],
  ];
  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes());
  zip.file("_rels/.rels", rootRels());
  zip.file("xl/workbook.xml", workbook());
  zip.file("xl/_rels/workbook.xml.rels", workbookRels());
  zip.file("xl/worksheets/sheet1.xml", sheetXml(rows));
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function fileToShoppingText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type.startsWith("text/")) {
    return csvToText(await file.text());
  }
  const buf = await file.arrayBuffer();
  const head = new TextDecoder("utf-8").decode(buf.slice(0, 80));
  if (head.includes("Workbook") || head.includes("spreadsheet")) {
    return xmlSpreadsheetToText(new TextDecoder("utf-8").decode(buf));
  }
  if (head.startsWith("PK")) {
    return xlsxToText(buf);
  }
  return csvToText(new TextDecoder("utf-8").decode(buf));
}

function csvToText(raw: string): string {
  const lines: Array<{ query: string; qty: number }> = [];
  for (const row of parseCsv(raw)) {
    const mapped = rowToLine(row);
    if (mapped) lines.push(mapped);
  }
  return linesToText(lines.map((line, i) => ({ id: String(i), ...line })));
}

function rowToLine(row: string[]): { query: string; qty: number } | null {
  const cells = row.map((c) => c.trim()).filter((c, i) => i < 4);
  if (cells.length === 0) return null;
  const first = cells[0] ?? "";
  if (!first || /^(貨品|商品|名稱|item|name|product)$/i.test(first)) return null;
  let qty = 1;
  const qtyCell = cells[1]?.replace(/[件盒包罐支瓶袋]/g, "").trim();
  if (qtyCell && /^\d{1,2}$/.test(qtyCell)) qty = Number(qtyCell);
  const parsed = parseShoppingList(first)[0];
  return { query: parsed?.query ?? first, qty: parsed && parsed.qty > 1 ? parsed.qty : qty };
}

function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const shared = await readSharedStrings(zip);
  const sheetFile =
    zip.file("xl/worksheets/sheet1.xml") ??
    zip.file(/xl\/worksheets\/sheet\d+\.xml/)[0];
  if (!sheetFile) throw new Error("Excel 入面冇工作表");
  const xml = await sheetFile.async("string");
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1] ?? ""))) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const t = /t="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (t === "s") {
        const idx = Number(/<v>([^<]+)<\/v>/.exec(body)?.[1] ?? "");
        value = shared[idx] ?? "";
      } else if (t === "inlineStr") {
        value = decodeXml(/<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "");
      } else {
        value = decodeXml(/<v>([^<]+)<\/v>/.exec(body)?.[1] ?? "");
      }
      cells.push(value);
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  }
  const lines: Array<{ query: string; qty: number }> = [];
  for (const row of rows) {
    const mapped = rowToLine(row);
    if (mapped) lines.push(mapped);
  }
  return linesToText(lines.map((line, i) => ({ id: String(i), ...line })));
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) return [];
  const xml = await file.async("string");
  const out: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml))) {
    const texts = [...(match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)];
    out.push(texts.map((t) => decodeXml(t[1] ?? "")).join(""));
  }
  return out;
}

function xmlSpreadsheetToText(xml: string): string {
  const rows: string[][] = [];
  const rowRe = /<Row\b[^>]*>([\s\S]*?)<\/Row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml))) {
    const cells: string[] = [];
    const cellRe = /<Data\b[^>]*>([\s\S]*?)<\/Data>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1] ?? ""))) {
      cells.push(decodeXml(cellMatch[1] ?? ""));
    }
    if (cells.some((c) => c.trim())) rows.push(cells);
  }
  const lines: Array<{ query: string; qty: number }> = [];
  for (const row of rows) {
    const mapped = rowToLine(row);
    if (mapped) lines.push(mapped);
  }
  return linesToText(lines.map((line, i) => ({ id: String(i), ...line })));
}

function sheetXml(rows: string[][]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => {
          const ref = `${colName(c)}${r + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="${NS}"><sheetData>${body}</sheetData></worksheet>`;
}

function workbook(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="購物清單" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function workbookRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function contentTypes(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
}

function colName(index: number): string {
  return String.fromCharCode(65 + index);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
