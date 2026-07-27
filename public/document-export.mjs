const encoder = new TextEncoder();
const decoder = new TextDecoder();

function escapeXml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function safeFileName(value = "Village document") {
  return String(value || "Village document").trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 100) || "Village document";
}

export function downloadBlob(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1500);
}

export function htmlToText(html = "") {
  const page = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  page.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  page.querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,tr,blockquote,section,div").forEach((node) => node.append("\n"));
  return String(page.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

function documentHtml({ title, bodyHtml, headerHtml = "", footerHtml = "", watermark = "" }) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeXml(title)}</title><style>
    @page{margin:24mm 20mm}body{max-width:820px;margin:0 auto;color:#18392f;font:16px/1.65 Georgia,serif}
    header,footer{color:#5d6d66;font:13px/1.4 system-ui,sans-serif}header{border-bottom:1px solid #ccd7d1;padding-bottom:10px}
    footer{border-top:1px solid #ccd7d1;padding-top:10px}h1{font-size:2.1rem}h2{font-size:1.55rem}h3{font-size:1.2rem}
    table{width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #aebdb5}.doc-page-break{break-after:page;border:0}
    img,video{max-width:100%}.watermark{position:fixed;inset:42% 0 auto;z-index:-1;color:#d8dfdb;font:700 52px system-ui;text-align:center;transform:rotate(-24deg)}
  </style></head><body>${watermark ? `<div class="watermark">${escapeXml(watermark)}</div>` : ""}<header>${headerHtml}</header><h1>${escapeXml(title)}</h1><main>${bodyHtml}</main><footer>${footerHtml}</footer></body></html>`;
}

export function exportHtmlFile(documentData) {
  const html = documentHtml(documentData);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${safeFileName(documentData.title)}.html`);
}

export function exportTextFile(documentData) {
  downloadBlob(new Blob([htmlToText(documentData.bodyHtml)], { type: "text/plain;charset=utf-8" }), `${safeFileName(documentData.title)}.txt`);
}

export function printDocument(documentData) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) throw new Error("Allow pop-ups to print or save this document as PDF.");
  popup.document.write(documentHtml(documentData));
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 300);
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function zipStored(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === "string" ? encoder.encode(file.data) : file.data;
    const checksum = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }
  const centralBytes = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concatBytes([...localParts, centralBytes, end]);
}

function htmlBlocks(html = "") {
  const page = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
  const blocks = [];
  const candidates = [...page.querySelector("main").children];
  for (const node of candidates) {
    const tag = node.tagName.toLowerCase();
    if (tag === "table") {
      const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children].map((cell) => cell.textContent.trim()).join(" | ")).filter(Boolean);
      blocks.push(...rows.map((text) => ({ text, style: "" })));
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      blocks.push(...[...node.querySelectorAll(":scope > li")].map((item, index) => ({ text: `${tag === "ol" ? `${index + 1}.` : "•"} ${item.textContent.trim()}`, style: "" })));
      continue;
    }
    const style = /^h[1-6]$/.test(tag) ? `Heading${Math.min(3, Number(tag.slice(1)))}` : "";
    blocks.push({ text: node.textContent || "", style });
  }
  return blocks.length ? blocks : [{ text: page.body.textContent || "", style: "" }];
}

function docxParagraph({ text, style }) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

export function exportDocxFile({ title, bodyHtml }) {
  const body = htmlBlocks(bodyHtml).map(docxParagraph).join("");
  const files = [
    {
      name: "[Content_Types].xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
    },
    {
      name: "_rels/.rels",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    },
    {
      name: "word/document.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${docxParagraph({ text: title, style: "Title" })}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
    },
    {
      name: "word/styles.xml",
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>`
    }
  ];
  downloadBlob(new Blob([zipStored(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `${safeFileName(title)}.docx`);
}

async function inflateRaw(bytes) {
  if (!globalThis.DecompressionStream) throw new Error("This browser cannot decompress DOCX files.");
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function zipEntry(arrayBuffer, wantedName) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);
  let endOffset = -1;
  const lowerBound = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= lowerBound; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("This DOCX file has an invalid ZIP directory.");
  const entryCount = view.getUint16(endOffset + 10, true);
  let offset = view.getUint32(endOffset + 16, true);
  for (let index = 0; index < entryCount && offset + 46 <= bytes.length; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    if (name === wantedName) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("This DOCX file has a damaged document entry.");
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(start, start + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRaw(compressed);
      throw new Error("Unsupported DOCX compression.");
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("This DOCX file does not contain a readable document body.");
}

function markdownToHtml(markdown = "") {
  const inline = (value) => escapeXml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[(.+?)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2">$1</a>');
  return String(markdown).split(/\r?\n/).map((line) => {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading) return `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    const bullet = line.match(/^[-*+]\s+(.+)/);
    if (bullet) return `<p>• ${inline(bullet[1])}</p>`;
    const numbered = line.match(/^\d+\.\s+(.+)/);
    if (numbered) return `<p>${inline(line)}</p>`;
    return line.trim() ? `<p>${inline(line)}</p>` : "<p><br></p>";
  }).join("");
}

export async function importDocumentFile(file) {
  if (!file) throw new Error("Choose a document to import.");
  if (file.size > 5_000_000) throw new Error("Choose a document smaller than 5 MB.");
  const extension = String(file.name.split(".").pop() || "").toLowerCase();
  if (extension === "docx") {
    const xmlBytes = await zipEntry(await file.arrayBuffer(), "word/document.xml");
    const xml = new DOMParser().parseFromString(decoder.decode(xmlBytes), "application/xml");
    const paragraphs = [...xml.getElementsByTagNameNS("*", "p")].map((paragraph) => {
      const text = [...paragraph.getElementsByTagNameNS("*", "t")].map((node) => node.textContent || "").join("");
      const style = paragraph.getElementsByTagNameNS("*", "pStyle")[0]?.getAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "val")
        || paragraph.getElementsByTagNameNS("*", "pStyle")[0]?.getAttribute("w:val") || "";
      const tag = /^Heading([1-3])$/i.test(style) ? `h${style.match(/\d/)[0]}` : style === "Title" ? "h1" : "p";
      return `<${tag}>${escapeXml(text) || "<br>"}</${tag}>`;
    }).join("");
    return { title: safeFileName(file.name.replace(/\.docx$/i, "")), html: paragraphs || "<p><br></p>", sourceType: "docx" };
  }
  const text = await file.text();
  if (extension === "html" || extension === "htm") {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    return { title: safeFileName(file.name.replace(/\.html?$/i, "")), html: parsed.body.innerHTML, sourceType: "html" };
  }
  if (extension === "md" || extension === "markdown") return { title: safeFileName(file.name.replace(/\.(?:md|markdown)$/i, "")), html: markdownToHtml(text), sourceType: "markdown" };
  return { title: safeFileName(file.name.replace(/\.[^.]+$/, "")), html: text.split(/\r?\n/).map((line) => `<p>${escapeXml(line) || "<br>"}</p>`).join(""), sourceType: "text" };
}

export function readFileDataUrl(file, maxBytes = 600000) {
  if (!file) return Promise.resolve("");
  if (file.size > maxBytes) return Promise.reject(new Error(`Choose a file smaller than ${Math.round(maxBytes / 1000)} KB.`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("The selected file could not be read."));
    reader.readAsDataURL(file);
  });
}
