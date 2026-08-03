import {
  downloadBlob,
  exportDocxFile,
  exportHtmlFile,
  exportTextFile,
  htmlToText,
  importDocumentFile,
  printDocument,
  readFileDataUrl,
  safeFileName
} from "./document-export.mjs?v=village-docs-20260727";

const ICONS = {
  back: "M15 18l-6-6 6-6M9 12h12",
  close: "M6 6l12 12M18 6 6 18",
  save: "M5 4h12l2 2v14H5zM8 4v6h8V4M8 20v-7h8v7",
  share: "M16 6l-4-4-4 4M12 2v13M5 12v8h14v-8",
  comment: "M4 5h16v11H8l-4 4z",
  history: "M3 12a9 9 0 1 0 3-6M3 3v6h6M12 7v5l3 2",
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 5 5",
  folder: "M3 6h7l2 2h9v11H3z",
  file: "M6 2h8l4 4v16H6zM14 2v5h5",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  download: "M12 4v12M7 11l5 5 5-5M4 20h16",
  print: "M6 9V3h12v6M6 17H4V9h16v8h-2M7 14h10v8H7z",
  trash: "M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14",
  star: "m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-4M16 3a4 4 0 0 1 0 8",
  lock: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  link: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1",
  image: "M3 4h18v16H3zM7 8h.01M3 16l5-5 4 4 3-3 6 6",
  table: "M3 4h18v16H3zM3 10h18M9 4v16M15 4v16",
  microphone: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8",
  sparkles: "M12 3l1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z",
  check: "m5 12 4 4L19 6",
  signature: "M3 18c3-7 5-11 7-11 2 0-1 9 1 9 2 0 3-5 5-5 2 0-1 5 1 5h4",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 12H2M22 12h-2M12 4V2M12 22v-2M6 6 4.5-1.5M18 18l1.5 1.5M18 6l1.5-1.5M6 18l-1.5 1.5"
};

const TEMPLATES = [
  { key: "blank", label: "Blank document", detail: "A clean page for any idea", kind: "doc", html: "<p><br></p>" },
  { key: "resume", label: "Resume", detail: "Profile, experience, education, and skills", kind: "doc", html: "<h1>Your Name</h1><p>Role or professional focus</p><h2>Profile</h2><p>Write a short professional summary.</p><h2>Experience</h2><h3>Position · Organization</h3><p>Describe your work and results.</p><h2>Education</h2><p>School · Program · Year</p><h2>Skills</h2><ul><li>Skill or strength</li></ul>" },
  { key: "report", label: "Report", detail: "Executive summary, findings, and recommendations", kind: "doc", html: "<h1>Report title</h1><p><strong>Prepared for:</strong> </p><p><strong>Date:</strong> </p><h2>Executive summary</h2><p>Summarize the purpose and main conclusion.</p><h2>Background</h2><p>Provide context.</p><h2>Findings</h2><ol><li>Finding one</li><li>Finding two</li></ol><h2>Recommendations</h2><p>Describe practical next steps.</p>" },
  { key: "meeting", label: "Meeting notes", detail: "Agenda, decisions, and assigned actions", kind: "doc", html: "<h1>Meeting notes</h1><p><strong>Date:</strong> </p><p><strong>Attendees:</strong> </p><h2>Agenda</h2><ol><li>Topic</li></ol><h2>Discussion</h2><p>Capture key points.</p><h2>Decisions</h2><ul><li>Decision</li></ul><h2>Action items</h2><table><tbody><tr><th>Task</th><th>Owner</th><th>Due date</th></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table>" },
  { key: "project", label: "Project plan", detail: "Goals, milestones, risks, and responsibilities", kind: "doc", html: "<h1>Project plan</h1><h2>Goal</h2><p>What should this project achieve?</p><h2>Scope</h2><p>Included work and boundaries.</p><h2>Milestones</h2><table><tbody><tr><th>Milestone</th><th>Owner</th><th>Target</th><th>Status</th></tr><tr><td><br></td><td><br></td><td><br></td><td>Planned</td></tr></tbody></table><h2>Risks</h2><ul><li>Risk and response</li></ul>" },
  { key: "contract", label: "Agreement", detail: "Parties, terms, signatures, and approval", kind: "pdf", html: "<h1>Agreement</h1><p>This agreement is between <strong>Party A</strong> and <strong>Party B</strong>.</p><h2>Purpose</h2><p>Describe the purpose.</p><h2>Terms</h2><ol><li>Term one</li><li>Term two</li></ol><h2>Signatures</h2><p>Party A: ____________________</p><p>Party B: ____________________</p>" },
  { key: "application", label: "Application form", detail: "Collect names, contact details, and responses", kind: "form", html: "<h1>Application</h1><p>Please complete each field. Your responses will be shared with the document owner.</p>", questions: ["Full name", "Email address", "What are you applying for?", "Anything else we should know?"] },
  { key: "letter", label: "Letter", detail: "A structured personal or professional letter", kind: "doc", html: "<p>Date</p><p>Recipient name<br>Organization<br>Address</p><p>Dear Recipient,</p><p>Write your message here.</p><p>Sincerely,</p><p>Your name</p>" }
];

function icon(name, label = "") {
  const path = ICONS[name] || ICONS.file;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>${label ? `<span>${escapeHtml(label)}</span>` : ""}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function safeUrl(value = "") {
  const url = String(value || "").trim();
  if (/^(?:https?:|mailto:|tel:|#|data:(?:image|audio|video|application\/pdf|text\/plain)\/?)/i.test(url)) return url;
  return "";
}

export function sanitizeDocumentHtml(html = "") {
  const parsed = new DOMParser().parseFromString(`<main>${String(html || "")}</main>`, "text/html");
  const root = parsed.querySelector("main");
  const allowed = new Set(["A", "AUDIO", "BLOCKQUOTE", "BR", "CODE", "DEL", "DIV", "EM", "FIGCAPTION", "FIGURE", "H1", "H2", "H3", "H4", "H5", "H6", "HR", "IMG", "INS", "LI", "MARK", "OL", "P", "PRE", "SECTION", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TH", "THEAD", "TR", "U", "UL", "VIDEO"]);
  const stylePattern = /^(?:(?:text-align|line-height|margin-left|padding-left|color|background-color|font-family|font-size|font-weight|font-style|text-decoration|width|height|max-width|border|border-collapse|vertical-align|display|grid-template-columns|gap|page-break-after|break-after)\s*:\s*[^;{}]+;?\s*)*$/i;
  for (const element of [...root.querySelectorAll("*")]) {
    if (!allowed.has(element.tagName)) {
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON"].includes(element.tagName)) element.remove();
      else element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const keepData = /^data-(?:bookmark|formula|chart|attachment-name|attachment-mime|suggestion|author|timestamp)$/.test(name);
      if (name.startsWith("on")) element.removeAttribute(attribute.name);
      else if (name === "href" || name === "src") {
        const value = safeUrl(attribute.value);
        if (value) element.setAttribute(attribute.name, value);
        else element.removeAttribute(attribute.name);
      } else if (name === "style") {
        if (!stylePattern.test(attribute.value) || /url\s*\(|expression\s*\(/i.test(attribute.value)) element.removeAttribute("style");
      } else if (!["id", "class", "title", "alt", "controls", "colspan", "rowspan", "target", "rel", "contenteditable"].includes(name) && !keepData) {
        element.removeAttribute(attribute.name);
      }
    }
    if (element.tagName === "A") {
      element.setAttribute("rel", "noopener noreferrer");
      if (!String(element.getAttribute("href") || "").startsWith("#")) element.setAttribute("target", "_blank");
    }
  }
  return root.innerHTML;
}

function relativeTime(value) {
  const date = new Date(value);
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function deriveEncryptionKey(password, salt) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: 180000, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

async function encryptContent(content, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(password, salt);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(content)));
  return { algorithm: "AES-GCM", salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) };
}

async function decryptContent(payload, password) {
  const key = await deriveEncryptionKey(password, base64ToBytes(payload.salt));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(payload.iv) }, key, base64ToBytes(payload.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

function lineDiff(before = "", after = "") {
  const a = String(before).split(/\r?\n/);
  const b = String(after).split(/\r?\n/);
  const rows = [];
  const size = Math.max(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    if (a[index] === b[index]) rows.push(`<div class="doc-diff-same">${escapeHtml(a[index] || "")}</div>`);
    else {
      if (a[index] !== undefined) rows.push(`<del>${escapeHtml(a[index])}</del>`);
      if (b[index] !== undefined) rows.push(`<ins>${escapeHtml(b[index])}</ins>`);
    }
  }
  return rows.join("");
}

export class VillageDocumentStudio {
  constructor({ api, getUser, canChatWrite = () => true, toast, onClose = () => {} }) {
    this.api = api;
    this.getUser = getUser;
    this.canChatWrite = canChatWrite;
    this.toast = toast;
    this.onClose = onClose;
    this.documents = [];
    this.folders = [];
    this.workspace = null;
    this.active = null;
    this.roomId = "";
    this.view = "active";
    this.folderId = "";
    this.search = "";
    this.mode = "edit";
    this.panel = "outline";
    this.dirty = false;
    this.saving = false;
    this.selectionRange = null;
    this.autosaveTimer = null;
    this.presenceTimer = null;
    this.syncTimer = null;
    this.sessionId = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.encryptionPassword = "";
    this.lastKnownUpdatedAt = "";
    this.boundSelection = () => this.captureSelection();
  }

  get overlay() {
    return document.querySelector("#village-document-studio");
  }

  async openHub({ roomId = "" } = {}) {
    this.roomId = roomId;
    this.stopLiveSync();
    this.active = null;
    this.workspace = null;
    await this.loadLibrary();
    this.renderHub();
  }

  async createKind(kind, { roomId = "" } = {}) {
    this.roomId = roomId;
    const templateKey = kind === "pdf" ? "contract" : kind === "form" ? "application" : "blank";
    await this.createFromTemplate(templateKey);
  }

  async loadLibrary() {
    const query = new URLSearchParams({ view: this.view });
    if (this.search) query.set("search", this.search);
    if (this.folderId) query.set("folderId", this.folderId);
    const [documents, folders] = await Promise.all([
      this.api(`/api/community/documents?${query}`),
      this.api("/api/community/document-folders").catch(() => ({ folders: [] }))
    ]);
    this.documents = documents.documents || [];
    this.folders = folders.folders || [];
  }

  ensureOverlay() {
    let overlay = this.overlay;
    if (!overlay) {
      overlay = document.createElement("section");
      overlay.id = "village-document-studio";
      overlay.className = "village-document-studio";
      overlay.setAttribute("aria-label", "Village Document Studio");
      overlay.addEventListener("click", (event) => this.handleClick(event));
      overlay.addEventListener("change", (event) => this.handleChange(event));
      overlay.addEventListener("input", (event) => this.handleInput(event));
      overlay.addEventListener("submit", (event) => this.handleSubmit(event));
      overlay.addEventListener("keydown", (event) => this.handleKeydown(event));
      overlay.addEventListener("beforeinput", (event) => this.handleBeforeInput(event));
      overlay.addEventListener("copy", (event) => {
        if (this.active && !this.active.mine && this.active.restrictions?.copy) {
          event.preventDefault();
          this.toast("The owner disabled copying for this document.");
        }
      });
      document.body.append(overlay);
    }
    return overlay;
  }

  hubHeader() {
    return `<header class="doc-studio-header">
      <div class="doc-studio-brand"><span>${icon("file")}</span><div><small>IT TAKES A VILLAGE</small><strong>Document Studio</strong></div></div>
      <label class="doc-library-search">${icon("search")}<input type="search" value="${escapeHtml(this.search)}" placeholder="Search documents" data-doc-search></label>
      <div class="doc-header-actions"><label class="doc-icon-button" title="Import Word, text, Markdown, or HTML">${icon("upload")}<input type="file" accept=".docx,.txt,.md,.markdown,.html,.htm" data-doc-import></label><button type="button" class="doc-icon-button" data-doc-action="close" title="Close">${icon("close")}</button></div>
    </header>`;
  }

  folderRows() {
    return this.folders.map((folder) => `<button type="button" class="${this.folderId === folder.id ? "active" : ""}" data-doc-action="open-folder" data-folder-id="${escapeHtml(folder.id)}">${icon("folder")}<span>${escapeHtml(folder.name)}</span><small>${folder.documentCount}</small></button>`).join("");
  }

  documentRows() {
    if (!this.documents.length) return `<div class="doc-library-empty">${icon(this.view === "trash" ? "trash" : "file")}<strong>${this.view === "trash" ? "Trash is empty" : "No documents here yet"}</strong><p>Create one from a template or import a file.</p></div>`;
    return this.documents.map((item) => `<article class="doc-library-row">
      <button type="button" class="doc-library-kind" data-doc-action="open-document" data-document-id="${escapeHtml(item.id)}" aria-label="Open ${escapeHtml(item.title)}">${escapeHtml(String(item.kind || "doc").toUpperCase())}</button>
      <button type="button" class="doc-library-title" data-doc-action="open-document" data-document-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.mine ? "Yours" : `Shared by ${item.ownerName || "Village member"}`)} · ${escapeHtml(relativeTime(item.updatedAt))}${item.versionNumber ? ` · v${item.versionNumber}` : ""}</small></button>
      <span class="doc-library-owner">${escapeHtml(item.permission === "owner" ? "Owner" : item.permission)}</span>
      <button type="button" class="doc-icon-button ${item.favorite ? "active" : ""}" data-doc-action="toggle-favorite" data-document-id="${escapeHtml(item.id)}" data-favorite="${String(!item.favorite)}" title="${item.favorite ? "Remove favorite" : "Add favorite"}">${icon("star")}</button>
      <details class="doc-row-menu"><summary aria-label="Document options">${icon("more")}</summary>
        ${item.mine && this.view !== "trash" ? `<button type="button" data-doc-action="rename-document" data-document-id="${escapeHtml(item.id)}">Rename</button><button type="button" data-doc-action="move-document" data-document-id="${escapeHtml(item.id)}">Move</button><button type="button" data-doc-action="trash-document" data-document-id="${escapeHtml(item.id)}">Move to trash</button>` : ""}
        ${item.mine && this.view === "trash" ? `<button type="button" data-doc-action="restore-document" data-document-id="${escapeHtml(item.id)}">Restore</button><button type="button" class="danger" data-doc-action="delete-document-permanently" data-document-id="${escapeHtml(item.id)}">Delete forever</button>` : ""}
      </details>
    </article>`).join("");
  }

  renderHub() {
    const overlay = this.ensureOverlay();
    overlay.className = "village-document-studio library-mode";
    const activeLabel = this.folderId ? this.folders.find((folder) => folder.id === this.folderId)?.name || "Folder" : this.view === "trash" ? "Trash" : this.view === "favorites" ? "Favorites" : "All documents";
    overlay.innerHTML = `${this.hubHeader()}<div class="doc-library-layout">
      <aside class="doc-library-sidebar">
        <button type="button" class="doc-new-button" data-doc-action="new-document">${icon("plus")}<span>New document</span></button>
        <nav>
          <button type="button" class="${this.view === "active" && !this.folderId ? "active" : ""}" data-doc-action="library-view" data-view="active">${icon("file")}<span>All documents</span></button>
          <button type="button" class="${this.view === "favorites" ? "active" : ""}" data-doc-action="library-view" data-view="favorites">${icon("star")}<span>Favorites</span></button>
          <button type="button" class="${this.view === "trash" ? "active" : ""}" data-doc-action="library-view" data-view="trash">${icon("trash")}<span>Trash</span></button>
        </nav>
        <div class="doc-folder-heading"><strong>Folders</strong><button type="button" data-doc-action="new-folder" title="Create folder">${icon("plus")}</button></div>
        <nav class="doc-folder-list">${this.folderRows() || `<small>No folders yet.</small>`}</nav>
      </aside>
      <main class="doc-library-main">
        <header><div><small>CLOUD WORKSPACE</small><h1>${escapeHtml(activeLabel)}</h1><p>Autosaved Village documents, forms, and printable pages.</p></div><button type="button" class="doc-primary-button" data-doc-action="new-document">${icon("plus")}<span>Create</span></button></header>
        <div class="doc-library-columns"><span>Name</span><span>Access</span><span></span><span></span></div>
        <section class="doc-library-list">${this.documentRows()}</section>
      </main>
    </div>`;
  }

  showModal({ title, body, wide = false }) {
    this.overlay?.querySelector(".doc-modal-layer")?.remove();
    const layer = document.createElement("div");
    layer.className = "doc-modal-layer";
    layer.innerHTML = `<section class="doc-modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header><h2>${escapeHtml(title)}</h2><button type="button" class="doc-icon-button" data-doc-action="close-modal">${icon("close")}</button></header><div>${body}</div></section>`;
    this.overlay.append(layer);
    layer.querySelector("input,textarea,button")?.focus();
  }

  closeModal() {
    this.overlay?.querySelector(".doc-modal-layer")?.remove();
  }

  openTemplatePicker() {
    this.showModal({
      title: "Create a Village document",
      wide: true,
      body: `<div class="doc-template-grid">${TEMPLATES.map((template) => `<button type="button" data-doc-action="create-template" data-template-key="${template.key}"><span>${escapeHtml(template.kind.toUpperCase())}</span><strong>${escapeHtml(template.label)}</strong><small>${escapeHtml(template.detail)}</small></button>`).join("")}</div>`
    });
  }

  async createFromTemplate(templateKey) {
    if (this.roomId && !this.canChatWrite()) {
      this.toast("Creating and sharing a document in chat is unavailable while your Community chat mute is active.");
      return;
    }
    const template = TEMPLATES.find((item) => item.key === templateKey) || TEMPLATES[0];
    const result = await this.api("/api/community/documents", {
      method: "POST",
      body: JSON.stringify({
        kind: template.kind,
        title: template.label,
        templateKey: template.key,
        folderId: this.folderId,
        content: {
          html: sanitizeDocumentHtml(template.html),
          plainText: htmlToText(template.html),
          headerHtml: "",
          footerHtml: "",
          questions: template.questions || []
        },
        settings: { pageSize: "a4", orientation: "portrait", lineSpacing: "1.5", mode: "edit", security: {} }
      })
    });
    if (this.roomId) await this.api(`/api/community/documents/${encodeURIComponent(result.document.id)}/share`, { method: "POST", body: JSON.stringify({ roomId: this.roomId }) });
    this.closeModal();
    await this.openDocument(result.document.id);
  }

  async importFile(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const imported = await importDocumentFile(file);
      const result = await this.api("/api/community/documents", {
        method: "POST",
        body: JSON.stringify({
          kind: "doc",
          title: imported.title,
          templateKey: `import-${imported.sourceType}`,
          folderId: this.folderId,
          content: { html: sanitizeDocumentHtml(imported.html), plainText: htmlToText(imported.html), headerHtml: "", footerHtml: "", questions: [] },
          settings: { pageSize: "a4", orientation: "portrait", lineSpacing: "1.5", mode: "edit", security: {} }
        })
      });
      this.toast(`${file.name} imported.`);
      await this.openDocument(result.document.id);
    } catch (error) { this.toast(error.message); }
  }

  async openDocument(documentId) {
    this.stopLiveSync();
    const workspace = await this.api(`/api/community/documents/${encodeURIComponent(documentId)}/workspace`);
    this.workspace = workspace;
    this.active = workspace.document;
    this.lastKnownUpdatedAt = this.active.updatedAt || "";
    this.mode = this.active.canEdit ? this.active.settings?.mode || "edit" : "view";
    if (this.active.encrypted && this.active.content?.encryptedPayload) {
      const password = prompt("Enter the password for this encrypted document:");
      if (!password) return this.openHub({ roomId: this.roomId });
      try {
        this.active.content = await decryptContent(this.active.content.encryptedPayload, password);
        this.encryptionPassword = password;
      } catch {
        this.toast("That document password is incorrect.");
        return this.openHub({ roomId: this.roomId });
      }
    }
    this.renderEditor();
    this.startLiveSync();
  }

  async openPublic(token) {
    this.stopLiveSync();
    const data = await this.api(`/api/community/public-documents/${encodeURIComponent(token)}`);
    this.workspace = { document: { ...data.document, permission: "viewer", mine: false, canEdit: false, canComment: false }, versions: [], comments: [], collaborators: [], presence: [], approvals: [], signatures: [], integrations: [], audit: [] };
    this.active = this.workspace.document;
    this.mode = "view";
    if (this.active.encrypted && this.active.content?.encryptedPayload) {
      const password = prompt("Enter the password for this encrypted document:");
      if (!password) return;
      try { this.active.content = await decryptContent(this.active.content.encryptedPayload, password); }
      catch { return this.toast("That document password is incorrect."); }
    }
    this.renderEditor({ publicView: true });
  }

  editorHeader(publicView = false) {
    const presence = (this.workspace?.presence || []).slice(0, 5);
    return `<header class="doc-editor-header">
      <button type="button" class="doc-icon-button" data-doc-action="${publicView ? "close" : "back-library"}" title="${publicView ? "Close" : "Back to documents"}">${icon(publicView ? "close" : "back")}</button>
      <span class="doc-editor-filemark">${icon("file")}</span>
      <div class="doc-title-wrap"><input value="${escapeHtml(this.active.title)}" maxlength="180" data-doc-title ${this.active.canEdit ? "" : "readonly"} aria-label="Document title"><small data-doc-save-status>${this.active.canEdit ? "Saved to Village cloud" : `Shared by ${escapeHtml(this.active.ownerName || "Village member")}`}</small></div>
      <div class="doc-presence" aria-label="People editing">${presence.map((person) => `<span title="${escapeHtml(person.name)}">${person.avatarDataUrl ? `<img src="${escapeHtml(person.avatarDataUrl)}" alt="">` : escapeHtml(String(person.name || "V").charAt(0))}</span>`).join("")}</div>
      ${this.active.canComment ? `<button type="button" class="doc-header-button" data-doc-panel="comments">${icon("comment")}<span>Comments</span>${(this.workspace.comments || []).filter((comment) => comment.status !== "resolved").length ? `<b>${(this.workspace.comments || []).filter((comment) => comment.status !== "resolved").length}</b>` : ""}</button>` : ""}
      ${this.active.mine ? `<button type="button" class="doc-header-button primary" data-doc-panel="share">${icon("share")}<span>Share</span></button>` : ""}
      ${this.active.canEdit ? `<button type="button" class="doc-icon-button" data-doc-action="save-version" title="Save named version">${icon("save")}</button>` : ""}
    </header>`;
  }

  editorMenus() {
    const editable = this.active.canEdit && this.mode !== "view";
    return `<div class="doc-menu-bar">
      <details><summary>File</summary><button data-doc-action="save-version">Save version</button><button data-doc-action="export-docx">Download DOCX</button><button data-doc-action="export-pdf">Download PDF</button><button data-doc-action="export-txt">Download TXT</button><button data-doc-action="export-html">Download HTML</button><button data-doc-action="print-document">Print</button></details>
      <details><summary>Edit</summary><button data-doc-command="undo">Undo</button><button data-doc-command="redo">Redo</button><button data-doc-command="cut">Cut</button><button data-doc-command="copy">Copy</button><button data-doc-command="paste">Paste</button><button data-doc-command="delete">Delete selection</button><button data-doc-action="find-replace">Find and replace</button></details>
      <details><summary>Insert</summary><button data-doc-action="insert-image">Image</button><button data-doc-action="insert-table">Table</button><button data-doc-action="insert-link">Link</button><button data-doc-action="insert-chart">Chart</button><button data-doc-action="insert-formula">Formula</button><button data-doc-action="insert-symbol">Symbol</button><button data-doc-action="insert-media">Video, audio, or attachment</button><button data-doc-action="insert-page-break">Page break</button><button data-doc-action="insert-section-break">Section break</button><button data-doc-action="insert-bookmark">Bookmark</button><button data-doc-action="insert-internal-link">Internal link</button></details>
      <details><summary>Structure</summary><button data-doc-action="insert-toc">Insert or refresh contents</button><button data-doc-action="toggle-header">Header</button><button data-doc-action="toggle-footer">Footer</button><button data-doc-action="toggle-page-number">Page numbers</button><button data-doc-action="document-layout">Page setup</button></details>
      <details><summary>Tools</summary><button data-doc-action="word-count">Word count</button><button data-doc-action="spellcheck">Spelling and grammar</button><button data-doc-action="voice-input">Voice typing</button><button data-doc-panel="ai">AI writing tools</button><button data-doc-panel="forms">Form fields and responses</button></details>
      <details><summary>Collaborate</summary><button data-doc-panel="comments">Comments and tasks</button><button data-doc-panel="versions">Version history</button><button data-doc-panel="approvals">Approval workflow</button><button data-doc-panel="signatures">Electronic signatures</button><button data-doc-panel="audit">Access record</button></details>
      <details><summary>Security</summary><button data-doc-panel="security">Encryption, expiry, watermark</button><button data-doc-panel="share">Sharing and permissions</button></details>
      <details><summary>Extensions</summary><button data-doc-panel="integrations">Plugins and API integrations</button></details>
      ${!editable ? `<span class="doc-readonly-label">${this.mode === "view" ? "View only" : escapeHtml(this.active.permission)}</span>` : ""}
    </div>`;
  }

  editorToolbar() {
    const disabled = !this.active.canEdit || this.mode === "view" ? "disabled" : "";
    return `<div class="doc-format-toolbar" role="toolbar" aria-label="Document formatting">
      <button type="button" data-doc-command="undo" title="Undo" ${disabled}>${icon("back")}</button>
      <button type="button" data-doc-command="redo" class="flip" title="Redo" ${disabled}>${icon("back")}</button>
      <span class="doc-toolbar-divider"></span>
      <select data-doc-format="formatBlock" aria-label="Paragraph style" ${disabled}><option value="p">Normal text</option><option value="h1">Title</option><option value="h2">Heading 1</option><option value="h3">Heading 2</option><option value="h4">Heading 3</option><option value="blockquote">Quote</option></select>
      <select data-doc-format="fontName" aria-label="Font" ${disabled}><option>Arial</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>Courier New</option><option>Trebuchet MS</option></select>
      <select data-doc-format="fontSize" aria-label="Font size" ${disabled}><option value="2">10</option><option value="3" selected>12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option></select>
      <input type="color" value="#18392f" data-doc-format="foreColor" aria-label="Text color" ${disabled}>
      <span class="doc-toolbar-divider"></span>
      <button type="button" class="doc-format-letter" data-doc-command="bold" title="Bold" ${disabled}><strong>B</strong></button>
      <button type="button" class="doc-format-letter" data-doc-command="italic" title="Italic" ${disabled}><em>I</em></button>
      <button type="button" class="doc-format-letter" data-doc-command="underline" title="Underline" ${disabled}><u>U</u></button>
      <button type="button" data-doc-command="justifyLeft" title="Align left" ${disabled}>L</button>
      <button type="button" data-doc-command="justifyCenter" title="Align center" ${disabled}>C</button>
      <button type="button" data-doc-command="justifyRight" title="Align right" ${disabled}>R</button>
      <button type="button" data-doc-command="insertUnorderedList" title="Bulleted list" ${disabled}>•</button>
      <button type="button" data-doc-command="insertOrderedList" title="Numbered list" ${disabled}>1.</button>
      <button type="button" data-doc-command="outdent" title="Decrease indent" ${disabled}>←</button>
      <button type="button" data-doc-command="indent" title="Increase indent" ${disabled}>→</button>
      <select data-doc-line-spacing aria-label="Line spacing" ${disabled}><option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5" selected>1.5</option><option value="2">2.0</option></select>
      <span class="doc-toolbar-spacer"></span>
      <div class="doc-mode-switch" aria-label="Editing mode">
        <button type="button" data-doc-action="set-mode" data-mode="edit" class="${this.mode === "edit" ? "active" : ""}" ${this.active.canEdit ? "" : "disabled"}>Edit</button>
        <button type="button" data-doc-action="set-mode" data-mode="suggest" class="${this.mode === "suggest" ? "active" : ""}" ${this.active.canEdit ? "" : "disabled"}>Suggest</button>
        <button type="button" data-doc-action="set-mode" data-mode="view" class="${this.mode === "view" ? "active" : ""}">View</button>
      </div>
    </div>`;
  }

  outlineHtml() {
    const html = this.active.content?.html || "<p><br></p>";
    const parsed = new DOMParser().parseFromString(`<main>${html}</main>`, "text/html");
    const headings = [...parsed.querySelectorAll("h1,h2,h3,h4")];
    return headings.map((heading, index) => `<button type="button" class="level-${heading.tagName.slice(1)}" data-doc-action="jump-heading" data-heading-index="${index}">${escapeHtml(heading.textContent || `Heading ${index + 1}`)}</button>`).join("") || `<p>Add headings to build the outline.</p>`;
  }

  renderEditor({ publicView = false } = {}) {
    const overlay = this.ensureOverlay();
    overlay.className = "village-document-studio editor-mode";
    const content = this.active.content || {};
    const settings = this.active.settings || {};
    const editable = this.active.canEdit && this.mode !== "view";
    const pageClass = `${settings.pageSize || "a4"} ${settings.orientation || "portrait"}`;
    overlay.innerHTML = `${this.editorHeader(publicView)}${this.editorMenus()}${this.editorToolbar()}
      <div class="doc-editor-layout">
        <aside class="doc-outline-panel"><header><strong>Document outline</strong></header><nav data-doc-outline>${this.outlineHtml()}</nav></aside>
        <main class="doc-canvas">
          <article class="doc-page ${escapeHtml(pageClass)} ${this.active.watermark ? "has-watermark" : ""}" data-doc-page>
            ${this.active.watermark ? `<div class="doc-watermark">${escapeHtml(this.active.watermark)}</div>` : ""}
            <header class="doc-page-header ${settings.showHeader === false ? "hidden" : ""}" contenteditable="${editable}" data-doc-header>${sanitizeDocumentHtml(content.headerHtml || "")}</header>
            <section class="doc-editable" contenteditable="${editable}" spellcheck="true" data-doc-editor style="line-height:${escapeHtml(settings.lineSpacing || "1.5")}">${sanitizeDocumentHtml(content.html || content.body?.split(/\n/).map((line) => `<p>${escapeHtml(line) || "<br>"}</p>`).join("") || "<p><br></p>")}</section>
            <footer class="doc-page-footer ${settings.showFooter === false ? "hidden" : ""}" contenteditable="${editable}" data-doc-footer>${sanitizeDocumentHtml(content.footerHtml || "")}<span class="doc-page-number ${settings.showPageNumber ? "" : "hidden"}">1</span></footer>
          </article>
          ${this.active.kind === "form" && !this.active.mine ? this.formResponseHtml() : ""}
        </main>
        <aside class="doc-tool-drawer ${this.panel === "outline" ? "" : "open"}" data-doc-drawer>${this.drawerHtml(this.panel)}</aside>
      </div>
      <footer class="doc-status-bar"><span data-doc-word-count>0 words</span><span data-doc-page-count>1 page</span><span>${escapeHtml(this.active.kind.toUpperCase())}</span><span>${escapeHtml(this.active.permission || "viewer")}</span><span class="doc-status-spacer"></span><span data-doc-live-status>${editable ? "Autosave on" : "Read only"}</span></footer>
      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-doc-image-input hidden>
      <input type="file" accept="image/*,audio/*,video/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" data-doc-media-input hidden>`;
    document.addEventListener("selectionchange", this.boundSelection);
    this.updateDocumentMetrics();
  }

  drawerHtml(panel) {
    if (panel === "comments") return this.commentsPanelHtml();
    if (panel === "versions") return this.versionsPanelHtml();
    if (panel === "share") return this.sharePanelHtml();
    if (panel === "ai") return this.aiPanelHtml();
    if (panel === "security") return this.securityPanelHtml();
    if (panel === "approvals") return this.approvalsPanelHtml();
    if (panel === "signatures") return this.signaturesPanelHtml();
    if (panel === "audit") return this.auditPanelHtml();
    if (panel === "integrations") return this.integrationsPanelHtml();
    if (panel === "forms") return this.formsPanelHtml();
    return `<header><strong>Outline</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><p>Use headings to organize this document. The outline on the left updates while you write.</p><button type="button" class="doc-secondary-button" data-doc-action="insert-toc">Insert table of contents</button></div>`;
  }

  collaboratorOptions({ includeBlank = true } = {}) {
    const rows = this.workspace?.collaborators || [];
    return `${includeBlank ? `<option value="">No one</option>` : ""}${rows.map((person) => `<option value="${escapeHtml(person.userId)}">${escapeHtml(person.name)} · ${escapeHtml(person.permission)}</option>`).join("")}`;
  }

  commentsPanelHtml() {
    const comments = this.workspace?.comments || [];
    const chatWritable = this.canChatWrite();
    const roots = comments.filter((comment) => !comment.parentId);
    const cards = roots.map((comment) => {
      const replies = comments.filter((reply) => reply.parentId === comment.id);
      return `<article class="doc-comment-card ${comment.status === "resolved" ? "resolved" : ""}">
        <header><strong>${escapeHtml(comment.author)}</strong><time>${escapeHtml(relativeTime(comment.createdAt))}</time></header>
        ${comment.anchorText ? `<blockquote>${escapeHtml(comment.anchorText)}</blockquote>` : ""}
        <p>${escapeHtml(comment.body)}</p>
        ${comment.assignedName ? `<small>Task assigned to ${escapeHtml(comment.assignedName)}</small>` : ""}
        <div class="doc-comment-actions">${comment.status !== "resolved" && chatWritable ? `<button type="button" data-doc-action="reply-comment" data-comment-id="${escapeHtml(comment.id)}">Reply</button>` : ""}${comment.mine || this.active.mine ? `<button type="button" data-doc-action="toggle-comment-status" data-comment-id="${escapeHtml(comment.id)}" data-status="${comment.status === "resolved" ? "open" : "resolved"}">${comment.status === "resolved" ? "Reopen" : "Resolve"}</button>` : ""}</div>
        ${replies.map((reply) => `<div class="doc-comment-reply"><strong>${escapeHtml(reply.author)}</strong><p>${escapeHtml(reply.body)}</p></div>`).join("")}
      </article>`;
    }).join("");
    return `<header><strong>Comments and tasks</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body">
      ${this.active.canComment && chatWritable ? `<form data-doc-comment-form><label>Comment<textarea name="body" rows="3" required placeholder="Comment on the selected text or the document"></textarea></label><label>@ mention<select name="mentionedUserId">${this.collaboratorOptions()}</select></label><label>Assign as task<select name="assignedTo">${this.collaboratorOptions()}</select></label><input type="hidden" name="anchorText" value="${escapeHtml(this.selectedText())}"><button class="doc-primary-button">Comment</button><p class="doc-form-status"></p></form>` : this.active.canComment ? `<p class="doc-write-restricted">Comments are unavailable while your Community chat mute is active.</p>` : ""}
      <div class="doc-comment-list">${cards || `<p class="doc-empty">No comments yet.</p>`}</div>
    </div>`;
  }

  versionsPanelHtml() {
    const versions = this.workspace?.versions || [];
    return `<header><strong>Version history</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body">
      ${this.active.canEdit ? `<button type="button" class="doc-primary-button" data-doc-action="save-version">${icon("save")}<span>Save named version</span></button>` : ""}
      <div class="doc-version-list">${versions.map((version) => `<article><span>v${version.versionNumber}</span><div><strong>${escapeHtml(version.changeSummary || "Saved changes")}</strong><small>${escapeHtml(version.author)} · ${escapeHtml(new Date(version.createdAt).toLocaleString())}</small></div><details><summary>${icon("more")}</summary><button type="button" data-doc-action="compare-version" data-version-id="${escapeHtml(version.id)}">Compare</button>${this.active.canEdit ? `<button type="button" data-doc-action="restore-version" data-version-id="${escapeHtml(version.id)}">Restore</button>` : ""}</details></article>`).join("") || `<p class="doc-empty">No versions yet.</p>`}</div>
    </div>`;
  }

  sharePanelHtml() {
    const collaborators = this.workspace?.collaborators || [];
    const shareLink = this.active.publicShareToken ? `${location.origin}/?village-document=${encodeURIComponent(this.active.publicShareToken)}` : "";
    return `<header><strong>Share and permissions</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body">
      <form data-doc-collaborator-form><label>Invite a registered member<input type="email" name="email" required placeholder="friend@example.com"></label><label>Permission<select name="permission"><option value="viewer">Viewer</option><option value="commenter">Commenter</option><option value="editor">Editor</option></select></label><label>Permission expires<input type="datetime-local" name="expiresAt"></label><button class="doc-primary-button">Invite</button><p class="doc-form-status"></p></form>
      <section><h3>People with access</h3><div class="doc-collaborator-list">${collaborators.map((person) => `<article><span>${escapeHtml(person.name.charAt(0))}</span><div><strong>${escapeHtml(person.name)}</strong><small>${escapeHtml(person.email)} · ${escapeHtml(person.permission)}${person.expiresAt ? ` · expires ${escapeHtml(new Date(person.expiresAt).toLocaleString())}` : ""}</small></div><button type="button" data-doc-action="remove-collaborator" data-user-id="${escapeHtml(person.userId)}" title="Remove">${icon("close")}</button></article>`).join("") || `<p class="doc-empty">Only you have direct access.</p>`}</div></section>
      <form data-doc-share-link-form><h3>Share by link</h3><label class="doc-switch"><span>Enable public link</span><input type="checkbox" name="enabled" ${this.active.publicShareToken ? "checked" : ""}></label><label>Link permission<select name="permission"><option value="viewer" ${this.active.publicPermission === "viewer" ? "selected" : ""}>Viewer</option><option value="commenter" ${this.active.publicPermission === "commenter" ? "selected" : ""}>Commenter</option><option value="editor" ${this.active.publicPermission === "editor" ? "selected" : ""}>Editor</option></select></label><label>Link expires<input type="datetime-local" name="expiresAt" value="${this.active.permissionExpiresAt ? escapeHtml(new Date(this.active.permissionExpiresAt).toISOString().slice(0,16)) : ""}"></label><label class="doc-switch"><span>Disable downloads</span><input type="checkbox" name="restrictDownload" ${this.active.restrictions?.download ? "checked" : ""}></label><label class="doc-switch"><span>Disable copying</span><input type="checkbox" name="restrictCopy" ${this.active.restrictions?.copy ? "checked" : ""}></label><label class="doc-switch"><span>Disable printing</span><input type="checkbox" name="restrictPrint" ${this.active.restrictions?.print ? "checked" : ""}></label><label>Watermark<input name="watermark" maxlength="120" value="${escapeHtml(this.active.watermark || "")}" placeholder="Confidential"></label><button class="doc-primary-button">Save link settings</button><p class="doc-form-status"></p></form>
      ${shareLink ? `<div class="doc-share-link"><input value="${escapeHtml(shareLink)}" readonly><button type="button" data-doc-action="copy-share-link">${icon("link")}<span>Copy</span></button></div>` : ""}
    </div>`;
  }

  aiPanelHtml() {
    return `<header><strong>AI writing tools</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><p>Select text to work on only that passage. With no selection, the whole document is used.</p><label>Optional direction<textarea rows="3" data-doc-ai-instruction placeholder="Tone, audience, or constraints"></textarea></label><div class="doc-ai-grid"><button type="button" data-doc-action="ai-assist" data-ai-action="continue">${icon("sparkles")}<span>Continue</span></button><button type="button" data-doc-action="ai-assist" data-ai-action="summarize">Summarize</button><button type="button" data-doc-action="ai-assist" data-ai-action="rewrite">Rewrite</button><button type="button" data-doc-action="ai-assist" data-ai-action="polish">Polish</button><button type="button" data-doc-action="ai-assist" data-ai-action="grammar">Grammar</button><button type="button" data-doc-action="ai-assist" data-ai-action="translate">Translate</button></div><p class="doc-form-status" data-doc-ai-status></p></div>`;
  }

  securityPanelHtml() {
    const security = this.active.settings?.security || {};
    return `<header><strong>Document security</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><section class="doc-security-callout">${icon("lock")}<div><strong>Client-side encryption</strong><p>The password never leaves this browser. People need the same password to open the encrypted content.</p></div></section><form data-doc-security-form><label class="doc-switch"><span>Encrypt document content</span><input type="checkbox" name="encrypted" ${this.active.encrypted || security.encrypted ? "checked" : ""}></label><label>Watermark<input name="watermark" maxlength="120" value="${escapeHtml(this.active.watermark || security.watermark || "")}" placeholder="Confidential"></label><label class="doc-switch"><span>Prevent downloads for viewers</span><input type="checkbox" name="restrictDownload" ${this.active.restrictions?.download ? "checked" : ""}></label><label class="doc-switch"><span>Prevent copying for viewers</span><input type="checkbox" name="restrictCopy" ${this.active.restrictions?.copy ? "checked" : ""}></label><label class="doc-switch"><span>Prevent printing for viewers</span><input type="checkbox" name="restrictPrint" ${this.active.restrictions?.print ? "checked" : ""}></label><button class="doc-primary-button">Save security</button><p class="doc-form-status"></p></form><button type="button" class="doc-secondary-button" data-doc-action="backup-document">Download encrypted backup</button><p>Trash protects against accidental deletion. Version history can restore earlier content.</p></div>`;
  }

  approvalsPanelHtml() {
    const approvals = this.workspace?.approvals || [];
    return `<header><strong>Approval workflow</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body">${this.active.canEdit ? `<form data-doc-approval-form><label>Reviewer email<input type="email" name="email" required></label><label>Note<textarea name="note" rows="3"></textarea></label><button class="doc-primary-button">Request approval</button><p class="doc-form-status"></p></form>` : ""}<div class="doc-approval-list">${approvals.map((approval) => `<article><header><strong>${escapeHtml(approval.reviewerName)}</strong><span class="${escapeHtml(approval.status)}">${escapeHtml(approval.status.replace("_"," "))}</span></header><p>${escapeHtml(approval.note || "No note")}</p><small>Requested by ${escapeHtml(approval.requesterName)} · ${escapeHtml(relativeTime(approval.updatedAt))}</small>${approval.mine && approval.status === "pending" ? `<div><button data-doc-action="respond-approval" data-approval-id="${escapeHtml(approval.id)}" data-status="approved">Approve</button><button data-doc-action="respond-approval" data-approval-id="${escapeHtml(approval.id)}" data-status="changes_requested">Request changes</button></div>` : ""}</article>`).join("") || `<p class="doc-empty">No approval requests.</p>`}</div></div>`;
  }

  signaturesPanelHtml() {
    const signatures = this.workspace?.signatures || [];
    return `<header><strong>Electronic signatures</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><form data-doc-signature-form><label>Signature name<input name="signatureText" maxlength="160" value="${escapeHtml(this.getUser()?.name || "")}" required></label><button class="doc-primary-button">${icon("signature")}<span>Sign document</span></button><p class="doc-form-status"></p></form><div class="doc-signature-list">${signatures.map((signature) => `<article><span>${icon("signature")}</span><div><strong>${escapeHtml(signature.signatureText)}</strong><small>${escapeHtml(signature.signerName)} · ${escapeHtml(new Date(signature.createdAt).toLocaleString())}</small></div></article>`).join("") || `<p class="doc-empty">No signatures yet.</p>`}</div></div>`;
  }

  auditPanelHtml() {
    const audit = this.workspace?.audit || [];
    return `<header><strong>Access and change record</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><div class="doc-audit-list">${audit.map((item) => `<article><span>${escapeHtml(item.action)}</span><div><strong>${escapeHtml(item.actorName)}</strong><small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small></div></article>`).join("") || `<p class="doc-empty">Access records are visible to the owner.</p>`}</div></div>`;
  }

  integrationsPanelHtml() {
    const integrations = this.workspace?.integrations || [];
    return `<header><strong>Plugins and integrations</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body"><p>Store a secure HTTPS connection point for another tool. Webhooks are recorded here but are never called without an explicit document action.</p><form data-doc-integration-form><label>Name<input name="name" required maxlength="80" placeholder="Project workspace"></label><label>Type<select name="type"><option value="link">Linked tool</option><option value="webhook">Webhook</option><option value="api">API integration</option></select></label><label>HTTPS URL<input type="url" name="url" placeholder="https://"></label><button class="doc-primary-button">Add integration</button><p class="doc-form-status"></p></form><div class="doc-integration-list">${integrations.map((item) => `<article><span>${escapeHtml(item.type.toUpperCase())}</span><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.config?.url || "Village API")}</small></div><button type="button" data-doc-action="remove-integration" data-integration-id="${escapeHtml(item.id)}">${icon("close")}</button></article>`).join("") || `<p class="doc-empty">No integrations connected.</p>`}</div><section class="doc-api-note"><strong>Document API endpoint</strong><code>${escapeHtml(`${location.origin}/api/community/documents/${this.active.id}`)}</code></section></div>`;
  }

  formsPanelHtml() {
    const questions = this.active.content?.questions || [];
    return `<header><strong>Form fields and responses</strong><button type="button" data-doc-action="close-drawer">${icon("close")}</button></header><div class="doc-drawer-body">${this.active.kind === "form" && this.active.canEdit ? `<form data-doc-questions-form><label>Questions · one per line<textarea name="questions" rows="9">${escapeHtml(questions.join("\n"))}</textarea></label><button class="doc-primary-button">Save form fields</button><p class="doc-form-status"></p></form>` : `<p>Form fields are available for FORM documents. Create an application form from the template gallery.</p>`}<div class="doc-form-response-list">${(this.workspace?.responses || []).map((response) => `<article><strong>${escapeHtml(response.author)}</strong>${Object.values(response.response || {}).map((answer) => `<p>${escapeHtml(answer)}</p>`).join("")}</article>`).join("")}</div></div>`;
  }

  formResponseHtml() {
    const questions = this.active.content?.questions || [];
    if (!questions.length) return "";
    return `<form class="doc-public-form" data-doc-response-form><header><h2>Fill this form</h2><p>Your responses are sent to the document owner.</p></header>${questions.map((question, index) => `<label>${escapeHtml(question)}<textarea name="answer-${index}" rows="3" required></textarea></label>`).join("")}<button class="doc-primary-button">Submit response</button><p class="doc-form-status"></p></form>`;
  }

  renderDrawer() {
    const drawer = this.overlay?.querySelector("[data-doc-drawer]");
    if (drawer) {
      drawer.classList.toggle("open", this.panel !== "outline");
      drawer.innerHTML = this.drawerHtml(this.panel);
    }
  }

  captureSelection() {
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) this.selectionRange = range.cloneRange();
  }

  restoreSelection() {
    if (!this.selectionRange) return;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(this.selectionRange);
  }

  selectedText() {
    if (this.selectionRange && !this.selectionRange.collapsed) return this.selectionRange.toString().trim().slice(0, 500);
    return "";
  }

  exec(command, value = null) {
    if (!this.active?.canEdit || this.mode === "view") return;
    this.restoreSelection();
    try { document.execCommand(command, false, value); }
    catch { this.toast("That formatting action is unavailable in this browser."); }
    this.captureSelection();
    this.markDirty();
  }

  insertHtml(html) {
    this.exec("insertHTML", sanitizeDocumentHtml(html));
  }

  applyLineSpacing(value) {
    this.restoreSelection();
    const selection = window.getSelection();
    let node = selection?.anchorNode;
    if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const block = node?.closest?.("p,h1,h2,h3,h4,li,blockquote,div") || this.overlay?.querySelector("[data-doc-editor]");
    if (block) block.style.lineHeight = value;
    this.active.settings = { ...(this.active.settings || {}), lineSpacing: value };
    this.markDirty();
  }

  markDirty() {
    if (!this.active?.canEdit || this.mode === "view") return;
    this.dirty = true;
    const status = this.overlay?.querySelector("[data-doc-save-status]");
    if (status) status.textContent = "Editing...";
    clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => this.save({ createVersion: false }).catch((error) => this.showSaveError(error)), 1600);
    this.updateDocumentMetrics();
    this.refreshOutline();
  }

  updateDocumentMetrics() {
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    const text = String(editor?.innerText || "").trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const characters = text.length;
    const pages = 1 + (editor?.querySelectorAll(".doc-page-break").length || 0);
    const wordNode = this.overlay?.querySelector("[data-doc-word-count]");
    const pageNode = this.overlay?.querySelector("[data-doc-page-count]");
    if (wordNode) wordNode.textContent = `${words} words · ${characters} characters`;
    if (pageNode) pageNode.textContent = `${pages} ${pages === 1 ? "page" : "pages"}`;
  }

  refreshOutline() {
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    const outline = this.overlay?.querySelector("[data-doc-outline]");
    if (!editor || !outline) return;
    const headings = [...editor.querySelectorAll("h1,h2,h3,h4")];
    headings.forEach((heading, index) => {
      if (!heading.id) heading.id = `heading-${index + 1}-${Math.random().toString(16).slice(2,6)}`;
    });
    outline.innerHTML = headings.map((heading, index) => `<button type="button" class="level-${heading.tagName.slice(1)}" data-doc-action="jump-heading" data-heading-index="${index}">${escapeHtml(heading.textContent || `Heading ${index + 1}`)}</button>`).join("") || `<p>Add headings to build the outline.</p>`;
  }

  serializeContent() {
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    const header = this.overlay?.querySelector("[data-doc-header]");
    const footer = this.overlay?.querySelector("[data-doc-footer]");
    return {
      html: sanitizeDocumentHtml(editor?.innerHTML || "<p><br></p>"),
      plainText: String(editor?.innerText || "").slice(0, 180000),
      headerHtml: sanitizeDocumentHtml(header?.innerHTML || ""),
      footerHtml: sanitizeDocumentHtml(footer?.innerHTML || ""),
      questions: Array.isArray(this.active.content?.questions) ? this.active.content.questions : []
    };
  }

  async save({ createVersion = false, changeSummary = "" } = {}) {
    if (!this.active?.canEdit || this.saving || (!this.dirty && !createVersion)) return this.active;
    this.saving = true;
    const status = this.overlay?.querySelector("[data-doc-save-status]");
    if (status) status.textContent = "Saving...";
    try {
      const title = String(this.overlay?.querySelector("[data-doc-title]")?.value || this.active.title).trim();
      if (!title) throw new Error("Add a document title.");
      let content = this.serializeContent();
      const settings = { ...(this.active.settings || {}), mode: this.mode };
      if (settings.security?.encrypted) {
        if (!this.encryptionPassword) {
          this.encryptionPassword = prompt("Create a password for this encrypted document:") || "";
          if (this.encryptionPassword.length < 8) throw new Error("Use at least 8 characters for the document password.");
        }
        content = { encryptedPayload: await encryptContent(content, this.encryptionPassword), plainText: "Encrypted document" };
      }
      const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          content,
          settings,
          folderId: this.active.folderId,
          favorite: this.active.favorite,
          templateKey: this.active.templateKey,
          createVersion,
          changeSummary: changeSummary || (createVersion ? "Manual save" : "Autosave")
        })
      });
      this.active = { ...result.document, content: settings.security?.encrypted ? this.serializeContent() : result.document.content };
      this.workspace.document = this.active;
      this.lastKnownUpdatedAt = result.document.updatedAt;
      this.dirty = false;
      if (status) status.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      if (createVersion) {
        const refreshed = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/workspace`);
        this.workspace.versions = refreshed.versions || [];
        if (this.panel === "versions") this.renderDrawer();
      }
      return this.active;
    } finally {
      this.saving = false;
    }
  }

  showSaveError(error) {
    const status = this.overlay?.querySelector("[data-doc-save-status]");
    if (status) status.textContent = `Not saved · ${error.message}`;
    this.toast(error.message);
  }

  async saveNamedVersion() {
    const summary = prompt("Name this version:", "Milestone");
    if (summary === null) return;
    this.dirty = true;
    await this.save({ createVersion: true, changeSummary: summary || "Named version" });
    this.toast("Version saved.");
  }

  startLiveSync() {
    if (!this.active?.id || !this.getUser?.()) return;
    const heartbeat = async () => {
      try {
        await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/presence`, { method: "POST", body: JSON.stringify({ sessionId: this.sessionId, cursor: { mode: this.mode } }) });
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/presence`);
        this.workspace.presence = result.presence || [];
        const container = this.overlay?.querySelector(".doc-presence");
        if (container) container.innerHTML = this.workspace.presence.slice(0, 5).map((person) => `<span title="${escapeHtml(person.name)}">${person.avatarDataUrl ? `<img src="${escapeHtml(person.avatarDataUrl)}" alt="">` : escapeHtml(String(person.name || "V").charAt(0))}</span>`).join("");
      } catch {}
    };
    heartbeat();
    this.presenceTimer = setInterval(heartbeat, 15000);
    this.syncTimer = setInterval(() => this.pullRemoteChanges(), 8000);
  }

  async pullRemoteChanges() {
    if (!this.active?.id || this.dirty || this.saving) return;
    try {
      const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}`);
      if (result.document.updatedAt && result.document.updatedAt > this.lastKnownUpdatedAt) {
        this.active = result.document;
        this.workspace.document = result.document;
        this.lastKnownUpdatedAt = result.document.updatedAt;
        const editor = this.overlay?.querySelector("[data-doc-editor]");
        if (editor && document.activeElement !== editor) {
          editor.innerHTML = sanitizeDocumentHtml(result.document.content?.html || "<p><br></p>");
          this.updateDocumentMetrics();
          this.refreshOutline();
          const live = this.overlay?.querySelector("[data-doc-live-status]");
          if (live) live.textContent = "Synced a collaborator's changes";
        }
      }
    } catch {}
  }

  stopLiveSync() {
    clearTimeout(this.autosaveTimer);
    clearInterval(this.presenceTimer);
    clearInterval(this.syncTimer);
    if (this.active?.id && this.getUser?.()) this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/presence?sessionId=${encodeURIComponent(this.sessionId)}`, { method: "DELETE" }).catch(() => {});
    this.presenceTimer = null;
    this.syncTimer = null;
    document.removeEventListener("selectionchange", this.boundSelection);
  }

  async close() {
    if (this.dirty) {
      try { await this.save({ createVersion: false }); } catch {}
    }
    this.stopLiveSync();
    this.overlay?.remove();
    this.active = null;
    this.workspace = null;
    this.onClose();
  }

  async updateMetadata(documentId, changes) {
    const result = await this.api(`/api/community/documents/${encodeURIComponent(documentId)}/metadata`, { method: "PATCH", body: JSON.stringify(changes) });
    const index = this.documents.findIndex((item) => item.id === documentId);
    if (index >= 0) this.documents[index] = result.document;
    return result.document;
  }

  async createFolder() {
    const name = prompt("Folder name:");
    if (!name) return;
    await this.api("/api/community/document-folders", { method: "POST", body: JSON.stringify({ name, parentId: this.folderId }) });
    await this.loadLibrary();
    this.renderHub();
  }

  async moveDocument(documentId) {
    const choices = this.folders.map((folder, index) => `${index + 1}. ${folder.name}`).join("\n");
    const answer = prompt(`Move to folder:\n0. No folder\n${choices}`, "0");
    if (answer === null) return;
    const index = Number(answer) - 1;
    const folderId = Number(answer) === 0 ? "" : this.folders[index]?.id;
    if (folderId === undefined) return this.toast("Choose a valid folder number.");
    await this.updateMetadata(documentId, { folderId });
    await this.loadLibrary();
    this.renderHub();
  }

  async compareVersion(versionId) {
    const data = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/versions`);
    const version = (data.versions || []).find((item) => item.id === versionId);
    if (!version) return this.toast("Version not found.");
    this.showModal({
      title: `Compare version ${version.versionNumber}`,
      wide: true,
      body: `<div class="doc-compare-grid"><section><h3>Version ${version.versionNumber}</h3><div class="doc-diff">${lineDiff("", htmlToText(version.content?.html || version.content?.body || ""))}</div></section><section><h3>Current document</h3><div class="doc-diff">${lineDiff(htmlToText(version.content?.html || version.content?.body || ""), htmlToText(this.serializeContent().html))}</div></section></div>`
    });
  }

  async restoreVersion(versionId) {
    if (!confirm("Restore this version? The current document will remain in version history.")) return;
    const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/versions/${encodeURIComponent(versionId)}/restore`, { method: "POST", body: "{}" });
    this.active = result.document;
    await this.openDocument(this.active.id);
    this.toast("Version restored.");
  }

  exportData() {
    return {
      title: this.overlay?.querySelector("[data-doc-title]")?.value || this.active.title,
      bodyHtml: this.serializeContent().html,
      headerHtml: this.serializeContent().headerHtml,
      footerHtml: this.serializeContent().footerHtml,
      watermark: this.active.watermark || this.active.settings?.security?.watermark || ""
    };
  }

  canDownload() {
    if (!this.active.mine && this.active.restrictions?.download) {
      this.toast("The owner disabled downloads for this document.");
      return false;
    }
    return true;
  }

  canPrint() {
    if (!this.active.mine && this.active.restrictions?.print) {
      this.toast("The owner disabled printing for this document.");
      return false;
    }
    return true;
  }

  async insertFile(kind) {
    const input = this.overlay?.querySelector(kind === "image" ? "[data-doc-image-input]" : "[data-doc-media-input]");
    if (!input) return;
    input.dataset.insertKind = kind;
    input.click();
  }

  async handleEmbeddedFile(input) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const dataUrl = await readFileDataUrl(file, 600000);
      if (input.dataset.insertKind === "image" || file.type.startsWith("image/")) this.insertHtml(`<figure><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(file.name)}"><figcaption>${escapeHtml(file.name)}</figcaption></figure>`);
      else if (file.type.startsWith("video/")) this.insertHtml(`<figure><video controls src="${escapeHtml(dataUrl)}"></video><figcaption>${escapeHtml(file.name)}</figcaption></figure>`);
      else if (file.type.startsWith("audio/")) this.insertHtml(`<figure><audio controls src="${escapeHtml(dataUrl)}"></audio><figcaption>${escapeHtml(file.name)}</figcaption></figure>`);
      else this.insertHtml(`<p><a href="${escapeHtml(dataUrl)}" data-attachment-name="${escapeHtml(file.name)}" data-attachment-mime="${escapeHtml(file.type)}" download="${escapeHtml(file.name)}">Attachment: ${escapeHtml(file.name)}</a></p>`);
    } catch (error) { this.toast(error.message); }
  }

  insertTable() {
    const rows = Math.max(1, Math.min(20, Number(prompt("Rows:", "3") || 0)));
    const columns = Math.max(1, Math.min(10, Number(prompt("Columns:", "3") || 0)));
    if (!rows || !columns) return;
    const html = `<table><tbody>${Array.from({ length: rows }, (_, row) => `<tr>${Array.from({ length: columns }, () => `<${row === 0 ? "th" : "td"}><br></${row === 0 ? "th" : "td"}>`).join("")}</tr>`).join("")}</tbody></table><p><br></p>`;
    this.insertHtml(html);
  }

  insertChart() {
    const values = String(prompt("Chart values separated by commas:", "12, 20, 8, 16") || "").split(",").map(Number).filter(Number.isFinite).slice(0, 12);
    if (!values.length) return;
    const max = Math.max(...values, 1);
    this.insertHtml(`<figure class="doc-chart" data-chart="${escapeHtml(values.join(","))}"><div style="display:grid;grid-template-columns:repeat(${values.length},1fr);gap:8px;height:180px;align-items:end">${values.map((value) => `<span title="${value}" style="display:block;height:${Math.max(4, Math.round(value / max * 100))}%;background-color:#47735d"></span>`).join("")}</div><figcaption>Chart · ${escapeHtml(values.join(", "))}</figcaption></figure><p><br></p>`);
  }

  insertFormula() {
    const formula = prompt("Formula or equation:", "E = mc²");
    if (!formula) return;
    this.insertHtml(`<p><span class="doc-formula" data-formula="${escapeHtml(formula)}">${escapeHtml(formula)}</span></p>`);
  }

  insertSymbol() {
    const symbol = prompt("Symbol:", "©");
    if (symbol) this.exec("insertText", symbol.slice(0, 10));
  }

  insertLink() {
    const href = safeUrl(prompt("Link URL:", "https://") || "");
    if (!href) return this.toast("Use a valid web, email, phone, or internal link.");
    const label = this.selectedText() || prompt("Link text:", href) || href;
    this.insertHtml(`<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`);
  }

  insertToc() {
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    if (!editor) return;
    const headings = [...editor.querySelectorAll("h1,h2,h3,h4")];
    headings.forEach((heading, index) => { if (!heading.id) heading.id = `heading-${index + 1}`; });
    editor.querySelector("[data-document-toc]")?.remove();
    const toc = `<nav data-document-toc class="doc-generated-toc"><strong>Contents</strong><ol>${headings.map((heading) => `<li class="level-${heading.tagName.slice(1)}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.textContent)}</a></li>`).join("")}</ol></nav>`;
    editor.insertAdjacentHTML("afterbegin", sanitizeDocumentHtml(toc));
    this.markDirty();
  }

  async aiAssist(action) {
    const status = this.overlay?.querySelector("[data-doc-ai-status]");
    if (status) status.textContent = "Waffles is writing...";
    const selected = this.selectedText();
    const editor = this.overlay?.querySelector("[data-doc-editor]");
    const language = action === "translate" ? prompt("Translate into:", "Simplified Chinese") || "English" : "English";
    try {
      const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/assist`, {
        method: "POST",
        body: JSON.stringify({ action, text: selected || editor?.innerText || "", language, instruction: this.overlay?.querySelector("[data-doc-ai-instruction]")?.value || "" })
      });
      if (selected && this.selectionRange) {
        this.restoreSelection();
        this.exec("insertText", result.text);
      } else if (action === "continue") {
        editor?.insertAdjacentHTML("beforeend", `<p>${escapeHtml(result.text).replace(/\n/g, "<br>")}</p>`);
        this.markDirty();
      } else {
        this.showModal({ title: "Writing suggestion", body: `<div class="doc-ai-result">${escapeHtml(result.text).replace(/\n/g, "<br>")}</div><button type="button" class="doc-primary-button" data-doc-action="apply-ai-result" data-ai-result="${escapeHtml(result.text)}">Replace document text</button>` });
      }
      if (status) status.textContent = "Ready.";
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  }

  startVoiceInput() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return this.toast("Voice typing is unavailable in this browser.");
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = [...event.results].slice(event.resultIndex).map((result) => result[0]?.transcript || "").join(" ");
      if (text.trim()) this.exec("insertText", `${text.trim()} `);
    };
    recognition.onerror = () => this.toast("Voice typing stopped.");
    recognition.start();
    this.toast("Voice typing is listening. Use the browser microphone indicator to stop.");
  }

  async handleClick(event) {
    const panelButton = event.target.closest("[data-doc-panel]");
    if (panelButton) {
      event.preventDefault();
      this.panel = panelButton.dataset.docPanel;
      return this.renderDrawer();
    }
    const commandButton = event.target.closest("[data-doc-command]");
    if (commandButton) {
      event.preventDefault();
      const command = commandButton.dataset.docCommand;
      if (command === "paste") return navigator.clipboard?.readText().then((text) => this.exec("insertText", text)).catch(() => this.toast("Use Command-V or Control-V to paste."));
      if (command === "delete") return this.exec("delete");
      return this.exec(command);
    }
    const button = event.target.closest("[data-doc-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.docAction;
    if (action === "close") return this.close();
    if (action === "close-modal") return this.closeModal();
    if (action === "new-document") return this.openTemplatePicker();
    if (action === "create-template") return this.createFromTemplate(button.dataset.templateKey);
    if (action === "open-document") return this.openDocument(button.dataset.documentId);
    if (action === "back-library") {
      if (this.dirty) await this.save({ createVersion: false }).catch((error) => this.showSaveError(error));
      return this.openHub({ roomId: this.roomId });
    }
    if (action === "library-view") {
      this.view = button.dataset.view;
      this.folderId = "";
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "open-folder") {
      this.view = "active";
      this.folderId = button.dataset.folderId;
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "new-folder") return this.createFolder();
    if (action === "toggle-favorite") {
      await this.updateMetadata(button.dataset.documentId, { favorite: button.dataset.favorite === "true" });
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "rename-document") {
      const item = this.documents.find((document) => document.id === button.dataset.documentId);
      const title = prompt("Document name:", item?.title || "");
      if (!title) return;
      await this.updateMetadata(button.dataset.documentId, { title });
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "move-document") return this.moveDocument(button.dataset.documentId);
    if (action === "trash-document") {
      await this.api(`/api/community/documents/${encodeURIComponent(button.dataset.documentId)}`, { method: "DELETE" });
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "restore-document") {
      await this.updateMetadata(button.dataset.documentId, { trashed: false });
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "delete-document-permanently") {
      if (!confirm("Delete this document and every version forever?")) return;
      await this.api(`/api/community/documents/${encodeURIComponent(button.dataset.documentId)}?permanent=1`, { method: "DELETE" });
      await this.loadLibrary();
      return this.renderHub();
    }
    if (action === "close-drawer") {
      this.panel = "outline";
      return this.renderDrawer();
    }
    if (action === "save-version") return this.saveNamedVersion();
    if (action === "set-mode") {
      this.mode = button.dataset.mode;
      this.active.settings = { ...(this.active.settings || {}), mode: this.mode };
      this.renderEditor();
      return this.markDirty();
    }
    if (action === "insert-image") return this.insertFile("image");
    if (action === "insert-media") return this.insertFile("media");
    if (action === "insert-table") return this.insertTable();
    if (action === "insert-link") return this.insertLink();
    if (action === "insert-chart") return this.insertChart();
    if (action === "insert-formula") return this.insertFormula();
    if (action === "insert-symbol") return this.insertSymbol();
    if (action === "insert-page-break") return this.insertHtml('<hr class="doc-page-break"><p><br></p>');
    if (action === "insert-section-break") return this.insertHtml('<section class="doc-section-break"><small>Section break</small></section><p><br></p>');
    if (action === "insert-bookmark") {
      const name = String(prompt("Bookmark name:", "section") || "").trim().replace(/[^a-z0-9_-]/gi, "-");
      if (name) this.insertHtml(`<span id="${escapeHtml(name)}" data-bookmark="${escapeHtml(name)}"></span>`);
      return;
    }
    if (action === "insert-internal-link") {
      const target = String(prompt("Bookmark name:", "section") || "").trim().replace(/[^a-z0-9_-]/gi, "-");
      if (target) this.insertHtml(`<a href="#${escapeHtml(target)}">${escapeHtml(this.selectedText() || target)}</a>`);
      return;
    }
    if (action === "insert-toc") return this.insertToc();
    if (action === "toggle-header" || action === "toggle-footer" || action === "toggle-page-number") {
      const key = action === "toggle-header" ? "showHeader" : action === "toggle-footer" ? "showFooter" : "showPageNumber";
      this.active.settings = { ...(this.active.settings || {}), [key]: this.active.settings?.[key] === false ? true : !this.active.settings?.[key] };
      this.renderEditor();
      return this.markDirty();
    }
    if (action === "document-layout") {
      const size = prompt("Page size: a4, letter, or legal", this.active.settings?.pageSize || "a4");
      const orientation = prompt("Orientation: portrait or landscape", this.active.settings?.orientation || "portrait");
      if (["a4", "letter", "legal"].includes(size) && ["portrait", "landscape"].includes(orientation)) {
        this.active.settings = { ...(this.active.settings || {}), pageSize: size, orientation };
        this.renderEditor();
        this.markDirty();
      }
      return;
    }
    if (action === "jump-heading") return this.overlay?.querySelector("[data-doc-editor]")?.querySelectorAll("h1,h2,h3,h4")[Number(button.dataset.headingIndex)]?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (action === "word-count") return this.showModal({ title: "Document statistics", body: `<p>${escapeHtml(this.overlay?.querySelector("[data-doc-word-count]")?.textContent || "")}</p><p>${escapeHtml(this.overlay?.querySelector("[data-doc-page-count]")?.textContent || "")}</p>` });
    if (action === "spellcheck") {
      const editor = this.overlay?.querySelector("[data-doc-editor]");
      editor?.setAttribute("spellcheck", editor.getAttribute("spellcheck") === "false" ? "true" : "false");
      editor?.focus();
      return this.toast(`Spelling and grammar checking ${editor?.getAttribute("spellcheck") === "true" ? "enabled" : "disabled"}.`);
    }
    if (action === "voice-input") return this.startVoiceInput();
    if (action === "find-replace") {
      return this.showModal({ title: "Find and replace", body: `<form data-doc-find-form><label>Find<input name="find" required></label><label>Replace with<input name="replace"></label><label class="doc-switch"><span>Match case</span><input type="checkbox" name="matchCase"></label><button class="doc-primary-button">Replace all</button><p class="doc-form-status"></p></form>` });
    }
    if (action === "ai-assist") return this.aiAssist(button.dataset.aiAction);
    if (action === "apply-ai-result") {
      const editor = this.overlay?.querySelector("[data-doc-editor]");
      if (editor) editor.innerHTML = `<p>${escapeHtml(button.dataset.aiResult || "").replace(/\n/g, "<br>")}</p>`;
      this.closeModal();
      return this.markDirty();
    }
    if (action === "reply-comment") {
      if (!this.canChatWrite()) return this.toast("Comments are unavailable while your Community chat mute is active.");
      const reply = prompt("Reply:");
      if (!reply) return;
      const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/comments`, { method: "POST", body: JSON.stringify({ body: reply, parentId: button.dataset.commentId }) });
      this.workspace.comments.push(result.comment);
      return this.renderDrawer();
    }
    if (action === "toggle-comment-status") {
      await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/comments/${encodeURIComponent(button.dataset.commentId)}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) });
      const comment = this.workspace.comments.find((item) => item.id === button.dataset.commentId);
      if (comment) comment.status = button.dataset.status;
      return this.renderDrawer();
    }
    if (action === "compare-version") return this.compareVersion(button.dataset.versionId);
    if (action === "restore-version") return this.restoreVersion(button.dataset.versionId);
    if (action === "remove-collaborator") {
      await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/collaborators?userId=${encodeURIComponent(button.dataset.userId)}`, { method: "DELETE" });
      this.workspace.collaborators = this.workspace.collaborators.filter((person) => person.userId !== button.dataset.userId);
      return this.renderDrawer();
    }
    if (action === "copy-share-link") {
      const link = this.overlay?.querySelector(".doc-share-link input")?.value || "";
      await navigator.clipboard.writeText(link);
      return this.toast("Share link copied.");
    }
    if (action === "respond-approval") {
      const note = prompt("Optional note:", "") || "";
      await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/approvals/${encodeURIComponent(button.dataset.approvalId)}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.status, note }) });
      const approval = this.workspace.approvals.find((item) => item.id === button.dataset.approvalId);
      if (approval) Object.assign(approval, { status: button.dataset.status, note });
      return this.renderDrawer();
    }
    if (action === "remove-integration") {
      await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/integrations?id=${encodeURIComponent(button.dataset.integrationId)}`, { method: "DELETE" });
      this.workspace.integrations = this.workspace.integrations.filter((item) => item.id !== button.dataset.integrationId);
      return this.renderDrawer();
    }
    if (action === "backup-document") {
      const backup = JSON.stringify({ title: this.active.title, content: this.serializeContent(), settings: this.active.settings, exportedAt: new Date().toISOString() }, null, 2);
      return downloadBlob(new Blob([backup], { type: "application/json" }), `${safeFileName(this.active.title)}.village-backup.json`);
    }
    if (action === "export-docx" && this.canDownload()) return exportDocxFile(this.exportData());
    if (action === "export-pdf" && this.canDownload() && this.canPrint()) return printDocument(this.exportData());
    if (action === "export-txt" && this.canDownload()) return exportTextFile(this.exportData());
    if (action === "export-html" && this.canDownload()) return exportHtmlFile(this.exportData());
    if (action === "print-document" && this.canPrint()) return printDocument(this.exportData());
  }

  async handleChange(event) {
    const format = event.target.closest("[data-doc-format]");
    if (format) return this.exec(format.dataset.docFormat, format.value);
    const lineSpacing = event.target.closest("[data-doc-line-spacing]");
    if (lineSpacing) return this.applyLineSpacing(lineSpacing.value);
    const imageInput = event.target.closest("[data-doc-image-input],[data-doc-media-input]");
    if (imageInput) return this.handleEmbeddedFile(imageInput);
    const importInput = event.target.closest("[data-doc-import]");
    if (importInput) return this.importFile(importInput);
  }

  handleInput(event) {
    if (event.target.matches("[data-doc-editor],[data-doc-header],[data-doc-footer],[data-doc-title]")) this.markDirty();
    if (event.target.matches("[data-doc-search]")) {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(async () => {
        this.search = event.target.value.trim();
        await this.loadLibrary();
        this.renderHub();
        this.overlay?.querySelector("[data-doc-search]")?.focus();
      }, 350);
    }
  }

  handleKeydown(event) {
    if (event.key === "Escape") {
      if (this.overlay?.querySelector(".doc-modal-layer")) return this.closeModal();
      if (this.panel !== "outline") {
        this.panel = "outline";
        return this.renderDrawer();
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      return this.saveNamedVersion();
    }
  }

  handleBeforeInput(event) {
    if (this.mode !== "suggest" || !event.target.matches("[data-doc-editor]")) return;
    const selection = window.getSelection();
    const author = escapeHtml(this.getUser()?.name || "Editor");
    if (event.inputType.startsWith("delete") && selection && !selection.isCollapsed) {
      event.preventDefault();
      this.insertHtml(`<del data-suggestion="delete" data-author="${author}">${escapeHtml(this.selectedText())}</del>`);
      return;
    }
    if (event.inputType === "insertText" && event.data) {
      event.preventDefault();
      this.insertHtml(`<ins data-suggestion="insert" data-author="${author}">${escapeHtml(event.data)}</ins>`);
    }
  }

  async handleSubmit(event) {
    const form = event.target;
    if (!form.closest("#village-document-studio")) return;
    event.preventDefault();
    const data = new FormData(form);
    const status = form.querySelector(".doc-form-status");
    try {
      if (form.matches("[data-doc-comment-form]")) {
        if (!this.canChatWrite()) {
          if (status) status.textContent = "Comments are unavailable while your Community chat mute is active.";
          return;
        }
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/comments`, { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
        this.workspace.comments.push(result.comment);
        this.renderDrawer();
      } else if (form.matches("[data-doc-collaborator-form]")) {
        const payload = Object.fromEntries(data);
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/collaborators`, { method: "POST", body: JSON.stringify(payload) });
        const index = this.workspace.collaborators.findIndex((person) => person.userId === result.collaborator.userId);
        if (index >= 0) this.workspace.collaborators[index] = result.collaborator;
        else this.workspace.collaborators.push(result.collaborator);
        this.renderDrawer();
      } else if (form.matches("[data-doc-share-link-form]")) {
        const payload = {
          enabled: Boolean(form.elements.enabled.checked),
          permission: data.get("permission"),
          expiresAt: data.get("expiresAt"),
          restrictDownload: Boolean(form.elements.restrictDownload.checked),
          restrictCopy: Boolean(form.elements.restrictCopy.checked),
          restrictPrint: Boolean(form.elements.restrictPrint.checked),
          watermark: data.get("watermark")
        };
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/share-link`, { method: "POST", body: JSON.stringify(payload) });
        Object.assign(this.active, { publicShareToken: result.token, publicPermission: result.permission, permissionExpiresAt: result.expiresAt, restrictions: result.restrictions, watermark: result.watermark });
        this.renderDrawer();
      } else if (form.matches("[data-doc-security-form]")) {
        const encrypted = Boolean(form.elements.encrypted.checked);
        if (encrypted && !this.encryptionPassword) {
          const password = prompt("Create a document password with at least 8 characters:");
          if (!password || password.length < 8) throw new Error("Encryption needs a password of at least 8 characters.");
          this.encryptionPassword = password;
        }
        if (!encrypted && this.active.encrypted) {
          const confirmed = confirm("Remove encryption on the next save?");
          if (!confirmed) return;
        }
        this.active.settings = {
          ...(this.active.settings || {}),
          security: {
            ...(this.active.settings?.security || {}),
            encrypted,
            watermark: data.get("watermark"),
            restrictDownload: Boolean(form.elements.restrictDownload.checked),
            restrictCopy: Boolean(form.elements.restrictCopy.checked),
            restrictPrint: Boolean(form.elements.restrictPrint.checked)
          }
        };
        this.active.watermark = String(data.get("watermark") || "");
        this.active.restrictions = { download: Boolean(form.elements.restrictDownload.checked), copy: Boolean(form.elements.restrictCopy.checked), print: Boolean(form.elements.restrictPrint.checked) };
        this.dirty = true;
        await this.save({ createVersion: true, changeSummary: "Security settings updated" });
        this.renderEditor();
      } else if (form.matches("[data-doc-approval-form]")) {
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/approvals`, { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
        this.workspace.approvals.unshift(result.approval);
        this.renderDrawer();
      } else if (form.matches("[data-doc-signature-form]")) {
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/signatures`, { method: "POST", body: JSON.stringify(Object.fromEntries(data)) });
        this.workspace.signatures.unshift(result.signature);
        this.insertHtml(`<p class="doc-signature-block"><em>Electronically signed by ${escapeHtml(result.signature.signatureText)} on ${escapeHtml(new Date(result.signature.createdAt).toLocaleString())}</em></p>`);
        this.renderDrawer();
      } else if (form.matches("[data-doc-integration-form]")) {
        const result = await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/integrations`, { method: "POST", body: JSON.stringify({ name: data.get("name"), type: data.get("type"), config: { url: data.get("url") } }) });
        this.workspace.integrations.unshift(result.integration);
        this.renderDrawer();
      } else if (form.matches("[data-doc-questions-form]")) {
        this.active.content.questions = String(data.get("questions") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 50);
        this.dirty = true;
        await this.save({ createVersion: true, changeSummary: "Form fields updated" });
        if (status) status.textContent = "Form fields saved.";
      } else if (form.matches("[data-doc-response-form]")) {
        const response = {};
        for (const [key, value] of data.entries()) response[key] = value;
        await this.api(`/api/community/documents/${encodeURIComponent(this.active.id)}/responses`, { method: "POST", body: JSON.stringify({ response }) });
        form.reset();
        if (status) status.textContent = "Response submitted.";
      } else if (form.matches("[data-doc-find-form]")) {
        const find = String(data.get("find") || "");
        const replacement = String(data.get("replace") || "");
        const editor = this.overlay?.querySelector("[data-doc-editor]");
        if (!find || !editor) throw new Error("Enter text to find.");
        const flags = form.elements.matchCase.checked ? "g" : "gi";
        const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const pattern = new RegExp(escaped, flags);
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        const textNodes = [];
        while (walker.nextNode()) textNodes.push(walker.currentNode);
        for (const node of textNodes) node.nodeValue = node.nodeValue.replace(pattern, () => replacement);
        this.closeModal();
        this.markDirty();
      }
    } catch (error) {
      if (status) status.textContent = error.message;
      else this.toast(error.message);
    }
  }
}
