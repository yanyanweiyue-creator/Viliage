const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const icon = (name) => {
  const icons = {
    mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 18v4M8 22h8",
    video: "M15 8v8H4V8h11Zm0 3 5-3v8l-5-3",
    screen: "M3 4h18v13H3zM8 21h8M12 17v4",
    record: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
    hand: "M8 11V5a2 2 0 0 1 4 0v5M12 10V4a2 2 0 0 1 4 0v7M16 11V6a2 2 0 0 1 4 0v8c0 5-3 8-8 8h-1c-4 0-7-3-7-7V9a2 2 0 0 1 4 0v4",
    captions: "M3 5h18v14H3zM6 10a3 3 0 0 1 5-2M11 14a3 3 0 0 1-5-2M14 10a3 3 0 0 1 5-2M19 14a3 3 0 0 1-5-2",
    board: "M3 4h18v14H3zM8 22l4-4 4 4M7 13l3-3 3 2 4-5",
    poll: "M5 20V10M12 20V4M19 20v-7",
    background: "M4 5h16v14H4zM8 15l3-3 2 2 3-4 4 5M9 9h.01",
    participants: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
    chat: "M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z",
    phone: "M5 4h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 2 6c0-1 1-2 3-2Z",
    settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-3v-.08a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15.7a1.7 1.7 0 0 0-1.56-1.04H5v-3h.08A1.7 1.7 0 0 0 6.64 10a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.3 6.34a1.7 1.7 0 0 0 1.04-1.56V4h3v.08A1.7 1.7 0 0 0 15.9 5.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.56 9.3 1.7 1.7 0 0 0 21.12 10H22v3h-.08A1.7 1.7 0 0 0 20.36 14Z",
    pen: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
    highlighter: "m9 11-6 6v3h9l3-3M22 12l-7 7-9-9 7-7Z",
    eraser: "m7 21-4-4 9-12a2.8 2.8 0 0 1 4 0l3 3a2.8 2.8 0 0 1 0 4l-9 9ZM9 19l-5-5",
    line: "M5 19 19 5",
    arrow: "M5 19 19 5M11 5h8v8",
    text: "M4 7V4h16v3M9 20h6M12 4v16",
    note: "M4 3h16v14l-4 4H4ZM16 21v-4h4",
    shape: "M4 4h7v7H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
    image: "M3 5h18v14H3zM7 14l3-3 3 3 2-2 4 4M8 9h.01",
    undo: "M9 7 4 12l5 5M4 12h9a7 7 0 0 1 7 7",
    redo: "m15 7 5 5-5 5M20 12h-9a7 7 0 0 0-7 7",
    plus: "M12 5v14M5 12h14",
    trash: "M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6",
    copy: "M8 8h12v12H8zM4 16V4h12",
    lock: "M5 10h14v11H5zM8 10V7a4 4 0 0 1 8 0v3",
    save: "M5 4h12l2 2v14H5zM8 4v6h8V4M8 20v-6h8v6",
    reply: "m9 17-5-5 5-5M4 12h9a7 7 0 0 1 7 7",
    download: "M12 3v12M7 10l5 5 5-5M5 21h14",
    smile: "M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0ZM9 9h.01M15 9h.01M8 14c1 2 7 2 8 0",
    clock: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9ZM12 7v5l3 2",
    search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM16 16l5 5",
    link: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1",
    close: "M5 5l14 14M19 5 5 19"
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.close}"/></svg>`;
};

function readFileDataUrl(file, maxBytes = 650000) {
  if (!file) return Promise.resolve(null);
  if (file.size > maxBytes) return Promise.reject(new Error("Choose a file smaller than 650 KB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, mime: file.type || "application/octet-stream", dataUrl: String(reader.result || "") });
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.readAsDataURL(file);
  });
}

const meetingId = () => globalThis.crypto?.randomUUID?.() || `meeting-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
const DEFAULT_MEETING_ICE_SERVERS = [
  { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] }
];
const CAPTION_SPEECH_LANGUAGES = [
  ["en-US", "English"],
  ["zh-CN", "中文（普通话）"],
  ["es-ES", "Español"],
  ["fr-FR", "Français"],
  ["de-DE", "Deutsch"],
  ["pt-BR", "Português"],
  ["ja-JP", "日本語"],
  ["ko-KR", "한국어"],
  ["ar-SA", "العربية"],
  ["hi-IN", "हिन्दी"]
];
const CAPTION_TRANSLATION_LANGUAGES = [
  ["", "Original language"],
  ["en", "English"],
  ["zh-CN", "简体中文"],
  ["zh-TW", "繁體中文"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["ar", "العربية"],
  ["hi", "हिन्दी"]
];
const MODERATION_BLOCKED_MEETING_ACTIONS = new Set([
  "board-tool",
  "board-undo",
  "board-redo",
  "board-copy",
  "board-lock",
  "board-delete",
  "board-clear",
  "board-add-page",
  "board-add-layer",
  "board-version",
  "chat-everyone",
  "chat-new",
  "chat-start",
  "chat-reply",
  "chat-cancel-reply",
  "chat-format",
  "chat-emoji",
  "chat-insert-emoji",
  "chat-cloud",
  "chat-react"
]);

function captionLanguageForSite(language = "en") {
  if (language === "zh") return "zh-CN";
  if (language === "es") return "es-ES";
  return "en-US";
}

function meetingMessageBody(value = "", format = {}) {
  const lines = String(value).split(/\r?\n/);
  const inline = (line) => escapeHtml(line)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
  if (format.list) {
    const tag = format.list === "numbered" ? "ol" : "ul";
    return `<${tag}>${lines.filter(Boolean).map((line) => `<li>${inline(line.replace(/^\s*(?:[-*]|\d+\.)\s*/, ""))}</li>`).join("")}</${tag}>`;
  }
  const content = lines.map(inline).join("<br>");
  return `${format.bold ? "<strong>" : ""}${format.italic ? "<em>" : ""}${content}${format.italic ? "</em>" : ""}${format.bold ? "</strong>" : ""}`;
}

function downloadMeetingFile(name, value, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export class VillageMeetingRuntime {
  constructor({
    api,
    getUser,
    canChatWrite = () => true,
    toast = () => {},
    onClose = () => {},
    getLanguage = () => "en",
    suspendVoiceControl = () => false,
    resumeVoiceControl = () => {}
  }) {
    this.api = api;
    this.getUser = getUser;
    this.canChatWrite = canChatWrite;
    this.toast = toast;
    this.onClose = onClose;
    this.getLanguage = getLanguage;
    this.suspendVoiceControl = suspendVoiceControl;
    this.resumeVoiceControl = resumeVoiceControl;
    this.meeting = null;
    this.room = null;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map();
    this.peerStates = new Map();
    this.peerRecoveryTimers = new Map();
    this.iceServers = DEFAULT_MEETING_ICE_SERVERS;
    this.signalTimer = null;
    this.refreshTimer = null;
    this.whiteboardTimer = null;
    this.signalCursor = 0;
    this.signalPollBusy = false;
    this.whiteboardCursor = 0;
    this.whiteboardEvents = [];
    this.boardObjects = new Map();
    this.boardVersions = [];
    this.boardImages = new Map();
    this.remoteBoardCursors = new Map();
    this.boardHistory = [];
    this.boardFuture = [];
    this.boardDraft = null;
    this.boardDrag = null;
    this.boardSelectedId = "";
    this.boardTool = "pen";
    this.boardColor = "#275547";
    this.boardWidth = 4;
    this.boardPage = 1;
    this.boardLayer = 1;
    this.boardPages = [1];
    this.boardLayers = [1];
    this.boardZoom = 0.7;
    this.boardCursorSentAt = 0;
    this.recorder = null;
    this.recordingChunks = [];
    this.captionRecognition = null;
    this.captionsWanted = false;
    this.captionRestartTimer = null;
    this.captionRestartAttempt = 0;
    this.captionSpeechLanguage = "en-US";
    this.captionTranslationLanguage = "";
    this.captionTranslationCache = new Map();
    this.captionDisplayToken = 0;
    this.captionTranslationWarned = false;
    this.voiceControlWasSuspended = false;
    this.raisedHand = false;
    this.virtualBackground = false;
    this.streams = new Map();
    this.participantMeta = new Map();
    this.activeSpeakerId = "";
    this.audioUnlockPending = false;
    this.polls = [];
    this.pollCountdownTimer = null;
    this.dismissedPollIds = new Set();
    this.chatMessages = [];
    this.chatAudience = { audience: "everyone", recipientIds: [], label: "Everyone" };
    this.chatReplyTo = null;
    this.chatFormat = { bold: false, italic: false, list: false };
    this.chatFile = null;
    this.closed = true;
  }

  captionPreferenceKey() {
    return `village-meeting-captions:${String(this.getUser()?.id || "anonymous")}`;
  }

  loadCaptionPreferences() {
    this.captionSpeechLanguage = captionLanguageForSite(this.getLanguage());
    this.captionTranslationLanguage = "";
    try {
      const saved = JSON.parse(globalThis.localStorage?.getItem(this.captionPreferenceKey()) || "{}");
      if (CAPTION_SPEECH_LANGUAGES.some(([value]) => value === saved.speechLanguage)) {
        this.captionSpeechLanguage = saved.speechLanguage;
      }
      if (CAPTION_TRANSLATION_LANGUAGES.some(([value]) => value === saved.translationLanguage)) {
        this.captionTranslationLanguage = saved.translationLanguage;
      }
    } catch {}
  }

  saveCaptionPreferences() {
    try {
      globalThis.localStorage?.setItem(this.captionPreferenceKey(), JSON.stringify({
        speechLanguage: this.captionSpeechLanguage,
        translationLanguage: this.captionTranslationLanguage
      }));
    } catch {}
  }

  async open(meetingId, room) {
    await this.close({ quiet: true });
    this.closed = false;
    this.room = room;
    this.signalCursor = 0;
    this.signalPollBusy = false;
    this.loadCaptionPreferences();
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(meetingId)}`);
      this.meeting = data.meeting;
      this.iceServers = Array.isArray(data.rtcConfiguration?.iceServers) && data.rtcConfiguration.iceServers.length
        ? data.rtcConfiguration.iceServers
        : DEFAULT_MEETING_ICE_SERVERS;
      this.polls = data.polls || [];
      this.raisedHand = Boolean((data.participants || []).find((participant) => participant.mine)?.raisedHand);
      this.mount(data);
      const joined = await this.api(`/api/community/meetings/${encodeURIComponent(meetingId)}/join`, { method: "POST", body: "{}" });
      this.signalCursor = Math.max(0, Number(joined.signalCursor || 0));
      this.signalTimer = setInterval(() => this.pollSignals(), 650);
      this.refreshTimer = setInterval(() => this.refreshWorkspace(), 4000);
      this.startMedia().catch(() => {
        const status = document.querySelector("#meeting-focus-state");
        if (status && !this.closed && this.meeting?.id === meetingId) status.textContent = "Joined without camera or microphone";
      });
      await this.pollSignals();
      await Promise.allSettled((joined.participantIds || []).map((participantId) => this.offerTo(participantId)));
      await this.refreshMeetingInvitations();
    } catch (error) {
      await this.close({ quiet: true });
      throw error;
    }
  }

  mount(data) {
    document.querySelector("#village-meeting")?.remove();
    this.participantMeta.clear();
    for (const participant of data.participants || []) {
      this.participantMeta.set(String(participant.userId), participant);
    }
    const localId = String(this.getUser()?.id || "");
    if (!this.participantMeta.has(localId)) {
      this.participantMeta.set(localId, {
        userId: localId,
        displayName: this.getUser()?.name || "You",
        avatarDataUrl: this.getUser()?.avatarDataUrl || "",
        role: data.meeting.hostId === this.getUser()?.id ? "host" : "participant",
        raisedHand: this.raisedHand,
        mine: true
      });
    }
    this.activeSpeakerId = localId;
    const canModerate = this.canModerate(data.participants || []);
    const chatWritable = this.canChatWrite();
    const overlay = document.createElement("section");
    overlay.id = "village-meeting";
    overlay.className = "village-meeting";
    overlay.setAttribute("aria-label", "Village video meeting");
    overlay.innerHTML = `
      <header class="meeting-header">
        <div><small>LIVE VILLAGE MEETING</small><h2>${escapeHtml(data.meeting.title)}</h2><span id="meeting-status">${escapeHtml(data.meeting.status)}</span></div>
        <div class="meeting-header-actions">
          ${canModerate ? `<button type="button" data-meeting-action="settings" class="meeting-icon" title="Meeting settings">${icon("settings")}<span class="sr-only">Meeting settings</span></button>` : ""}
          ${data.meeting.hostId === this.getUser()?.id ? `<button type="button" data-meeting-action="end" class="meeting-end">End for everyone</button>` : ""}
          <button type="button" data-meeting-action="close" class="meeting-icon" title="Leave meeting">${icon("close")}<span class="sr-only">Leave meeting</span></button>
        </div>
      </header>
      <div class="meeting-layout sidebar-closed">
        <main class="meeting-stage">
          <div id="meeting-video-strip" class="meeting-video-strip" aria-label="Participant video strip">
            ${[...this.participantMeta.values()].map((participant) => this.participantThumbnailHtml(participant)).join("")}
          </div>
          <div id="meeting-remote-audio" aria-hidden="true"></div>
          <div class="meeting-speaker-stage">
            <div id="meeting-video-grid" class="meeting-video-grid">
              <article id="meeting-focus-tile" class="meeting-video-tile local active-speaker" data-user-id="${escapeHtml(localId)}">
                <video id="meeting-focus-video" autoplay muted playsinline></video>
                <div class="meeting-video-placeholder">${this.participantPlaceholder(this.participantMeta.get(localId))}</div>
                <span id="meeting-focus-hand" class="meeting-hand-badge${this.raisedHand ? "" : " hidden"}" title="Hand raised">${icon("hand")}</span>
                <footer><strong id="meeting-focus-name">You</strong><span id="meeting-focus-state">Connecting…</span></footer>
              </article>
            </div>
          </div>
          <div id="meeting-captions" class="meeting-captions" aria-live="polite"></div>
          <section id="meeting-live-poll" class="meeting-live-poll hidden" role="dialog" aria-modal="true" aria-label="Live poll"></section>
          ${this.whiteboardMarkup(canModerate, chatWritable)}
          ${this.pollPanelMarkup(data.polls || [], canModerate, chatWritable)}
        </main>
        <aside class="meeting-sidebar hidden" data-sidebar-view="participants">
          <nav class="meeting-sidebar-tabs" aria-label="Meeting side panels">
            <button type="button" data-meeting-action="sidebar-participants" class="active">Members <span id="meeting-participant-count">${(data.participants || []).length}</span></button>
            <button type="button" data-meeting-action="sidebar-chat">Chat</button>
            <button type="button" data-meeting-action="sidebar-close" class="meeting-sidebar-close" title="Close side panel">${icon("close")}<span class="sr-only">Close side panel</span></button>
          </nav>
          <section data-meeting-sidebar-panel="participants">
            <header><strong>Members</strong></header>
            <div id="meeting-participants">${this.participantsHtml(data.participants || [])}</div>
            ${chatWritable ? `<details class="meeting-friend-invite">
              <summary>Invite friends</summary>
              <div id="meeting-friend-invite-content"><p class="meeting-empty">Loading your friends…</p></div>
            </details>` : `<p class="meeting-write-restricted">Meeting invitations are unavailable while your Community chat mute is active.</p>`}
          </section>
          ${this.chatMarkup(data.participants || [], canModerate, chatWritable)}
        </aside>
      </div>
      <nav class="meeting-controls" aria-label="Meeting controls">
        <button type="button" data-meeting-action="mic" class="active" title="Mute microphone">${icon("mic")}<span>Mic</span></button>
        <button type="button" data-meeting-action="camera" class="active" title="Turn camera off">${icon("video")}<span>Camera</span></button>
        <button type="button" data-meeting-action="screen" title="Share screen">${icon("screen")}<span>Share</span></button>
        <button type="button" data-meeting-action="record" title="Record locally">${icon("record")}<span>Record</span></button>
        <button type="button" data-meeting-action="sidebar-participants" title="Show participants">${icon("participants")}<span>Members</span></button>
        <button type="button" data-meeting-action="sidebar-chat" title="Open meeting chat">${icon("chat")}<span>Chat</span></button>
        <button type="button" data-meeting-action="background" title="Toggle village backdrop">${icon("background")}<span>Backdrop</span></button>
        <button type="button" data-meeting-action="hand" class="${this.raisedHand ? "active" : ""}" title="Raise hand">${icon("hand")}<span>${this.raisedHand ? "Lower" : "Raise"}</span></button>
        <div class="meeting-caption-control">
          <button type="button" data-meeting-action="captions" title="Toggle live captions">${icon("captions")}<span>Captions</span></button>
          <details class="meeting-caption-options">
            <summary title="Caption language and translation" aria-label="Caption language and translation">⌄</summary>
            <div>
              <label>I'm speaking
                <select id="meeting-caption-language">
                  ${CAPTION_SPEECH_LANGUAGES.map(([value, label]) => `<option value="${value}"${value === this.captionSpeechLanguage ? " selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
              <label>Translate my view to
                <select id="meeting-caption-translation">
                  ${CAPTION_TRANSLATION_LANGUAGES.map(([value, label]) => `<option value="${value}"${value === this.captionTranslationLanguage ? " selected" : ""}>${label}</option>`).join("")}
                </select>
              </label>
              <small>This translation choice only changes what you see.</small>
            </div>
          </details>
        </div>
        <button type="button" data-meeting-action="board" title="Open whiteboard">${icon("board")}<span>Board</span></button>
        <button type="button" data-meeting-action="poll" title="Open polls">${icon("poll")}<span>Polls</span><i id="meeting-poll-alert" class="meeting-control-alert hidden"></i></button>
        <button type="button" data-meeting-action="close" class="hangup" title="Leave meeting">${icon("phone")}<span>Leave</span></button>
      </nav>
      ${this.settingsMarkup(canModerate)}`;
    document.body.append(overlay);
    overlay.addEventListener("click", (event) => this.handleClick(event));
    overlay.addEventListener("submit", (event) => this.handleSubmit(event));
    overlay.addEventListener("change", (event) => this.handleChange(event));
    overlay.addEventListener("input", (event) => this.handleInput(event));
    this.setupWhiteboard();
    this.applyBoardZoom();
    this.syncLivePoll(data.polls || []);
    this.refreshChat();
  }

  canModerate(participants = [...this.participantMeta.values()]) {
    return this.meeting?.hostId === this.getUser()?.id || participants.some((participant) => participant.mine && participant.role === "cohost");
  }

  whiteboardMarkup(canModerate, chatWritable = this.canChatWrite()) {
    const permission = this.meeting?.settings?.whiteboardPermission || "edit";
    const writeDisabled = chatWritable ? "" : "disabled";
    return `
      <section id="meeting-whiteboard-panel" class="meeting-tool-panel meeting-board-panel hidden" aria-label="Shared whiteboard">
        <header class="meeting-board-header">
          <div><strong>Shared whiteboard</strong><small id="meeting-board-sync">Saved to this meeting</small></div>
          <div>
            <button type="button" ${writeDisabled} data-meeting-action="board-version" title="${chatWritable ? "Save a version" : "Whiteboard editing is unavailable during your chat mute"}">${icon("save")}<span class="sr-only">Save version</span></button>
            <button type="button" data-meeting-action="tool-close" title="Close whiteboard">${icon("close")}<span class="sr-only">Close whiteboard</span></button>
          </div>
        </header>
        <div class="meeting-board-shell">
          <div class="meeting-board-toolbar" role="toolbar" aria-label="Whiteboard tools">
            ${[
              ["select", "shape", "Select"],
              ["pen", "pen", "Pen"],
              ["highlighter", "highlighter", "Highlighter"],
              ["eraser", "eraser", "Eraser"],
              ["line", "line", "Line"],
              ["arrow", "arrow", "Arrow"],
              ["rectangle", "shape", "Rectangle"],
              ["ellipse", "shape", "Ellipse"],
              ["text", "text", "Text"],
              ["sticky", "note", "Sticky note"]
            ].map(([tool, iconName, label]) => `<button type="button" ${writeDisabled} data-meeting-action="board-tool" data-board-tool="${tool}" class="${tool === this.boardTool ? "active" : ""}" title="${chatWritable ? label : "Whiteboard editing is unavailable during your chat mute"}">${icon(iconName)}<span class="sr-only">${label}</span></button>`).join("")}
            <label class="board-color-control" title="Drawing color"><input id="meeting-board-color" ${writeDisabled} type="color" value="${escapeHtml(this.boardColor)}"><span class="sr-only">Drawing color</span></label>
            <label class="board-width-control" title="Line width"><input id="meeting-board-width" ${writeDisabled} type="range" min="1" max="28" value="${this.boardWidth}"><span id="meeting-board-width-value">${this.boardWidth}</span></label>
            <span class="board-toolbar-separator"></span>
            <select id="meeting-board-insert" ${writeDisabled} title="Insert content">
              <option value="">Insert</option>
              <option value="card">Card</option>
              <option value="table">Table</option>
              <option value="chart">Chart</option>
              <option value="comment">Comment</option>
              <option value="stamp">Stamp</option>
            </select>
            <label class="meeting-board-upload" title="Upload image or PDF">${icon("image")}<span class="sr-only">Upload image or PDF</span><input id="meeting-board-file" ${writeDisabled} type="file" accept="image/*,application/pdf"></label>
            <button type="button" ${writeDisabled} data-meeting-action="board-undo" title="Undo">${icon("undo")}<span class="sr-only">Undo</span></button>
            <button type="button" ${writeDisabled} data-meeting-action="board-redo" title="Redo">${icon("redo")}<span class="sr-only">Redo</span></button>
            <span class="board-toolbar-separator"></span>
            <label>Page <select id="meeting-board-page"><option value="1">1</option></select></label>
            <button type="button" ${writeDisabled} data-meeting-action="board-add-page" title="Add page">${icon("plus")}<span class="sr-only">Add page</span></button>
            <label>Layer <select id="meeting-board-layer"><option value="1">1</option></select></label>
            <button type="button" ${writeDisabled} data-meeting-action="board-add-layer" title="Add layer">${icon("plus")}<span class="sr-only">Add layer</span></button>
            ${canModerate ? `<label class="board-permission">Access <select id="meeting-board-permission"><option value="edit"${permission === "edit" ? " selected" : ""}>Edit</option><option value="comment"${permission === "comment" ? " selected" : ""}>Comment</option><option value="view"${permission === "view" ? " selected" : ""}>View</option></select></label>` : ""}
          </div>
          <div class="meeting-board-workspace">
            <div id="meeting-board-viewport" class="meeting-board-viewport">
              <canvas id="meeting-whiteboard" width="2400" height="1400"></canvas>
            </div>
            <div class="meeting-board-minimap"><canvas id="meeting-board-minimap" width="220" height="128"></canvas></div>
          </div>
          <footer class="meeting-board-footer">
            <div class="meeting-board-selection">
              <button type="button" ${writeDisabled} data-meeting-action="board-copy" title="Duplicate selected item">${icon("copy")}<span>Copy</span></button>
              <button type="button" ${writeDisabled} data-meeting-action="board-lock" title="Lock selected item">${icon("lock")}<span>Lock</span></button>
              <button type="button" ${writeDisabled} data-meeting-action="board-delete" title="Delete selected item">${icon("trash")}<span>Delete</span></button>
              <button type="button" ${writeDisabled} data-meeting-action="board-clear" title="Clear this page">Clear page</button>
            </div>
            <label class="meeting-board-versions">History <select id="meeting-board-versions" ${writeDisabled}><option value="">Versions</option></select></label>
            ${canModerate ? `<label class="meeting-presenter-toggle"><input id="meeting-presenter-mode" type="checkbox"${this.meeting?.settings?.presenterMode ? " checked" : ""}> Follow presenter</label>` : ""}
            <label class="meeting-board-zoom">${icon("search")}<span>Zoom</span><input id="meeting-board-zoom" type="range" min="35" max="160" value="${Math.round(this.boardZoom * 100)}"><output id="meeting-board-zoom-value">${Math.round(this.boardZoom * 100)}%</output></label>
          </footer>
        </div>
      </section>`;
  }

  pollPanelMarkup(polls, canModerate, chatWritable = this.canChatWrite()) {
    const canCreate = canModerate || Boolean(this.meeting?.settings?.allowMemberPolls);
    return `
      <section id="meeting-poll-panel" class="meeting-tool-panel meeting-poll-panel hidden" role="dialog" aria-modal="true" aria-label="Meeting polls">
        <header><div><strong>Polls</strong><small>Draft, launch, and review this meeting's polls</small></div><button type="button" data-meeting-action="tool-close" title="Close polls">${icon("close")}<span class="sr-only">Close polls</span></button></header>
        <div class="meeting-poll-workspace">
          ${canCreate && chatWritable ? `<form id="meeting-poll-form" class="meeting-poll-form">
            <label>Question<input name="question" maxlength="240" placeholder="Ask the room a question" required></label>
            <label>Choices<textarea name="options" rows="4" placeholder="One answer per line" required></textarea></label>
            <div class="meeting-poll-options">
              <label><input name="multiple" type="checkbox"> Allow multiple choices</label>
              <label><input name="anonymous" type="checkbox"> Anonymous responses</label>
              <label><input name="showLiveResults" type="checkbox" checked> Show live results</label>
              <label>Timer <select name="durationSeconds"><option value="0">No timer</option><option value="30">30 seconds</option><option value="60">1 minute</option><option value="120">2 minutes</option><option value="300">5 minutes</option></select></label>
            </div>
            <button type="submit">Create draft</button><p class="form-error"></p>
          </form>` : `<p class="meeting-poll-permission">${chatWritable ? "The host controls poll creation for this meeting." : "Creating polls is unavailable while your Community chat mute is active."}</p>`}
          <div id="meeting-poll-list">${this.pollsHtml(polls)}</div>
        </div>
      </section>`;
  }

  chatMarkup(participants, canModerate, chatWritable = this.canChatWrite()) {
    return `
      <section class="meeting-chat hidden" data-meeting-sidebar-panel="chat">
        <header>
          <div><strong>Meeting chat</strong><small id="meeting-chat-scope">Only saved in this meeting</small></div>
          <div><button type="button" data-meeting-action="chat-export" title="Save visible chat">${icon("download")}<span class="sr-only">Save chat</span></button>${canModerate ? `<button type="button" data-meeting-action="settings" title="Chat settings">${icon("settings")}<span class="sr-only">Chat settings</span></button>` : ""}</div>
        </header>
        <nav class="meeting-chat-targets ${chatWritable ? "" : "hidden"}" aria-label="Chat recipients">
          <button type="button" data-meeting-action="chat-everyone" class="active"><span class="meeting-target-icon">${icon("participants")}</span><strong>Everyone</strong></button>
          <button type="button" data-meeting-action="chat-new"><span class="meeting-target-icon">${icon("plus")}</span><strong>New chat</strong></button>
        </nav>
        <div id="meeting-chat-recipient-picker" class="meeting-chat-recipient-picker hidden">
          <strong>Choose one person or a temporary group</strong>
          <div>${this.chatRecipientPickerHtml(participants)}</div>
          <button type="button" data-meeting-action="chat-start">Start chat</button>
        </div>
        <div id="meeting-chat-reply" class="meeting-chat-reply hidden"><span></span><button type="button" data-meeting-action="chat-cancel-reply">${icon("close")}<span class="sr-only">Cancel reply</span></button></div>
        <div id="meeting-chat-list" aria-live="polite"></div>
        ${chatWritable ? `<form id="meeting-chat-form">
          <div class="meeting-chat-compose-toolbar">
            <button type="button" data-meeting-action="chat-format" data-format="bold" title="Bold"><strong>B</strong></button>
            <button type="button" data-meeting-action="chat-format" data-format="italic" title="Italic"><em>I</em></button>
            <button type="button" data-meeting-action="chat-format" data-format="list" title="Bulleted list">•</button>
            <button type="button" data-meeting-action="chat-emoji" title="Emoji">${icon("smile")}<span class="sr-only">Emoji</span></button>
            <label class="meeting-file-button" title="Attach file">${icon("plus")}<span class="sr-only">Attach file</span><input id="meeting-chat-file" type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label>
            <button type="button" data-meeting-action="chat-cloud" title="Share cloud file">${icon("link")}<span class="sr-only">Share cloud file</span></button>
            <span id="meeting-chat-file-name"></span>
          </div>
          <div id="meeting-chat-emoji-picker" class="meeting-chat-emoji-picker hidden">${["😀", "😊", "👍", "❤️", "👏", "🎉", "🙏", "💡"].map((emoji) => `<button type="button" data-meeting-action="chat-insert-emoji" data-emoji="${emoji}">${emoji}</button>`).join("")}</div>
          <textarea name="message" maxlength="4000" rows="2" placeholder="Message everyone"></textarea>
          <button type="submit">Send</button>
          <p class="form-error"></p>
        </form>` : `<div class="meeting-chat-muted" role="status">Meeting chat is read-only while your Community chat mute is active.</div>`}
      </section>`;
  }

  chatRecipientPickerHtml(participants = [...this.participantMeta.values()]) {
    return participants.filter((participant) => !participant.mine && String(participant.userId) !== String(this.getUser()?.id || "")).map((participant) => `
      <label><input type="checkbox" name="meeting-chat-recipient" value="${escapeHtml(participant.userId)}"><span class="meeting-avatar">${participant.avatarDataUrl ? `<img src="${escapeHtml(participant.avatarDataUrl)}" alt="">` : escapeHtml(String(participant.displayName || "V").charAt(0))}</span><span>${escapeHtml(participant.displayName || "Village member")}<small>${escapeHtml(participant.role || "participant")}</small></span></label>
    `).join("") || `<p class="meeting-empty">No other participants are here yet.</p>`;
  }

  settingsMarkup(canModerate) {
    if (!canModerate) return "";
    const settings = this.meeting?.settings || {};
    return `
      <section id="meeting-settings-dialog" class="meeting-settings-dialog hidden" role="dialog" aria-modal="true" aria-label="Meeting settings">
        <header><div><strong>Host controls</strong><small>These choices apply to everyone in this meeting.</small></div><button type="button" data-meeting-action="settings-close">${icon("close")}<span class="sr-only">Close settings</span></button></header>
        <form id="meeting-settings-form">
          <label>Participant chat<select name="chatPolicy"><option value="everyone"${settings.chatPolicy !== "host-only" && settings.chatPolicy !== "disabled" ? " selected" : ""}>Everyone</option><option value="host-only"${settings.chatPolicy === "host-only" ? " selected" : ""}>Host only</option><option value="disabled"${settings.chatPolicy === "disabled" ? " selected" : ""}>Off</option></select></label>
          <label class="meeting-setting-toggle"><span><strong>Private and group chat</strong><small>Let participants choose specific recipients.</small></span><input name="privateChat" type="checkbox"${settings.privateChat !== false ? " checked" : ""}></label>
          <label class="meeting-setting-toggle"><span><strong>Participant polls</strong><small>Allow ordinary members to create poll drafts.</small></span><input name="allowMemberPolls" type="checkbox"${settings.allowMemberPolls ? " checked" : ""}></label>
          <label>Whiteboard access<select name="whiteboardPermission"><option value="edit"${settings.whiteboardPermission !== "comment" && settings.whiteboardPermission !== "view" ? " selected" : ""}>Edit</option><option value="comment"${settings.whiteboardPermission === "comment" ? " selected" : ""}>Comment only</option><option value="view"${settings.whiteboardPermission === "view" ? " selected" : ""}>View only</option></select></label>
          <button type="submit">Apply to meeting</button><p class="form-error"></p>
        </form>
      </section>`;
  }

  participantPlaceholder(participant = {}) {
    if (participant.avatarDataUrl) return `<img src="${escapeHtml(participant.avatarDataUrl)}" alt="">`;
    return escapeHtml(String(participant.displayName || "V").charAt(0).toUpperCase());
  }

  participantThumbnailHtml(participant = {}) {
    const userId = String(participant.userId || "");
    const mine = participant.mine || userId === String(this.getUser()?.id || "");
    return `<button type="button" class="meeting-video-thumb${userId === this.activeSpeakerId ? " active-speaker" : ""}${mine ? " local" : ""}${participant.raisedHand ? " hand-raised" : ""}" data-meeting-action="focus-participant" data-user-id="${escapeHtml(userId)}" aria-label="Focus ${escapeHtml(participant.displayName || "Village member")}"><video autoplay muted playsinline></video><span class="meeting-video-placeholder">${this.participantPlaceholder(participant)}</span><span class="meeting-hand-badge${participant.raisedHand ? "" : " hidden"}" title="Hand raised">${icon("hand")}</span><footer><strong>${escapeHtml(mine ? "You" : participant.displayName || "Village member")}</strong><small>${escapeHtml(participant.role || "participant")}</small></footer></button>`;
  }

  syncParticipantStrip(participants = []) {
    const strip = document.querySelector("#meeting-video-strip");
    if (!strip) return;
    const localId = String(this.getUser()?.id || "");
    const records = [...participants];
    if (!records.some((participant) => String(participant.userId) === localId)) {
      records.unshift({
        userId: localId,
        displayName: this.getUser()?.name || "You",
        avatarDataUrl: this.getUser()?.avatarDataUrl || "",
        role: this.meeting?.hostId === this.getUser()?.id ? "host" : "participant",
        raisedHand: this.raisedHand,
        mine: true
      });
    }
    const activeIds = new Set();
    for (const participant of records) {
      const userId = String(participant.userId || "");
      activeIds.add(userId);
      this.participantMeta.set(userId, participant);
      let thumbnail = strip.querySelector(`[data-user-id="${CSS.escape(userId)}"]`);
      if (!thumbnail) {
        strip.insertAdjacentHTML("beforeend", this.participantThumbnailHtml(participant));
        thumbnail = strip.lastElementChild;
      }
      thumbnail.classList.toggle("active-speaker", userId === this.activeSpeakerId);
      thumbnail.classList.toggle("local", userId === localId || participant.mine);
      thumbnail.setAttribute("aria-label", `Focus ${participant.displayName || "Village member"}`);
      thumbnail.querySelector(".meeting-video-placeholder").innerHTML = this.participantPlaceholder(participant);
      thumbnail.querySelector("strong").textContent = userId === localId || participant.mine ? "You" : participant.displayName || "Village member";
      thumbnail.querySelector("small").textContent = participant.role || "participant";
      thumbnail.classList.toggle("hand-raised", Boolean(participant.raisedHand));
      thumbnail.querySelector(".meeting-hand-badge")?.classList.toggle("hidden", !participant.raisedHand);
      this.attachStream(userId, this.streams.get(userId));
    }
    strip.querySelectorAll("[data-user-id]").forEach((thumbnail) => {
      if (!activeIds.has(String(thumbnail.dataset.userId || ""))) thumbnail.remove();
    });
    document.querySelector("#meeting-focus-hand")?.classList.toggle("hidden", !this.participantMeta.get(this.activeSpeakerId)?.raisedHand);
    if (!activeIds.has(this.activeSpeakerId)) this.focusParticipant(localId);
  }

  attachStream(userId, stream) {
    const id = String(userId || "");
    const videoTrack = stream?.getVideoTracks?.()[0];
    const hasVideo = Boolean(videoTrack);
    const cameraOff = hasVideo && !videoTrack.enabled;
    const thumbnail = document.querySelector(`#meeting-video-strip [data-user-id="${CSS.escape(id)}"]`);
    const thumbnailVideo = thumbnail?.querySelector("video");
    if (thumbnailVideo && thumbnailVideo.srcObject !== stream) thumbnailVideo.srcObject = stream || null;
    thumbnail?.classList.toggle("has-video", hasVideo);
    thumbnail?.classList.toggle("camera-off", cameraOff);
    if (this.activeSpeakerId !== id) return;
    const focusVideo = document.querySelector("#meeting-focus-video");
    if (focusVideo && focusVideo.srcObject !== stream) focusVideo.srcObject = stream || null;
    const focusTile = document.querySelector("#meeting-focus-tile");
    focusTile?.classList.toggle("has-video", hasVideo);
    focusTile?.classList.toggle("camera-off", cameraOff);
  }

  focusParticipant(userId) {
    const id = String(userId || "");
    const localId = String(this.getUser()?.id || "");
    const participant = this.participantMeta.get(id) || {
      userId: id,
      displayName: id === localId ? this.getUser()?.name || "You" : "Village member",
      mine: id === localId
    };
    this.activeSpeakerId = id;
    const tile = document.querySelector("#meeting-focus-tile");
    if (!tile) return;
    tile.dataset.userId = id;
    tile.classList.toggle("local", id === localId || participant.mine);
    tile.classList.toggle("village-backdrop", this.virtualBackground && (id === localId || participant.mine));
    tile.querySelector(".meeting-video-placeholder").innerHTML = this.participantPlaceholder(participant);
    tile.querySelector("#meeting-focus-name").textContent = id === localId || participant.mine ? "You" : participant.displayName || "Village member";
    tile.querySelector("#meeting-focus-state").textContent = this.streams.get(id)?.getTracks?.().length ? "Connected" : "Joined without camera";
    tile.querySelector("#meeting-focus-hand")?.classList.toggle("hidden", !participant.raisedHand);
    const focusVideo = tile.querySelector("#meeting-focus-video");
    focusVideo.muted = true;
    this.attachStream(id, this.streams.get(id));
    document.querySelectorAll("#meeting-video-strip [data-user-id]").forEach((thumbnail) => {
      thumbnail.classList.toggle("active-speaker", String(thumbnail.dataset.userId || "") === id);
    });
  }

  attachRemoteAudio(userId, stream) {
    const id = String(userId || "");
    if (!id || id === String(this.getUser()?.id || "")) return;
    const container = document.querySelector("#meeting-remote-audio");
    if (!container) return;
    let audio = container.querySelector(`[data-audio-user-id="${CSS.escape(id)}"]`);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.playsInline = true;
      audio.dataset.audioUserId = id;
      container.append(audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream || null;
    audio.play?.().catch(() => {
      const status = this.activeSpeakerId === id ? document.querySelector("#meeting-focus-state") : null;
      if (status) status.textContent = "Tap the meeting once to enable sound";
      this.queueRemoteAudioUnlock(container);
    });
  }

  queueRemoteAudioUnlock(container) {
    if (this.audioUnlockPending || this.closed) return;
    const surface = document.querySelector("#village-meeting");
    if (!surface) return;
    this.audioUnlockPending = true;
    surface.addEventListener("pointerdown", () => {
      this.audioUnlockPending = false;
      const attempts = [...container.querySelectorAll("audio")].map((audio) => {
        try {
          return Promise.resolve(audio.play?.());
        } catch (error) {
          return Promise.reject(error);
        }
      });
      Promise.allSettled(attempts).then((results) => {
        if (this.closed) return;
        const played = results.some((result) => result.status === "fulfilled");
        const status = played ? document.querySelector("#meeting-focus-state") : null;
        if (status?.textContent === "Tap the meeting once to enable sound") status.textContent = "Connected";
        if (results.some((result) => result.status === "rejected")) {
          this.queueRemoteAudioUnlock(container);
        }
      });
    }, { once: true, capture: true });
  }

  participantsHtml(participants = []) {
    const host = this.meeting?.hostId === this.getUser()?.id;
    return participants.map((participant) => `<article class="meeting-participant${participant.raisedHand ? " hand-raised" : ""}" data-participant-id="${escapeHtml(participant.userId)}"><span class="meeting-avatar">${participant.avatarDataUrl ? `<img src="${escapeHtml(participant.avatarDataUrl)}" alt="">` : escapeHtml(String(participant.displayName || "V").charAt(0))}${participant.raisedHand ? `<i class="meeting-avatar-hand" title="Hand raised">${icon("hand")}</i>` : ""}</span><div><strong>${escapeHtml(participant.displayName)}${participant.mine ? " (You)" : ""}</strong><small>${escapeHtml(participant.breakoutRoom || participant.role)}${participant.raisedHand ? " · Hand raised" : ""}</small></div>${host && !participant.mine ? `<details><summary>Manage</summary><button type="button" data-meeting-action="cohost" data-user-id="${escapeHtml(participant.userId)}">Make cohost</button><button type="button" data-meeting-action="breakout" data-user-id="${escapeHtml(participant.userId)}">Assign room</button><button type="button" data-meeting-action="remove" data-user-id="${escapeHtml(participant.userId)}">Remove</button></details>` : ""}</article>`).join("") || `<p class="meeting-empty">Waiting for others to join.</p>`;
  }

  meetingInvitationFriendsHtml(friends = []) {
    if (!this.canChatWrite()) return `<p class="meeting-write-restricted">Meeting invitations are unavailable while your Community chat mute is active.</p>`;
    if (!friends.length) return `<p class="meeting-empty">No eligible friends are available to invite.</p>`;
    const choices = friends.map((friend) => {
      const invited = ["pending", "accepted"].includes(friend.invitationStatus);
      const label = friend.invitationStatus === "accepted" ? "Access granted" : "Invitation sent";
      return `<div class="meeting-invite-friend">
        <label>
          ${invited ? "" : `<input type="checkbox" name="recipientIds" value="${escapeHtml(friend.userId)}">`}
          <span class="meeting-avatar">${friend.avatarDataUrl ? `<img src="${escapeHtml(friend.avatarDataUrl)}" alt="">` : escapeHtml(String(friend.displayName || "V").charAt(0))}</span>
          <span><strong>${escapeHtml(friend.displayName || "Village member")}</strong>${invited ? `<small>${label}</small>` : `<small>Meeting access only</small>`}</span>
        </label>
        ${invited ? `<button type="button" data-meeting-action="revoke-invitation" data-invitation-id="${escapeHtml(friend.invitationId)}">Revoke</button>` : ""}
      </div>`;
    }).join("");
    const hasAvailable = friends.some((friend) => !["pending", "accepted"].includes(friend.invitationStatus));
    return `<form id="meeting-invite-form">
      <div class="meeting-invite-friends">${choices}</div>
      ${hasAvailable ? `<button type="submit">Send meeting invitation</button>` : ""}
      <p class="form-error" role="alert"></p>
      <small>Invited friends can join this meeting, but they cannot read the parent chat.</small>
    </form>`;
  }

  async refreshMeetingInvitations() {
    const content = document.querySelector("#meeting-friend-invite-content");
    if (!content || !this.meeting || this.closed) return;
    if (!this.canChatWrite()) {
      content.innerHTML = this.meetingInvitationFriendsHtml();
      return;
    }
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/invitations`);
      content.innerHTML = this.meetingInvitationFriendsHtml(data.friends || []);
    } catch (error) {
      content.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`;
    }
  }

  pollsHtml(polls = []) {
    const canModerate = this.canModerate();
    return polls.map((poll) => {
      const status = poll.status || (poll.closed ? "closed" : "active");
      const showResults = canModerate || status === "closed" || poll.showLiveResults !== false;
      const voters = Number(poll.totalVoters || 0);
      return `<article class="meeting-poll" data-poll-id="${escapeHtml(poll.id)}">
        <header><div><span class="meeting-poll-status ${escapeHtml(status)}">${escapeHtml(status)}</span><strong>${escapeHtml(poll.question)}</strong></div><small>${poll.multiple ? "Multiple choice" : "Single choice"} · ${poll.anonymous ? "Anonymous" : "Named"}${poll.durationSeconds ? ` · ${Number(poll.durationSeconds)} sec` : ""}</small></header>
        <div class="meeting-poll-results">${(poll.options || []).map((option, index) => {
          const count = Number(poll.votes?.[index] || 0);
          const percent = voters ? Math.round(count / voters * 100) : 0;
          return `<div><span>${escapeHtml(option)}</span>${showResults ? `<i style="--poll-value:${percent}%"></i><b>${count} · ${percent}%</b>` : `<b>Hidden</b>`}</div>`;
        }).join("")}</div>
        <footer><span>${voters} voted · ${Math.max(0, Number(poll.participantCount || 0) - voters)} not voted</span><div>
          ${status === "draft" && canModerate ? `<button type="button" data-meeting-action="poll-start" data-poll-id="${escapeHtml(poll.id)}">Start poll</button>` : ""}
          ${status === "active" ? `<button type="button" data-meeting-action="poll-open" data-poll-id="${escapeHtml(poll.id)}">Open</button>` : ""}
          ${status === "active" && canModerate ? `<button type="button" data-meeting-action="poll-end" data-poll-id="${escapeHtml(poll.id)}">End</button>` : ""}
          ${status === "closed" ? `<button type="button" data-meeting-action="poll-export" data-poll-id="${escapeHtml(poll.id)}">${icon("download")}<span>CSV</span></button>` : ""}
        </div></footer>
      </article>`;
    }).join("") || `<p class="meeting-empty">No polls yet.</p>`;
  }

  async startMedia() {
    const meetingId = this.meeting?.id;
    const localId = String(this.getUser()?.id || "");
    const tracks = [];
    const mediaDevices = globalThis.navigator?.mediaDevices;
    if (mediaDevices?.getUserMedia) {
      const [audioResult, videoResult] = await Promise.allSettled([
        mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false }),
        mediaDevices.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } })
      ]);
      if (audioResult.status === "fulfilled") tracks.push(...audioResult.value.getAudioTracks());
      if (videoResult.status === "fulfilled") tracks.push(...videoResult.value.getVideoTracks());
    }
    if (this.closed || !meetingId || this.meeting?.id !== meetingId) {
      tracks.forEach((track) => track.stop?.());
      return;
    }
    this.localStream = new MediaStream(tracks);
    this.streams.set(localId, this.localStream);
    this.attachStream(localId, this.localStream);
    this.focusParticipant(localId);
    const hasAudio = Boolean(this.localStream.getAudioTracks().length);
    const hasVideo = Boolean(this.localStream.getVideoTracks().length);
    const status = document.querySelector("#meeting-focus-state");
    if (status) status.textContent = hasAudio && hasVideo ? "Camera and mic ready" : hasAudio ? "Microphone ready · camera unavailable" : hasVideo ? "Camera ready · microphone unavailable" : "Joined without camera or microphone";
    const micButton = document.querySelector('[data-meeting-action="mic"]');
    const cameraButton = document.querySelector('[data-meeting-action="camera"]');
    if (!hasAudio) micButton?.classList.remove("active");
    if (!hasVideo) cameraButton?.classList.remove("active");
    if (!hasAudio || !hasVideo) this.toast(`${!hasAudio && !hasVideo ? "Camera and microphone were" : !hasAudio ? "Microphone was" : "Camera was"} unavailable. The rest of the meeting still works.`);
    await Promise.allSettled([...this.peers.keys()].map((userId) => this.syncPeerSenders(userId)));
  }

  async peerFor(userId) {
    const id = String(userId || "");
    if (this.peers.has(id)) return this.peers.get(id);
    const peer = new RTCPeerConnection({ iceServers: this.iceServers });
    const audioTrack = this.localStream?.getAudioTracks()[0] || null;
    const videoTrack = this.screenStream?.getVideoTracks()[0] || this.localStream?.getVideoTracks()[0] || null;
    const screenAudioTrack = this.screenStream?.getAudioTracks()[0] || null;
    const audioTransceiver = peer.addTransceiver(audioTrack || "audio", {
      direction: "sendrecv",
      ...(audioTrack ? { streams: [this.localStream] } : {})
    });
    const videoStream = this.screenStream || this.localStream;
    const videoTransceiver = peer.addTransceiver(videoTrack || "video", {
      direction: "sendrecv",
      ...(videoTrack && videoStream ? { streams: [videoStream] } : {})
    });
    const screenAudioTransceiver = peer.addTransceiver(screenAudioTrack || "audio", {
      direction: "sendrecv",
      ...(screenAudioTrack && this.screenStream ? { streams: [this.screenStream] } : {})
    });
    const state = {
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      remoteStream: new MediaStream(),
      audioSender: audioTransceiver.sender,
      videoSender: videoTransceiver.sender,
      screenAudioSender: screenAudioTransceiver.sender,
      disconnectTimer: null
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal("candidate", event.candidate.toJSON(), id).catch(() => this.updatePeerStatus(id, "Signaling interrupted"));
    };
    peer.ontrack = (event) => {
      if (!state.remoteStream.getTracks().some((track) => track.id === event.track.id)) state.remoteStream.addTrack(event.track);
      this.showRemoteStream(id, state.remoteStream);
    };
    peer.onconnectionstatechange = () => {
      clearTimeout(state.disconnectTimer);
      if (peer.connectionState === "connected") {
        this.updatePeerStatus(id, "Connected");
        return;
      }
      if (peer.connectionState === "disconnected") {
        this.updatePeerStatus(id, "Reconnecting…");
        state.disconnectTimer = setTimeout(() => {
          if (peer.connectionState === "disconnected") this.recoverPeer(id);
        }, 8000);
        return;
      }
      if (peer.connectionState === "failed") {
        this.updatePeerStatus(id, "Reconnecting…");
        this.recoverPeer(id);
      }
    };
    this.peers.set(id, peer);
    this.peerStates.set(id, state);
    this.updatePeerStatus(id, "Connecting…");
    return peer;
  }

  async syncPeerSenders(userId) {
    const id = String(userId || "");
    const state = this.peerStates.get(id);
    if (!state) return;
    const audioTrack = this.localStream?.getAudioTracks()[0] || null;
    const videoTrack = this.screenStream?.getVideoTracks()[0] || this.localStream?.getVideoTracks()[0] || null;
    const screenAudioTrack = this.screenStream?.getAudioTracks()[0] || null;
    await Promise.all([
      state.audioSender.replaceTrack(audioTrack),
      state.videoSender.replaceTrack(videoTrack),
      state.screenAudioSender.replaceTrack(screenAudioTrack)
    ]);
  }

  async offerTo(userId, { iceRestart = false } = {}) {
    const id = String(userId || "");
    if (!id || id === String(this.getUser()?.id || "") || this.closed) return;
    const peer = await this.peerFor(id);
    const state = this.peerStates.get(id);
    if (!state || state.makingOffer || peer.signalingState === "closed") return;
    try {
      state.makingOffer = true;
      await this.syncPeerSenders(id);
      const offer = await peer.createOffer({ iceRestart });
      if (peer.signalingState !== "stable") return;
      await peer.setLocalDescription(offer);
      await this.sendSignal("offer", peer.localDescription || offer, id);
    } finally {
      state.makingOffer = false;
    }
  }

  async sendSignal(kind, payload, recipientId = "") {
    if (!this.meeting || this.closed) return;
    await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/signals`, { method: "POST", body: JSON.stringify({ kind, payload, recipientId }) });
  }

  async closeForMeetingAccessError(error) {
    if (![403, 404].includes(Number(error?.status))) return false;
    if (!this.closed) {
      const message = Number(error.status) === 403
        ? error.message
        : "This meeting is no longer available.";
      await this.close({ quiet: true });
      this.toast(message);
    }
    return true;
  }

  async pollSignals() {
    if (!this.meeting || this.closed || this.signalPollBusy) return;
    this.signalPollBusy = true;
    try {
      let data;
      try {
        data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/signals?cursor=${encodeURIComponent(this.signalCursor)}`);
      } catch (error) {
        if (await this.closeForMeetingAccessError(error)) return;
        if (!this.closed) this.updateMeetingStatus("Signaling interrupted · retrying");
        return;
      }
      for (const signal of data.signals || []) {
        try {
          await this.handleSignal(signal);
        } catch {
          if (!this.closed) {
            this.updateMeetingStatus("Skipped an invalid meeting update");
            if (["offer", "answer", "candidate"].includes(signal.kind) && this.peerStates.has(String(signal.senderId || ""))) {
              this.recoverPeer(signal.senderId).catch(() => {});
            }
          }
        } finally {
          this.signalCursor = Math.max(this.signalCursor, Number(signal.cursor || 0));
        }
      }
    } finally {
      this.signalPollBusy = false;
    }
  }

  async handleSignal(signal) {
    if (signal.kind === "leave") {
      this.removePeer(signal.senderId, { removeParticipant: true });
      return;
    }
    if (signal.kind === "state") {
      if (signal.payload?.caption) await this.showCaption(signal.payload.caption, signal.senderId);
      if (signal.payload?.boardCursor) {
        this.remoteBoardCursors.set(String(signal.senderId), { ...signal.payload.boardCursor, updatedAt: Date.now() });
        this.renderWhiteboard();
      }
      if (signal.payload?.boardViewport && this.meeting?.settings?.presenterMode && signal.senderId === this.meeting.hostId && !this.canModerate()) {
        const viewport = document.querySelector("#meeting-board-viewport");
        const view = signal.payload.boardViewport;
        if (view.page && this.boardPages.includes(Number(view.page))) this.boardPage = Number(view.page);
        if (view.zoom) this.boardZoom = clamp(Number(view.zoom), 0.35, 1.6);
        this.applyBoardZoom();
        if (viewport) viewport.scrollTo({ left: Number(view.left || 0), top: Number(view.top || 0), behavior: "smooth" });
        this.syncBoardControls();
        this.renderWhiteboard();
      }
      return;
    }
    const peer = await this.peerFor(signal.senderId);
    const state = this.peerStates.get(String(signal.senderId));
    if (!state) return;
    if (signal.kind === "offer") {
      const offerCollision = state.makingOffer || peer.signalingState !== "stable";
      const polite = String(this.getUser()?.id || "") > String(signal.senderId);
      state.ignoreOffer = !polite && offerCollision;
      if (state.ignoreOffer) return;
      if (offerCollision) {
        try { await peer.setLocalDescription({ type: "rollback" }); } catch {}
      }
      await peer.setRemoteDescription(signal.payload);
      await this.flushPendingCandidates(signal.senderId);
      await this.syncPeerSenders(signal.senderId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await this.sendSignal("answer", peer.localDescription || answer, signal.senderId);
    } else if (signal.kind === "answer") {
      state.ignoreOffer = false;
      if (peer.signalingState === "have-local-offer") {
        await peer.setRemoteDescription(signal.payload);
        await this.flushPendingCandidates(signal.senderId);
      }
    } else if (signal.kind === "candidate") {
      if (state.ignoreOffer) return;
      if (peer.remoteDescription) {
        try { await peer.addIceCandidate(signal.payload); } catch {}
      } else {
        state.pendingCandidates.push(signal.payload);
      }
    }
  }

  async flushPendingCandidates(userId) {
    const state = this.peerStates.get(String(userId || ""));
    const peer = this.peers.get(String(userId || ""));
    if (!state || !peer?.remoteDescription) return;
    const pending = state.pendingCandidates.splice(0);
    for (const candidate of pending) {
      try { await peer.addIceCandidate(candidate); } catch {}
    }
  }

  showRemoteStream(userId, stream) {
    const id = String(userId || "");
    this.streams.set(id, stream);
    if (!this.participantMeta.has(id)) this.participantMeta.set(id, { userId: id, displayName: "Village member", role: "participant" });
    this.syncParticipantStrip([...this.participantMeta.values()]);
    this.attachStream(id, stream);
    this.attachRemoteAudio(id, stream);
    if (!this.activeSpeakerId || this.activeSpeakerId === String(this.getUser()?.id || "")) this.focusParticipant(id);
  }

  updateMeetingStatus(text) {
    const status = document.querySelector("#meeting-status");
    if (status) status.textContent = text;
  }

  updatePeerStatus(userId, text) {
    const id = String(userId || "");
    if (this.activeSpeakerId === id) {
      const status = document.querySelector("#meeting-focus-state");
      if (status) status.textContent = text;
    }
    const thumbnail = document.querySelector(`#meeting-video-strip [data-user-id="${CSS.escape(id)}"]`);
    if (thumbnail) thumbnail.dataset.connectionState = String(text || "").toLowerCase().replace(/\W+/g, "-");
    if (text === "Connected") this.updateMeetingStatus(this.meeting?.status || "live");
  }

  async recoverPeer(userId) {
    const id = String(userId || "");
    if (!id || this.closed || this.peerRecoveryTimers.has(id)) return;
    const peer = this.peers.get(id);
    try {
      if (peer && peer.signalingState === "stable") {
        peer.restartIce?.();
        await this.offerTo(id, { iceRestart: true });
        return;
      }
    } catch (error) {
      if (await this.closeForMeetingAccessError(error)) return;
    }
    this.removePeer(id);
    const timer = setTimeout(() => {
      this.peerRecoveryTimers.delete(id);
      if (!this.closed && this.participantMeta.has(id)) this.offerTo(id).catch(() => {});
    }, 500);
    this.peerRecoveryTimers.set(id, timer);
  }

  removePeer(userId, { removeParticipant = false } = {}) {
    const id = String(userId || "");
    const state = this.peerStates.get(id);
    clearTimeout(state?.disconnectTimer);
    this.peers.get(id)?.close();
    this.peers.delete(id);
    this.peerStates.delete(id);
    this.streams.delete(id);
    const audio = document.querySelector(`#meeting-remote-audio [data-audio-user-id="${CSS.escape(id)}"]`);
    if (audio) {
      audio.srcObject = null;
      audio.remove();
    }
    if (removeParticipant) {
      this.participantMeta.delete(id);
      document.querySelector(`#meeting-video-strip [data-user-id="${CSS.escape(id)}"]`)?.remove();
    } else {
      this.attachStream(id, null);
    }
    if (this.activeSpeakerId === id) this.focusParticipant(String(this.getUser()?.id || ""));
  }

  async refreshWorkspace() {
    if (!this.meeting || this.closed) return;
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}`);
      this.meeting = data.meeting;
      this.polls = data.polls || [];
      const mine = (data.participants || []).find((participant) => participant.mine || String(participant.userId) === String(this.getUser()?.id || ""));
      if (mine) this.raisedHand = Boolean(mine.raisedHand);
      this.syncParticipantStrip(data.participants || []);
      const localId = String(this.getUser()?.id || "");
      const remoteIds = new Set((data.participants || []).map((participant) => String(participant.userId || "")).filter((id) => id && id !== localId));
      for (const peerId of [...this.peers.keys()]) {
        if (!remoteIds.has(peerId)) this.removePeer(peerId, { removeParticipant: true });
      }
      await Promise.allSettled([...remoteIds].filter((id) => !this.peers.has(id)).map((id) => this.offerTo(id)));
      const participants = document.querySelector("#meeting-participants");
      if (participants) participants.innerHTML = this.participantsHtml(data.participants || []);
      const count = document.querySelector("#meeting-participant-count");
      if (count) count.textContent = String((data.participants || []).length);
      const polls = document.querySelector("#meeting-poll-list");
      if (polls) polls.innerHTML = this.pollsHtml(data.polls || []);
      const picker = document.querySelector("#meeting-chat-recipient-picker > div");
      if (picker) picker.innerHTML = this.chatRecipientPickerHtml(data.participants || []);
      const handButton = document.querySelector('[data-meeting-action="hand"]');
      handButton?.classList.toggle("active", this.raisedHand);
      if (handButton?.querySelector("span")) handButton.querySelector("span").textContent = this.raisedHand ? "Lower" : "Raise";
      this.syncLivePoll(data.polls || []);
      if (data.meeting.status === "ended") await this.close();
      await this.refreshChat();
    } catch (error) {
      await this.closeForMeetingAccessError(error);
    }
  }

  async refreshChat() {
    if (!this.meeting || this.closed) return;
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/messages`);
      const list = document.querySelector("#meeting-chat-list");
      if (!list) return;
      const stayAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
      this.chatMessages = data.messages || [];
      list.innerHTML = this.chatMessages.map((message) => this.chatMessageHtml(message)).join("") || `<p class="meeting-empty">No messages in this meeting yet.</p>`;
      if (stayAtBottom || !list.dataset.loaded) list.scrollTop = list.scrollHeight;
      list.dataset.loaded = "true";
    } catch (error) {
      await this.closeForMeetingAccessError(error);
    }
  }

  chatMessageHtml(message = {}) {
    const chatWritable = this.canChatWrite();
    const recipientNames = (message.recipientIds || []).map((id) => this.participantMeta.get(String(id))?.displayName || "Participant");
    const audience = message.audience === "private" ? `Private · ${recipientNames.join(", ")}` : message.audience === "group" ? `Group · ${recipientNames.join(", ")}` : "Everyone";
    const body = message.deletedAt ? `<p class="meeting-message-deleted">Message deleted</p>` : message.body ? `<div class="meeting-message-body">${meetingMessageBody(message.body, message.format)}</div>` : "";
    const attachment = !message.deletedAt && message.attachment ? (String(message.attachment.mime || "").startsWith("image/")
      ? `<a class="meeting-chat-image" href="${escapeHtml(message.attachment.dataUrl)}" download="${escapeHtml(message.attachment.name)}"><img src="${escapeHtml(message.attachment.dataUrl)}" alt="${escapeHtml(message.attachment.name)}"><span>${escapeHtml(message.attachment.name)}</span></a>`
      : `<a class="meeting-chat-file" href="${escapeHtml(message.attachment.dataUrl)}" download="${escapeHtml(message.attachment.name)}">${icon("download")}<span><strong>${escapeHtml(message.attachment.name)}</strong><small>${escapeHtml(message.attachment.mime || "File")}</small></span></a>`) : "";
    const cloud = !message.deletedAt && message.metadata?.cloudUrl ? `<a class="meeting-chat-file" href="${escapeHtml(message.metadata.cloudUrl)}" target="_blank" rel="noopener">${icon("link")}<span><strong>${escapeHtml(message.metadata.cloudProvider || "Cloud file")}</strong><small>${escapeHtml(message.metadata.cloudUrl)}</small></span></a>` : "";
    const reply = message.replyTo ? `<blockquote><strong>${escapeHtml(message.replyTo.author || "Participant")}</strong><span>${escapeHtml(message.replyTo.body || "Message deleted")}</span></blockquote>` : "";
    const reactions = Object.entries(message.reactions || {}).map(([emoji, state]) => chatWritable
      ? `<button type="button" data-meeting-action="chat-react" data-message-id="${escapeHtml(message.id)}" data-emoji="${escapeHtml(emoji)}" class="${state.mine ? "active" : ""}">${escapeHtml(emoji)} ${Number(state.count || 0)}</button>`
      : `<span class="${state.mine ? "active" : ""}">${escapeHtml(emoji)} ${Number(state.count || 0)}</span>`).join("");
    return `<article class="meeting-chat-message${message.mine ? " mine" : ""}${message.deletedAt ? " deleted" : ""}" data-message-id="${escapeHtml(message.id)}">
      <span class="meeting-chat-avatar">${message.avatarDataUrl ? `<img src="${escapeHtml(message.avatarDataUrl)}" alt="">` : escapeHtml(String(message.author || "V").charAt(0))}</span>
      <div class="meeting-chat-bubble">
        <header><strong>${escapeHtml(message.author || "Village member")}</strong><span>${escapeHtml(audience)}</span><time>${escapeHtml(new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time></header>
        ${reply}${body}${attachment}${cloud}
        ${message.deletedAt ? "" : `<footer><div class="meeting-message-reactions">${reactions}${chatWritable ? `<button type="button" data-meeting-action="chat-react" data-message-id="${escapeHtml(message.id)}" data-emoji="👍" title="React">＋</button>` : ""}</div><div>${chatWritable ? `<button type="button" data-meeting-action="chat-reply" data-message-id="${escapeHtml(message.id)}">${icon("reply")}<span>Reply</span></button>` : ""}${message.mine ? `<button type="button" data-meeting-action="chat-delete" data-message-id="${escapeHtml(message.id)}">${icon("trash")}<span>Delete</span></button>` : ""}</div></footer>`}
      </div>
    </article>`;
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (event.target.id === "meeting-invite-form") {
      const form = event.target;
      if (!this.canChatWrite()) {
        const error = form.querySelector(".form-error");
        if (error) error.textContent = "Meeting invitations are unavailable while your Community chat mute is active.";
        return;
      }
      const recipientIds = new FormData(form).getAll("recipientIds").map(String);
      const error = form.querySelector(".form-error");
      if (!recipientIds.length) {
        if (error) error.textContent = "Choose at least one friend.";
        return;
      }
      try {
        const result = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/invitations`, {
          method: "POST",
          body: JSON.stringify({ recipientIds })
        });
        this.toast(result.invited === 1 ? "Meeting invitation sent." : `${result.invited} meeting invitations sent.`);
        await this.refreshMeetingInvitations();
      } catch (failure) {
        if (error) error.textContent = failure.message;
      }
      return;
    }
    if (event.target.id === "meeting-chat-form") {
      const form = event.target;
      if (!this.canChatWrite()) {
        const error = form.querySelector(".form-error");
        if (error) error.textContent = "Meeting chat is read-only while your Community chat mute is active.";
        return;
      }
      try {
        const attachment = await readFileDataUrl(this.chatFile || document.querySelector("#meeting-chat-file")?.files?.[0]);
        const message = new FormData(form).get("message");
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/messages`, {
          method: "POST",
          body: JSON.stringify({
            message,
            attachment,
            audience: this.chatAudience.audience,
            recipientIds: this.chatAudience.recipientIds,
            replyToId: this.chatReplyTo?.id || "",
            format: this.chatFormat,
            metadata: this.pendingCloudMetadata || {}
          })
        });
        form.querySelector("textarea[name='message']").value = "";
        this.chatFile = null;
        this.pendingCloudMetadata = null;
        this.chatReplyTo = null;
        if (document.querySelector("#meeting-chat-file")) document.querySelector("#meeting-chat-file").value = "";
        if (document.querySelector("#meeting-chat-file-name")) document.querySelector("#meeting-chat-file-name").textContent = "";
        this.syncChatComposer();
        await this.refreshChat();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
      return;
    }
    if (event.target.id === "meeting-poll-form") {
      const form = event.target;
      if (!this.canChatWrite()) {
        const error = form.querySelector(".form-error");
        if (error) error.textContent = "Creating polls is unavailable while your Community chat mute is active.";
        return;
      }
      const data = new FormData(form);
      try {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/polls`, {
          method: "POST",
          body: JSON.stringify({
            question: data.get("question"),
            options: String(data.get("options") || "").split(/\r?\n/),
            multiple: data.has("multiple"),
            anonymous: data.has("anonymous"),
            showLiveResults: data.has("showLiveResults"),
            durationSeconds: Number(data.get("durationSeconds") || 0)
          })
        });
        form.reset();
        form.querySelector("[name='showLiveResults']").checked = true;
        await this.refreshWorkspace();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
      return;
    }
    if (event.target.id === "meeting-live-poll-form") {
      const form = event.target;
      const poll = this.polls.find((item) => item.id === form.dataset.pollId);
      if (!poll) return;
      const data = new FormData(form);
      const optionIndexes = data.getAll("option").map(Number);
      try {
        await this.api(`/api/community/polls/${encodeURIComponent(poll.id)}/vote`, { method: "POST", body: JSON.stringify({ optionIndexes }) });
        await this.refreshWorkspace();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
      return;
    }
    if (event.target.id === "meeting-settings-form") {
      const form = event.target;
      const data = new FormData(form);
      try {
        const settings = {
          chatPolicy: data.get("chatPolicy"),
          privateChat: data.has("privateChat"),
          allowMemberPolls: data.has("allowMemberPolls"),
          whiteboardPermission: data.get("whiteboardPermission")
        };
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ settings }) });
        this.meeting.settings = { ...(this.meeting.settings || {}), ...settings };
        document.querySelector("#meeting-settings-dialog")?.classList.add("hidden");
        await this.refreshWorkspace();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
    }
  }

  async handleClick(event) {
    const button = event.target.closest("[data-meeting-action]");
    if (!button) return;
    const action = button.dataset.meetingAction;
    try {
      if (!this.canChatWrite() && MODERATION_BLOCKED_MEETING_ACTIONS.has(action)) {
        this.toast(action.startsWith("board-")
          ? "Whiteboard editing is unavailable while your Community chat mute is active."
          : "Meeting chat is read-only while your Community chat mute is active.");
        return;
      }
      if (action === "close") return this.close();
      if (action === "end") {
        if (confirm("End this meeting for everyone?")) {
          await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/end`, { method: "POST", body: "{}" });
          await this.close();
        }
        return;
      }
      if (action === "mic") return this.toggleTrack("audio", button);
      if (action === "camera") return this.toggleTrack("video", button);
      if (action === "screen") return this.toggleScreen(button);
      if (action === "record") return this.toggleRecording(button);
      if (action === "background") return this.toggleBackground(button);
      if (action === "hand") return this.toggleHand(button);
      if (action === "captions") return this.toggleCaptions(button);
      if (action === "focus-participant") return this.focusParticipant(button.dataset.userId);
      if (action === "sidebar-participants") return this.toggleSidebar("participants");
      if (action === "sidebar-chat") return this.toggleSidebar("chat");
      if (action === "sidebar-close") return this.toggleSidebar("");
      if (action === "settings") return document.querySelector("#meeting-settings-dialog")?.classList.remove("hidden");
      if (action === "settings-close") return document.querySelector("#meeting-settings-dialog")?.classList.add("hidden");
      if (action === "board") return this.toggleTool("meeting-whiteboard-panel", button);
      if (action === "poll") return this.toggleTool("meeting-poll-panel", button);
      if (action === "tool-close") {
        document.querySelectorAll(".meeting-tool-panel").forEach((panel) => panel.classList.add("hidden"));
        document.querySelectorAll('[data-meeting-action="board"],[data-meeting-action="poll"]').forEach((item) => item.classList.remove("active"));
        return;
      }
      if (action === "board-tool") return this.selectBoardTool(button.dataset.boardTool, button);
      if (action === "board-undo") return this.undoBoard();
      if (action === "board-redo") return this.redoBoard();
      if (action === "board-copy") return this.copyBoardSelection();
      if (action === "board-lock") return this.lockBoardSelection();
      if (action === "board-delete") return this.deleteBoardSelection();
      if (action === "board-clear") return this.clearWhiteboard(true);
      if (action === "board-add-page") return this.addBoardPage();
      if (action === "board-add-layer") return this.addBoardLayer();
      if (action === "board-version") return this.saveBoardVersion();
      if (action === "poll-start") {
        await this.api(`/api/community/polls/${encodeURIComponent(button.dataset.pollId)}/start`, { method: "POST", body: "{}" });
        document.querySelector("#meeting-poll-panel")?.classList.add("hidden");
        document.querySelector('[data-meeting-action="poll"]')?.classList.remove("active");
        return this.refreshWorkspace();
      }
      if (action === "poll-end") {
        await this.api(`/api/community/polls/${encodeURIComponent(button.dataset.pollId)}/end`, { method: "POST", body: "{}" });
        return this.refreshWorkspace();
      }
      if (action === "poll-open") return this.showLivePoll(this.polls.find((poll) => poll.id === button.dataset.pollId), true);
      if (action === "poll-export") return this.exportPoll(button.dataset.pollId);
      if (action === "poll-dismiss") {
        this.dismissedPollIds.add(button.dataset.pollId);
        document.querySelector("#meeting-live-poll")?.classList.add("hidden");
        return;
      }
      if (action === "chat-everyone") return this.setChatAudience({ audience: "everyone", recipientIds: [], label: "Everyone" });
      if (action === "chat-new") return document.querySelector("#meeting-chat-recipient-picker")?.classList.toggle("hidden");
      if (action === "chat-start") return this.startSelectedChat();
      if (action === "chat-reply") {
        this.chatReplyTo = this.chatMessages.find((message) => message.id === button.dataset.messageId) || null;
        return this.syncChatComposer(true);
      }
      if (action === "chat-cancel-reply") {
        this.chatReplyTo = null;
        return this.syncChatComposer();
      }
      if (action === "chat-format") return this.toggleChatFormat(button.dataset.format, button);
      if (action === "chat-emoji") return document.querySelector("#meeting-chat-emoji-picker")?.classList.toggle("hidden");
      if (action === "chat-insert-emoji") return this.insertChatEmoji(button.dataset.emoji);
      if (action === "chat-cloud") return this.addCloudChatFile();
      if (action === "chat-export") return this.exportChat();
      if (action === "chat-react") {
        await this.api(`/api/community/meeting-messages/${encodeURIComponent(button.dataset.messageId)}/reactions`, { method: "POST", body: JSON.stringify({ emoji: button.dataset.emoji }) });
        return this.refreshChat();
      }
      if (action === "chat-delete") {
        if (!confirm("Delete this message from the meeting chat?")) return;
        await this.api(`/api/community/meeting-messages/${encodeURIComponent(button.dataset.messageId)}`, { method: "DELETE" });
        return this.refreshChat();
      }
      if (action === "revoke-invitation") {
        if (!confirm("Revoke this meeting-only invitation?")) return;
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/invitations`, {
          method: "DELETE",
          body: JSON.stringify({ invitationId: button.dataset.invitationId })
        });
        return this.refreshMeetingInvitations();
      }
      if (action === "remove") {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ userId: button.dataset.userId, remove: true }) });
        this.removePeer(button.dataset.userId);
        return this.refreshWorkspace();
      }
      if (action === "cohost") {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ userId: button.dataset.userId, role: "cohost" }) });
        return this.refreshWorkspace();
      }
      if (action === "breakout") {
        const breakoutRoom = prompt("Breakout room name (leave blank for main room):", "");
        if (breakoutRoom === null) return;
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ userId: button.dataset.userId, breakoutRoom }) });
        return this.refreshWorkspace();
      }
    } catch (error) { this.toast(error.message); }
  }

  async handleChange(event) {
    const target = event.target;
    try {
      if (target.id === "meeting-chat-file") {
        this.chatFile = target.files?.[0] || null;
        const label = document.querySelector("#meeting-chat-file-name");
        if (label) label.textContent = this.chatFile?.name || "";
        return;
      }
      if (target.id === "meeting-caption-language") {
        if (!CAPTION_SPEECH_LANGUAGES.some(([value]) => value === target.value)) return;
        this.captionSpeechLanguage = target.value;
        this.saveCaptionPreferences();
        this.restartCaptionRecognition();
        return;
      }
      if (target.id === "meeting-caption-translation") {
        if (!CAPTION_TRANSLATION_LANGUAGES.some(([value]) => value === target.value)) return;
        this.captionTranslationLanguage = target.value;
        this.captionTranslationWarned = false;
        this.saveCaptionPreferences();
        return;
      }
      if (target.id === "meeting-board-file") {
        const file = target.files?.[0];
        if (file) await this.insertBoardFile(file);
        target.value = "";
        return;
      }
      if (target.id === "meeting-board-page") {
        this.boardPage = Number(target.value || 1);
        this.boardSelectedId = "";
        this.renderWhiteboard();
        return;
      }
      if (target.id === "meeting-board-layer") {
        this.boardLayer = Number(target.value || 1);
        this.boardSelectedId = "";
        this.renderWhiteboard();
        return;
      }
      if (target.id === "meeting-board-insert" && target.value) {
        await this.insertBoardObject(target.value);
        target.value = "";
        return;
      }
      if (target.id === "meeting-board-versions" && target.value) {
        await this.restoreBoardVersion(target.value);
        target.value = "";
        return;
      }
      if (target.id === "meeting-board-permission") {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ settings: { whiteboardPermission: target.value } }) });
        this.meeting.settings.whiteboardPermission = target.value;
        this.toast(`Whiteboard access changed to ${target.value}.`);
        return;
      }
      if (target.id === "meeting-presenter-mode") {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ settings: { presenterMode: target.checked } }) });
        this.meeting.settings.presenterMode = target.checked;
      }
    } catch (error) { this.toast(error.message); }
  }

  handleInput(event) {
    const target = event.target;
    if (target.id === "meeting-board-color") this.boardColor = target.value;
    if (target.id === "meeting-board-width") {
      this.boardWidth = Number(target.value || 4);
      const output = document.querySelector("#meeting-board-width-value");
      if (output) output.textContent = String(this.boardWidth);
    }
    if (target.id === "meeting-board-zoom") {
      this.boardZoom = Number(target.value || 70) / 100;
      this.applyBoardZoom();
    }
  }

  setChatAudience(next) {
    this.chatAudience = next;
    document.querySelector("#meeting-chat-recipient-picker")?.classList.add("hidden");
    document.querySelectorAll('input[name="meeting-chat-recipient"]').forEach((input) => { input.checked = false; });
    document.querySelector('[data-meeting-action="chat-everyone"]')?.classList.toggle("active", next.audience === "everyone");
    document.querySelector('[data-meeting-action="chat-new"]')?.classList.toggle("active", next.audience !== "everyone");
    const scope = document.querySelector("#meeting-chat-scope");
    if (scope) scope.textContent = next.audience === "everyone" ? "Only saved in this meeting" : `${next.label} · private to selected people`;
    const textarea = document.querySelector("#meeting-chat-form textarea");
    if (textarea) {
      textarea.placeholder = `Message ${next.label}`;
      textarea.focus();
    }
  }

  startSelectedChat() {
    const ids = [...document.querySelectorAll('input[name="meeting-chat-recipient"]:checked')].map((input) => input.value);
    if (!ids.length) return this.toast("Choose at least one participant.");
    const names = ids.map((id) => this.participantMeta.get(String(id))?.displayName || "Participant");
    this.setChatAudience({ audience: ids.length === 1 ? "private" : "group", recipientIds: ids, label: names.join(", ") });
  }

  syncChatComposer(focus = false) {
    const banner = document.querySelector("#meeting-chat-reply");
    if (banner) {
      banner.classList.toggle("hidden", !this.chatReplyTo);
      const text = banner.querySelector("span");
      if (text) text.textContent = this.chatReplyTo ? `Replying to ${this.chatReplyTo.author}: ${this.chatReplyTo.body || "attachment"}` : "";
    }
    if (focus) document.querySelector("#meeting-chat-form textarea")?.focus();
  }

  toggleChatFormat(name, button) {
    if (name === "list") this.chatFormat.list = this.chatFormat.list ? false : "bullets";
    else this.chatFormat[name] = !this.chatFormat[name];
    button.classList.toggle("active", Boolean(this.chatFormat[name]));
  }

  insertChatEmoji(emoji) {
    const textarea = document.querySelector("#meeting-chat-form textarea");
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.value = `${textarea.value.slice(0, start)}${emoji}${textarea.value.slice(end)}`;
    textarea.focus();
    textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    document.querySelector("#meeting-chat-emoji-picker")?.classList.add("hidden");
  }

  addCloudChatFile() {
    const cloudUrl = prompt("Paste a Google Drive, OneDrive, Box, or other HTTPS file link:", "");
    if (!cloudUrl) return;
    const cloudProvider = prompt("File source or label:", "Cloud file") || "Cloud file";
    this.pendingCloudMetadata = { cloudUrl, cloudProvider };
    const label = document.querySelector("#meeting-chat-file-name");
    if (label) label.textContent = cloudProvider;
    document.querySelector("#meeting-chat-form textarea")?.focus();
  }

  exportChat() {
    const lines = [
      this.meeting.title,
      `Meeting chat saved ${new Date().toLocaleString()}`,
      `Visible conversation: ${this.chatAudience.label}`,
      "",
      ...this.chatMessages.map((message) => `[${new Date(message.createdAt).toLocaleString()}] ${message.author} (${message.audience || "everyone"}): ${message.deletedAt ? "[deleted]" : message.body || message.attachment?.name || message.metadata?.cloudUrl || "[attachment]"}`)
    ];
    downloadMeetingFile(`${this.meeting.title.replace(/[^a-z0-9]+/gi, "-") || "meeting"}-chat.txt`, lines.join("\n"));
  }

  syncLivePoll(polls = []) {
    const active = polls.find((poll) => (poll.status || (poll.closed ? "closed" : "active")) === "active");
    const alert = document.querySelector("#meeting-poll-alert");
    alert?.classList.toggle("hidden", !active);
    if (!active) {
      clearInterval(this.pollCountdownTimer);
      document.querySelector("#meeting-live-poll")?.classList.add("hidden");
      return;
    }
    if (!this.dismissedPollIds.has(active.id)) this.showLivePoll(active);
    else if (!active.mySelections?.length) alert?.classList.remove("hidden");
  }

  showLivePoll(poll, force = false) {
    if (!poll) return;
    if (force) this.dismissedPollIds.delete(poll.id);
    const panel = document.querySelector("#meeting-live-poll");
    if (!panel) return;
    const selections = new Set((poll.mySelections || []).map(Number));
    const canModerate = this.canModerate();
    const voters = Number(poll.totalVoters || 0);
    const showResults = canModerate || poll.status === "closed" || (poll.showLiveResults !== false && selections.size > 0);
    const inputType = poll.multiple ? "checkbox" : "radio";
    panel.innerHTML = `
      <header><div><span>LIVE POLL</span><strong>${escapeHtml(poll.question)}</strong></div><button type="button" data-meeting-action="poll-dismiss" data-poll-id="${escapeHtml(poll.id)}">${icon("close")}<span class="sr-only">Close poll</span></button></header>
      <form id="meeting-live-poll-form" data-poll-id="${escapeHtml(poll.id)}">
        <div class="meeting-live-poll-options">${(poll.options || []).map((option, index) => {
          const count = Number(poll.votes?.[index] || 0);
          const percent = voters ? Math.round(count / voters * 100) : 0;
          return `<label class="${selections.has(index) ? "selected" : ""}"><input type="${inputType}" name="option" value="${index}"${selections.has(index) ? " checked" : ""}><span>${escapeHtml(option)}</span>${showResults ? `<i style="--poll-value:${percent}%"></i><b>${count} · ${percent}%</b>` : ""}</label>`;
        }).join("")}</div>
        <footer><div><span>${voters} voted · ${Math.max(0, Number(poll.participantCount || 0) - voters)} not voted</span>${poll.endsAt ? `<time id="meeting-poll-countdown" data-ends-at="${escapeHtml(poll.endsAt)}"></time>` : ""}</div><button type="submit">${selections.size ? "Update vote" : "Submit vote"}</button></footer>
        <p class="form-error"></p>
      </form>`;
    panel.classList.remove("hidden");
    this.startPollCountdown(poll);
  }

  startPollCountdown(poll) {
    clearInterval(this.pollCountdownTimer);
    if (!poll?.endsAt) return;
    const tick = () => {
      const output = document.querySelector("#meeting-poll-countdown");
      if (!output) return;
      const seconds = Math.max(0, Math.ceil((new Date(poll.endsAt).getTime() - Date.now()) / 1000));
      output.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      if (!seconds) {
        clearInterval(this.pollCountdownTimer);
        this.refreshWorkspace();
      }
    };
    tick();
    this.pollCountdownTimer = setInterval(tick, 1000);
  }

  exportPoll(pollId) {
    const poll = this.polls.find((item) => item.id === pollId);
    if (!poll) return;
    const voters = Number(poll.totalVoters || 0);
    const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [["Question", "Option", "Votes", "Percent"]];
    (poll.options || []).forEach((option, index) => {
      const count = Number(poll.votes?.[index] || 0);
      rows.push([poll.question, option, count, voters ? Math.round(count / voters * 100) : 0]);
    });
    if (poll.voters?.length) {
      rows.push([], ["Named voters", "Selections"]);
      poll.voters.forEach((voter) => rows.push([voter.displayName, (voter.optionIndexes || []).map((index) => poll.options[index]).join("; ")]));
    }
    downloadMeetingFile(`${this.meeting.title.replace(/[^a-z0-9]+/gi, "-") || "meeting"}-poll.csv`, rows.map((row) => row.map(quote).join(",")).join("\n"), "text/csv");
  }

  toggleTrack(kind, button) {
    const track = this.localStream?.getTracks().find((item) => item.kind === kind);
    if (!track) return this.toast(`${kind === "audio" ? "Microphone" : "Camera"} is unavailable.`);
    track.enabled = !track.enabled;
    button.classList.toggle("active", track.enabled);
    button.querySelector("span").textContent = kind === "audio" ? (track.enabled ? "Mic" : "Muted") : (track.enabled ? "Camera" : "Camera off");
    if (kind === "video") {
      const localId = String(this.getUser()?.id || "");
      document.querySelectorAll(`[data-user-id="${CSS.escape(localId)}"]`).forEach((tile) => tile.classList.toggle("camera-off", !track.enabled));
    }
  }

  async toggleScreen(button) {
    const localId = String(this.getUser()?.id || "");
    if (this.screenStream) {
      const previous = this.screenStream;
      this.screenStream = null;
      await Promise.allSettled([...this.peers.keys()].map((userId) => this.syncPeerSenders(userId)));
      previous.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      this.streams.set(localId, this.localStream);
      this.attachStream(localId, this.localStream);
      this.focusParticipant(localId);
      button.classList.remove("active");
      button.querySelector("span").textContent = "Share";
      return;
    }
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = this.screenStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error("No screen video track was selected.");
      await Promise.allSettled([...this.peers.keys()].map((userId) => this.syncPeerSenders(userId)));
      this.streams.set(localId, this.screenStream);
      this.attachStream(localId, this.screenStream);
      this.focusParticipant(localId);
      screenTrack.onended = () => {
        if (this.screenStream) this.toggleScreen(button).catch(() => {});
      };
      button.classList.add("active");
      button.querySelector("span").textContent = "Sharing";
    } catch (error) {
      this.screenStream?.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
      if (error?.name !== "NotAllowedError") this.toast(error?.message || "Screen sharing could not start.");
    }
  }

  toggleRecording(button) {
    if (this.recorder?.state === "recording") {
      this.recorder.stop();
      button.classList.remove("active");
      return;
    }
    if (!this.localStream?.getTracks().length || !window.MediaRecorder) return this.toast("Local recording is unavailable in this browser.");
    this.recordingChunks = [];
    this.recorder = new MediaRecorder(this.screenStream || this.localStream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm" });
    this.recorder.ondataavailable = (event) => { if (event.data.size) this.recordingChunks.push(event.data); };
    this.recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(this.recordingChunks, { type: "video/webm" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.meeting.title.replace(/[^a-z0-9]+/gi, "-") || "village-meeting"}.webm`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    this.recorder.start(1000);
    button.classList.add("active");
  }

  async toggleBackground(button) {
    this.virtualBackground = !this.virtualBackground;
    const localId = String(this.getUser()?.id || "");
    document.querySelectorAll(`[data-user-id="${CSS.escape(localId)}"]`).forEach((tile) => tile.classList.toggle("village-backdrop", this.virtualBackground));
    button.classList.toggle("active", this.virtualBackground);
    const track = this.localStream?.getVideoTracks()[0];
    if (track?.applyConstraints) {
      try { await track.applyConstraints({ advanced: [{ backgroundBlur: this.virtualBackground }] }); } catch {}
    }
  }

  async toggleHand(button) {
    this.raisedHand = !this.raisedHand;
    await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/state`, { method: "PATCH", body: JSON.stringify({ raisedHand: this.raisedHand }) });
    button.classList.toggle("active", this.raisedHand);
    button.querySelector("span").textContent = this.raisedHand ? "Lower" : "Raise";
    await this.refreshWorkspace();
  }

  toggleCaptions(button) {
    if (this.captionsWanted) return this.stopCaptions({ button });
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return this.toast("Live captions are unavailable in this browser.");
    this.captionsWanted = true;
    this.captionRestartAttempt = 0;
    this.voiceControlWasSuspended = Boolean(this.suspendVoiceControl());
    button.classList.add("active");
    button.querySelector("span").textContent = "Captions on";
    this.startCaptionRecognition();
  }

  startCaptionRecognition() {
    if (!this.captionsWanted || this.closed || this.captionRecognition) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return this.stopCaptions({ notify: "Live captions are unavailable in this browser." });
    const recognition = new Recognition();
    this.captionRecognition = recognition;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = this.captionSpeechLanguage;
    recognition.onresult = (event) => {
      this.captionRestartAttempt = 0;
      let interim = "";
      for (let index = Number(event.resultIndex || 0); index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result?.[0]?.transcript || "").trim().slice(0, 1000);
        if (!text) continue;
        if (!result.isFinal) {
          interim = `${interim} ${text}`.trim();
          continue;
        }
        const caption = {
          id: meetingId(),
          text,
          sourceLanguage: this.captionSpeechLanguage,
          final: true,
          createdAt: new Date().toISOString()
        };
        this.showCaption(caption, this.getUser()?.id);
        this.sendSignal("state", { caption }).catch(() => this.updateMeetingStatus("Caption sync interrupted · retrying"));
      }
      if (interim) this.showCaption({
        id: `interim-${Date.now()}`,
        text: interim,
        sourceLanguage: this.captionSpeechLanguage,
        final: false
      }, this.getUser()?.id);
    };
    recognition.onerror = (event) => {
      const fatal = ["not-allowed", "service-not-allowed", "audio-capture"].includes(String(event.error || ""));
      if (fatal) {
        this.stopCaptions({ notify: event.error === "audio-capture" ? "No microphone is available for captions." : "Microphone permission is required for captions." });
      }
    };
    recognition.onend = () => {
      if (this.captionRecognition === recognition) this.captionRecognition = null;
      if (this.captionsWanted && !this.closed) this.scheduleCaptionRestart();
    };
    try {
      recognition.start();
    } catch {
      this.captionRecognition = null;
      this.scheduleCaptionRestart();
    }
  }

  scheduleCaptionRestart(delay) {
    if (!this.captionsWanted || this.closed) return;
    clearTimeout(this.captionRestartTimer);
    const wait = Number.isFinite(delay) ? delay : Math.min(5000, 350 * (2 ** Math.min(this.captionRestartAttempt, 4)));
    this.captionRestartAttempt += 1;
    this.captionRestartTimer = setTimeout(() => {
      this.captionRestartTimer = null;
      this.startCaptionRecognition();
    }, wait);
  }

  restartCaptionRecognition() {
    if (!this.captionsWanted) return;
    clearTimeout(this.captionRestartTimer);
    this.captionRestartTimer = null;
    const recognition = this.captionRecognition;
    this.captionRecognition = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.stop(); } catch {}
    }
    this.captionRestartAttempt = 0;
    this.scheduleCaptionRestart(120);
  }

  stopCaptions({ button = document.querySelector('[data-meeting-action="captions"]'), notify = "", resumeVoice = true } = {}) {
    this.captionsWanted = false;
    clearTimeout(this.captionRestartTimer);
    this.captionRestartTimer = null;
    const recognition = this.captionRecognition;
    this.captionRecognition = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try { recognition.stop(); } catch {}
    }
    button?.classList.remove("active");
    const label = button?.querySelector("span");
    if (label) label.textContent = "Captions";
    if (resumeVoice && this.voiceControlWasSuspended) this.resumeVoiceControl(true);
    this.voiceControlWasSuspended = false;
    if (notify) this.toast(notify);
  }

  renderCaption({ speaker, text, original = "", status = "" }) {
    const captions = document.querySelector("#meeting-captions");
    if (!captions) return;
    captions.replaceChildren();
    const heading = document.createElement("strong");
    heading.textContent = `${speaker}: `;
    const primary = document.createElement("span");
    primary.textContent = text;
    captions.append(heading, primary);
    if (original && original !== text) {
      const source = document.createElement("small");
      source.textContent = original;
      captions.append(source);
    }
    if (status) {
      const note = document.createElement("em");
      note.textContent = status;
      captions.append(note);
    }
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => captions.replaceChildren(), 9000);
  }

  async showCaption(value, userId) {
    const caption = typeof value === "string" ? { id: meetingId(), text: value, sourceLanguage: "", final: true } : value || {};
    const text = String(caption.text || "").trim().slice(0, 1000);
    if (!text) return;
    const id = String(userId || "");
    const participant = this.participantMeta.get(id);
    const speaker = id === String(this.getUser()?.id || "") ? "You" : participant?.displayName || "Participant";
    const displayToken = ++this.captionDisplayToken;
    const targetLanguage = this.captionTranslationLanguage;
    const sourceLanguage = String(caption.sourceLanguage || "");
    const exactLanguage = sourceLanguage.toLowerCase() === targetLanguage.toLowerCase();
    const sameBaseLanguage = !targetLanguage.includes("-") && sourceLanguage.toLowerCase().startsWith(`${targetLanguage.toLowerCase()}-`);
    if (!caption.final || !targetLanguage || exactLanguage || sameBaseLanguage) {
      this.renderCaption({ speaker, text });
      return;
    }
    const targetLabel = CAPTION_TRANSLATION_LANGUAGES.find(([value]) => value === targetLanguage)?.[1] || targetLanguage;
    this.renderCaption({ speaker, text, status: `Translating to ${targetLabel}…` });
    const cacheKey = `${targetLanguage}\u0000${sourceLanguage}\u0000${text}`;
    try {
      let translation = this.captionTranslationCache.get(cacheKey);
      if (!translation) {
        const result = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/translate`, {
          method: "POST",
          body: JSON.stringify({ text, sourceLanguage, targetLanguage })
        });
        translation = String(result.translation || "").trim();
        if (translation) {
          this.captionTranslationCache.set(cacheKey, translation);
          if (this.captionTranslationCache.size > 200) this.captionTranslationCache.delete(this.captionTranslationCache.keys().next().value);
        }
      }
      if (displayToken === this.captionDisplayToken && translation) this.renderCaption({ speaker, text: translation, original: text });
    } catch {
      if (displayToken === this.captionDisplayToken) this.renderCaption({ speaker, text, status: "Translation unavailable" });
      if (!this.captionTranslationWarned) {
        this.captionTranslationWarned = true;
        this.toast("Caption translation is unavailable right now; original captions will continue.");
      }
    }
  }

  toggleTool(id, button) {
    const panel = document.querySelector(`#${id}`);
    if (!panel) return;
    const opening = panel.classList.contains("hidden");
    document.querySelectorAll(".meeting-tool-panel").forEach((item) => item.classList.add("hidden"));
    document.querySelectorAll('[data-meeting-action="board"],[data-meeting-action="poll"]').forEach((item) => item.classList.remove("active"));
    panel.classList.toggle("hidden", !opening);
    button.classList.toggle("active", opening);
    if (id === "meeting-whiteboard-panel" && opening) {
      this.pollWhiteboard();
      this.renderWhiteboard();
    }
  }

  toggleSidebar(view) {
    const layout = document.querySelector(".meeting-layout");
    const sidebar = document.querySelector(".meeting-sidebar");
    if (!layout || !sidebar) return;
    const opening = Boolean(view);
    sidebar.classList.toggle("hidden", !opening);
    layout.classList.toggle("sidebar-closed", !opening);
    if (!opening) {
      document.querySelectorAll('[data-meeting-action^="sidebar-"]').forEach((item) => item.classList.remove("active"));
      return;
    }
    sidebar.dataset.sidebarView = view;
    document.querySelectorAll("[data-meeting-sidebar-panel]").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.meetingSidebarPanel !== view);
    });
    document.querySelectorAll('[data-meeting-action="sidebar-participants"]').forEach((item) => item.classList.toggle("active", view === "participants"));
    document.querySelectorAll('[data-meeting-action="sidebar-chat"]').forEach((item) => item.classList.toggle("active", view === "chat"));
  }

  setupWhiteboard() {
    const canvas = document.querySelector("#meeting-whiteboard");
    if (!canvas) return;
    let pointerId = null;
    const finish = async () => {
      if (!this.boardDraft) return;
      const draft = this.boardDraft;
      this.boardDraft = null;
      if (draft.tool === "eraser") {
        const ids = new Set();
        draft.points.forEach((point) => {
          const hit = this.hitBoardObject(point, Math.max(18, this.boardWidth * 2));
          if (hit && !hit.locked) ids.add(hit.id);
        });
        for (const id of ids) await this.postBoardEvent({ type: "delete", objectId: id });
      } else {
        await this.postBoardEvent({ type: "object", object: draft });
      }
      this.renderWhiteboard();
    };
    canvas.addEventListener("pointerdown", async (event) => {
      if (event.button !== 0) return;
      if (!this.canChatWrite()) return this.toast("Whiteboard editing is unavailable while your Community chat mute is active.");
      const point = this.boardPoint(event);
      if (this.boardTool === "select") {
        const selected = this.hitBoardObject(point);
        this.boardSelectedId = selected?.id || "";
        if (selected && !selected.locked && this.boardCanEdit("select")) {
          this.boardDrag = {
            pointerId: event.pointerId,
            start: point,
            original: structuredClone(selected)
          };
          canvas.setPointerCapture(event.pointerId);
        }
        this.renderWhiteboard();
        return;
      }
      if (!this.boardCanEdit(this.boardTool)) return this.toast("The host limited whiteboard editing.");
      if (["text", "sticky"].includes(this.boardTool)) {
        await this.insertBoardObject(this.boardTool, point);
        return;
      }
      pointerId = event.pointerId;
      canvas.setPointerCapture(pointerId);
      if (["pen", "highlighter", "eraser"].includes(this.boardTool)) {
        this.boardDraft = {
          id: meetingId(),
          type: "stroke",
          tool: this.boardTool,
          page: this.boardPage,
          layer: this.boardLayer,
          color: this.boardColor,
          width: this.boardTool === "highlighter" ? Math.max(12, this.boardWidth * 3) : this.boardTool === "eraser" ? Math.max(20, this.boardWidth * 4) : this.boardWidth,
          points: [point],
          createdBy: this.getUser()?.id,
          locked: false
        };
      } else {
        this.boardDraft = {
          id: meetingId(),
          type: this.boardTool,
          page: this.boardPage,
          layer: this.boardLayer,
          color: this.boardColor,
          width: this.boardWidth,
          from: point,
          to: point,
          createdBy: this.getUser()?.id,
          locked: false
        };
      }
    });
    canvas.addEventListener("pointermove", (event) => {
      const point = this.boardPoint(event);
      this.broadcastBoardCursor(point);
      if (this.boardDrag?.pointerId === event.pointerId) {
        const object = structuredClone(this.boardDrag.original);
        const dx = point.x - this.boardDrag.start.x;
        const dy = point.y - this.boardDrag.start.y;
        if (object.from) {
          object.from.x += dx;
          object.from.y += dy;
          object.to.x += dx;
          object.to.y += dy;
        } else if (object.points) {
          object.points = object.points.map((item) => ({ x: item.x + dx, y: item.y + dy }));
        } else {
          object.x += dx;
          object.y += dy;
        }
        this.boardObjects.set(object.id, object);
        this.renderWhiteboard();
        return;
      }
      if (!this.boardDraft || pointerId !== event.pointerId) return;
      if (this.boardDraft.type === "stroke") {
        const previous = this.boardDraft.points.at(-1);
        if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 3) this.boardDraft.points.push(point);
      } else {
        this.boardDraft.to = point;
      }
      this.renderWhiteboard();
    });
    canvas.addEventListener("pointerup", async (event) => {
      if (this.boardDrag?.pointerId === event.pointerId) {
        const moved = this.boardObjects.get(this.boardDrag.original.id);
        this.boardDrag = null;
        if (moved) await this.postBoardEvent({ type: "update", object: moved });
        return;
      }
      if (pointerId !== event.pointerId) return;
      pointerId = null;
      await finish();
    });
    canvas.addEventListener("pointercancel", async () => {
      if (this.boardDrag) {
        this.boardObjects.set(this.boardDrag.original.id, this.boardDrag.original);
        this.boardDrag = null;
        this.renderWhiteboard();
      }
      pointerId = null;
      await finish();
    });
    canvas.addEventListener("dblclick", async (event) => {
      if (!this.canChatWrite()) return this.toast("Whiteboard editing is unavailable while your Community chat mute is active.");
      const object = this.hitBoardObject(this.boardPoint(event));
      if (!object || object.locked || !["text", "sticky", "comment", "card"].includes(object.type)) return;
      const text = prompt("Edit this whiteboard item:", object.text || "");
      if (text === null) return;
      await this.postBoardEvent({ type: "update", object: { ...object, text: String(text).slice(0, 1000) } });
    });
    const viewport = document.querySelector("#meeting-board-viewport");
    viewport?.addEventListener("scroll", () => {
      this.renderBoardMinimap();
      if (this.meeting?.settings?.presenterMode && this.canModerate()) {
        clearTimeout(this.boardViewportTimer);
        this.boardViewportTimer = setTimeout(() => this.sendSignal("state", { boardViewport: { left: viewport.scrollLeft, top: viewport.scrollTop, zoom: this.boardZoom, page: this.boardPage } }).catch(() => {}), 120);
      }
    });
  }

  boardCanEdit(tool = "") {
    if (!this.canChatWrite()) return false;
    if (this.canModerate()) return true;
    const permission = this.meeting?.settings?.whiteboardPermission || "edit";
    if (permission === "edit") return true;
    if (permission === "comment") return ["comment", "stamp", "select"].includes(tool);
    return tool === "select";
  }

  boardPoint(event) {
    const canvas = document.querySelector("#meeting-whiteboard");
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(Math.round((event.clientX - rect.left) / rect.width * canvas.width), 0, canvas.width),
      y: clamp(Math.round((event.clientY - rect.top) / rect.height * canvas.height), 0, canvas.height)
    };
  }

  selectBoardTool(tool, button) {
    this.boardTool = tool || "select";
    document.querySelectorAll("[data-board-tool]").forEach((item) => item.classList.toggle("active", item === button));
    const canvas = document.querySelector("#meeting-whiteboard");
    if (canvas) canvas.dataset.tool = this.boardTool;
  }

  boardObjectBounds(object = {}) {
    if (object.type === "stroke") {
      const xs = (object.points || []).map((point) => point.x);
      const ys = (object.points || []).map((point) => point.y);
      if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 };
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(1, Math.max(...xs) - Math.min(...xs)), height: Math.max(1, Math.max(...ys) - Math.min(...ys)) };
    }
    if (object.from && object.to) {
      return { x: Math.min(object.from.x, object.to.x), y: Math.min(object.from.y, object.to.y), width: Math.max(1, Math.abs(object.to.x - object.from.x)), height: Math.max(1, Math.abs(object.to.y - object.from.y)) };
    }
    return { x: Number(object.x || 0), y: Number(object.y || 0), width: Number(object.w || 240), height: Number(object.h || 120) };
  }

  hitBoardObject(point, padding = 12) {
    const objects = [...this.boardObjects.values()].filter((object) => Number(object.page || 1) === this.boardPage).sort((a, b) => Number(b.layer || 1) - Number(a.layer || 1));
    return objects.find((object) => {
      const bounds = this.boardObjectBounds(object);
      return point.x >= bounds.x - padding && point.x <= bounds.x + bounds.width + padding && point.y >= bounds.y - padding && point.y <= bounds.y + bounds.height + padding;
    }) || null;
  }

  boardCenterPoint() {
    const viewport = document.querySelector("#meeting-board-viewport");
    if (!viewport) return { x: 700, y: 450 };
    return {
      x: clamp((viewport.scrollLeft + viewport.clientWidth / 2) / this.boardZoom, 80, 2320),
      y: clamp((viewport.scrollTop + viewport.clientHeight / 2) / this.boardZoom, 80, 1320)
    };
  }

  async insertBoardObject(type, at = this.boardCenterPoint()) {
    if (!this.boardCanEdit(type)) return this.toast("The host limited whiteboard editing.");
    let object = { id: meetingId(), type, page: this.boardPage, layer: this.boardLayer, color: this.boardColor, width: this.boardWidth, x: at.x, y: at.y, createdBy: this.getUser()?.id, locked: false };
    if (type === "text") {
      const text = prompt("Text:", "");
      if (text === null || !text.trim()) return;
      object = { ...object, text: text.slice(0, 1000), size: 36, w: 420, h: 80 };
    } else if (type === "sticky") {
      const text = prompt("Sticky note:", "");
      if (text === null || !text.trim()) return;
      object = { ...object, text: text.slice(0, 1000), color: "#ffe58f", w: 300, h: 220 };
    } else if (type === "comment") {
      const text = prompt("Comment:", "");
      if (text === null || !text.trim()) return;
      object = { ...object, text: text.slice(0, 1000), author: this.getUser()?.name || "Participant", w: 320, h: 105 };
    } else if (type === "stamp") {
      const text = prompt("Emoji or stamp:", "👍");
      if (!text) return;
      object = { ...object, text: text.slice(0, 12), size: 64, w: 80, h: 80 };
    } else if (type === "card") {
      const text = prompt("Card title or idea:", "");
      if (!text) return;
      object = { ...object, text: text.slice(0, 1000), w: 360, h: 180 };
    } else if (type === "table") {
      object = { ...object, rows: 4, columns: 4, w: 520, h: 280 };
    } else if (type === "chart") {
      object = { ...object, values: [42, 72, 54, 86], labels: ["A", "B", "C", "D"], w: 480, h: 300 };
    }
    await this.postBoardEvent({ type: "object", object });
    this.boardSelectedId = object.id;
  }

  async insertBoardFile(file) {
    if (!this.boardCanEdit("image")) return this.toast("The host limited whiteboard editing.");
    const attachment = await readFileDataUrl(file);
    const at = this.boardCenterPoint();
    const object = {
      id: meetingId(),
      type: String(file.type || "").startsWith("image/") ? "image" : "pdf",
      page: this.boardPage,
      layer: this.boardLayer,
      x: at.x - 260,
      y: at.y - 180,
      w: 520,
      h: 360,
      name: attachment.name,
      mime: attachment.mime,
      dataUrl: attachment.dataUrl,
      createdBy: this.getUser()?.id,
      locked: false
    };
    await this.postBoardEvent({ type: "object", object });
    this.boardSelectedId = object.id;
  }

  boardSnapshot() {
    return {
      objects: [...this.boardObjects.values()].map((object) => structuredClone(object)),
      pages: [...this.boardPages],
      layers: [...this.boardLayers],
      page: this.boardPage,
      layer: this.boardLayer
    };
  }

  async postBoardEvent(event, { recordHistory = true } = {}) {
    if (!this.canChatWrite()) {
      this.toast("Whiteboard editing is unavailable while your Community chat mute is active.");
      return null;
    }
    if (recordHistory && !["cursor", "snapshot"].includes(event.type)) {
      this.boardHistory.push(this.boardSnapshot());
      this.boardHistory = this.boardHistory.slice(-50);
      this.boardFuture = [];
    }
    this.applyWhiteboardEvent(event);
    const status = document.querySelector("#meeting-board-sync");
    if (status) status.textContent = "Saving…";
    try {
      const result = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/whiteboard`, { method: "POST", body: JSON.stringify({ event }) });
      this.whiteboardCursor = Math.max(this.whiteboardCursor, Number(result.id || 0));
      if (status) status.textContent = "Saved to this meeting";
    } catch (error) {
      if (status) status.textContent = "Not saved";
      throw error;
    }
  }

  applyWhiteboardEvent(event = {}, record = {}) {
    if (event.type === "object" || event.type === "update") {
      if (event.object?.id) this.boardObjects.set(event.object.id, event.object);
    } else if (event.type === "delete") {
      this.boardObjects.delete(event.objectId);
      if (this.boardSelectedId === event.objectId) this.boardSelectedId = "";
    } else if (event.type === "clear") {
      if (event.all) this.boardObjects.clear();
      else for (const [id, object] of this.boardObjects) if (Number(object.page || 1) === Number(event.page || 1)) this.boardObjects.delete(id);
    } else if (event.type === "restore") {
      this.boardObjects.clear();
      (event.snapshot?.objects || []).forEach((object) => this.boardObjects.set(object.id, object));
      this.boardPages = event.snapshot?.pages?.length ? event.snapshot.pages : [1];
      this.boardLayers = event.snapshot?.layers?.length ? event.snapshot.layers : [1];
      this.boardPage = Number(event.snapshot?.page || this.boardPages[0] || 1);
      this.boardLayer = Number(event.snapshot?.layer || this.boardLayers[0] || 1);
    } else if (event.type === "snapshot") {
      const version = { ...event, versionId: event.versionId || String(record.id || meetingId()) };
      if (!this.boardVersions.some((item) => item.versionId === version.versionId)) this.boardVersions.push(version);
    } else if (event.type === "cursor" && record.userId !== this.getUser()?.id) {
      this.remoteBoardCursors.set(String(record.userId || event.userId || ""), { ...event, updatedAt: Date.now() });
    }
    for (const object of this.boardObjects.values()) {
      if (!this.boardPages.includes(Number(object.page || 1))) this.boardPages.push(Number(object.page || 1));
      if (!this.boardLayers.includes(Number(object.layer || 1))) this.boardLayers.push(Number(object.layer || 1));
    }
    this.boardPages.sort((a, b) => a - b);
    this.boardLayers.sort((a, b) => a - b);
    this.syncBoardControls();
    this.renderWhiteboard();
  }

  drawBoardObject(context, object) {
    context.save();
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = object.color || "#275547";
    context.fillStyle = object.color || "#275547";
    context.lineWidth = Number(object.width || 4);
    if (object.type === "stroke") {
      const points = object.points || [];
      if (points.length) {
        context.globalAlpha = object.tool === "highlighter" ? 0.3 : 1;
        context.lineWidth = Number(object.width || 4);
        context.beginPath();
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
        context.stroke();
      }
    } else if (["line", "arrow"].includes(object.type)) {
      const from = object.from || { x: 0, y: 0 };
      const to = object.to || from;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      if (object.type === "arrow") {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - 24 * Math.cos(angle - Math.PI / 6), to.y - 24 * Math.sin(angle - Math.PI / 6));
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - 24 * Math.cos(angle + Math.PI / 6), to.y - 24 * Math.sin(angle + Math.PI / 6));
        context.stroke();
      }
    } else if (["rectangle", "ellipse"].includes(object.type)) {
      const bounds = this.boardObjectBounds(object);
      context.beginPath();
      if (object.type === "ellipse") context.ellipse(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, bounds.width / 2, bounds.height / 2, 0, 0, Math.PI * 2);
      else context.rect(bounds.x, bounds.y, bounds.width, bounds.height);
      context.stroke();
    } else if (object.type === "text") {
      context.font = `700 ${Number(object.size || 36)}px ui-sans-serif, system-ui`;
      context.fillText(object.text || "", object.x, object.y + Number(object.size || 36));
    } else if (object.type === "sticky") {
      context.fillStyle = object.color || "#ffe58f";
      context.shadowColor = "rgba(20,30,25,.18)";
      context.shadowBlur = 16;
      context.fillRect(object.x, object.y, object.w, object.h);
      context.shadowBlur = 0;
      this.drawBoardText(context, object.text || "", object.x + 22, object.y + 36, object.w - 44, 28, "#25372f");
    } else if (object.type === "comment") {
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#49a66b";
      context.lineWidth = 3;
      context.fillRect(object.x, object.y, object.w, object.h);
      context.strokeRect(object.x, object.y, object.w, object.h);
      context.font = "700 18px ui-sans-serif";
      context.fillStyle = "#2d6f4a";
      context.fillText(object.author || "Comment", object.x + 16, object.y + 26);
      this.drawBoardText(context, object.text || "", object.x + 16, object.y + 54, object.w - 32, 20, "#25372f");
    } else if (object.type === "stamp") {
      context.font = `${Number(object.size || 64)}px sans-serif`;
      context.fillText(object.text || "👍", object.x, object.y + Number(object.size || 64));
    } else if (object.type === "card") {
      context.fillStyle = "#eef7f1";
      context.strokeStyle = "#275547";
      context.lineWidth = 3;
      context.fillRect(object.x, object.y, object.w, object.h);
      context.strokeRect(object.x, object.y, object.w, object.h);
      this.drawBoardText(context, object.text || "", object.x + 22, object.y + 40, object.w - 44, 28, "#18392f");
    } else if (object.type === "table") {
      context.strokeStyle = "#38584d";
      context.lineWidth = 2;
      for (let row = 0; row <= object.rows; row += 1) {
        const y = object.y + row * object.h / object.rows;
        context.beginPath(); context.moveTo(object.x, y); context.lineTo(object.x + object.w, y); context.stroke();
      }
      for (let column = 0; column <= object.columns; column += 1) {
        const x = object.x + column * object.w / object.columns;
        context.beginPath(); context.moveTo(x, object.y); context.lineTo(x, object.y + object.h); context.stroke();
      }
    } else if (object.type === "chart") {
      const max = Math.max(...object.values, 1);
      const gap = object.w / object.values.length;
      object.values.forEach((value, index) => {
        const height = value / max * (object.h - 55);
        context.fillStyle = ["#2f765c", "#e1b84a", "#6c8bc6", "#ce7667"][index % 4];
        context.fillRect(object.x + index * gap + 14, object.y + object.h - height - 30, gap - 28, height);
        context.fillStyle = "#25372f";
        context.font = "18px ui-sans-serif";
        context.fillText(object.labels?.[index] || String(index + 1), object.x + index * gap + gap / 2 - 8, object.y + object.h - 6);
      });
    } else if (object.type === "image") {
      const cached = this.boardImages.get(object.id);
      if (cached?.complete) context.drawImage(cached, object.x, object.y, object.w, object.h);
      else {
        context.fillStyle = "#e8efeb";
        context.fillRect(object.x, object.y, object.w, object.h);
        context.fillStyle = "#38584d";
        context.font = "24px ui-sans-serif";
        context.fillText("Loading image…", object.x + 24, object.y + 44);
        if (!cached && object.dataUrl) {
          const image = new Image();
          image.onload = () => this.renderWhiteboard();
          image.src = object.dataUrl;
          this.boardImages.set(object.id, image);
        }
      }
    } else if (object.type === "pdf") {
      context.fillStyle = "#fff";
      context.strokeStyle = "#d0574d";
      context.lineWidth = 4;
      context.fillRect(object.x, object.y, object.w, object.h);
      context.strokeRect(object.x, object.y, object.w, object.h);
      context.fillStyle = "#d0574d";
      context.font = "800 54px ui-sans-serif";
      context.fillText("PDF", object.x + 26, object.y + 76);
      this.drawBoardText(context, object.name || "PDF attachment", object.x + 26, object.y + 122, object.w - 52, 24, "#25372f");
      context.font = "18px ui-sans-serif";
      context.fillStyle = "#65766f";
      context.fillText("Annotations are saved above this file.", object.x + 26, object.y + object.h - 28);
    }
    if (object.locked) {
      const bounds = this.boardObjectBounds(object);
      context.fillStyle = "#17382e";
      context.font = "22px sans-serif";
      context.fillText("🔒", bounds.x + bounds.width - 24, bounds.y + 24);
    }
    context.restore();
  }

  drawBoardText(context, text, x, y, maxWidth, lineHeight, color) {
    context.save();
    context.fillStyle = color;
    context.font = `${Math.max(16, lineHeight - 4)}px ui-sans-serif, system-ui`;
    const words = String(text).split(/\s+/);
    let line = "";
    let offset = 0;
    for (const word of words) {
      const test = `${line}${word} `;
      if (context.measureText(test).width > maxWidth && line) {
        context.fillText(line.trim(), x, y + offset);
        line = `${word} `;
        offset += lineHeight;
      } else line = test;
    }
    if (line) context.fillText(line.trim(), x, y + offset);
    context.restore();
  }

  renderWhiteboard() {
    const canvas = document.querySelector("#meeting-whiteboard");
    const context = canvas?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#edf2ef";
    context.lineWidth = 1;
    for (let x = 0; x <= canvas.width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke(); }
    for (let y = 0; y <= canvas.height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke(); }
    const objects = [...this.boardObjects.values()].filter((object) => Number(object.page || 1) === this.boardPage).sort((a, b) => Number(a.layer || 1) - Number(b.layer || 1));
    objects.forEach((object) => this.drawBoardObject(context, object));
    if (this.boardDraft) this.drawBoardObject(context, this.boardDraft);
    const selected = this.boardObjects.get(this.boardSelectedId);
    if (selected && Number(selected.page || 1) === this.boardPage) {
      const bounds = this.boardObjectBounds(selected);
      context.save();
      context.setLineDash([12, 8]);
      context.strokeStyle = "#2c75d6";
      context.lineWidth = 3;
      context.strokeRect(bounds.x - 8, bounds.y - 8, bounds.width + 16, bounds.height + 16);
      context.restore();
    }
    const now = Date.now();
    for (const [userId, cursor] of this.remoteBoardCursors) {
      if (now - cursor.updatedAt > 6000 || Number(cursor.page || 1) !== this.boardPage) continue;
      context.save();
      context.fillStyle = cursor.color || "#d05f50";
      context.beginPath();
      context.moveTo(cursor.x, cursor.y);
      context.lineTo(cursor.x + 12, cursor.y + 28);
      context.lineTo(cursor.x + 19, cursor.y + 17);
      context.closePath();
      context.fill();
      context.font = "16px ui-sans-serif";
      context.fillText(cursor.name || userId.slice(0, 6), cursor.x + 22, cursor.y + 18);
      context.restore();
    }
    this.renderBoardMinimap();
  }

  renderBoardMinimap() {
    const source = document.querySelector("#meeting-whiteboard");
    const minimap = document.querySelector("#meeting-board-minimap");
    const context = minimap?.getContext("2d");
    if (!source || !context) return;
    context.clearRect(0, 0, minimap.width, minimap.height);
    context.drawImage(source, 0, 0, minimap.width, minimap.height);
    const viewport = document.querySelector("#meeting-board-viewport");
    if (!viewport) return;
    const scaleX = minimap.width / (source.width * this.boardZoom);
    const scaleY = minimap.height / (source.height * this.boardZoom);
    context.strokeStyle = "#2c75d6";
    context.lineWidth = 2;
    context.strokeRect(viewport.scrollLeft * scaleX, viewport.scrollTop * scaleY, Math.min(minimap.width, viewport.clientWidth * scaleX), Math.min(minimap.height, viewport.clientHeight * scaleY));
  }

  syncBoardControls() {
    const page = document.querySelector("#meeting-board-page");
    const layer = document.querySelector("#meeting-board-layer");
    const versions = document.querySelector("#meeting-board-versions");
    if (page) page.innerHTML = this.boardPages.map((value) => `<option value="${value}"${value === this.boardPage ? " selected" : ""}>${value}</option>`).join("");
    if (layer) layer.innerHTML = this.boardLayers.map((value) => `<option value="${value}"${value === this.boardLayer ? " selected" : ""}>${value}</option>`).join("");
    if (versions) versions.innerHTML = `<option value="">Versions</option>${this.boardVersions.slice().reverse().map((version) => `<option value="${escapeHtml(version.versionId)}">${escapeHtml(version.label || new Date(version.createdAt || Date.now()).toLocaleString())}</option>`).join("")}`;
  }

  applyBoardZoom() {
    const canvas = document.querySelector("#meeting-whiteboard");
    if (canvas) {
      canvas.style.width = `${canvas.width * this.boardZoom}px`;
      canvas.style.height = `${canvas.height * this.boardZoom}px`;
    }
    const output = document.querySelector("#meeting-board-zoom-value");
    if (output) output.textContent = `${Math.round(this.boardZoom * 100)}%`;
    this.renderBoardMinimap();
  }

  addBoardPage() {
    this.boardPage = Math.max(...this.boardPages) + 1;
    this.boardPages.push(this.boardPage);
    this.boardSelectedId = "";
    this.syncBoardControls();
    this.renderWhiteboard();
  }

  addBoardLayer() {
    this.boardLayer = Math.max(...this.boardLayers) + 1;
    this.boardLayers.push(this.boardLayer);
    this.syncBoardControls();
  }

  async copyBoardSelection() {
    const selected = this.boardObjects.get(this.boardSelectedId);
    if (!selected) return this.toast("Select an item first.");
    const copy = structuredClone(selected);
    copy.id = meetingId();
    copy.locked = false;
    if (copy.from) { copy.from.x += 32; copy.from.y += 32; copy.to.x += 32; copy.to.y += 32; }
    else if (copy.points) copy.points = copy.points.map((point) => ({ x: point.x + 32, y: point.y + 32 }));
    else { copy.x += 32; copy.y += 32; }
    await this.postBoardEvent({ type: "object", object: copy });
    this.boardSelectedId = copy.id;
  }

  async lockBoardSelection() {
    const selected = this.boardObjects.get(this.boardSelectedId);
    if (!selected) return this.toast("Select an item first.");
    await this.postBoardEvent({ type: "update", object: { ...selected, locked: !selected.locked } });
  }

  async deleteBoardSelection() {
    const selected = this.boardObjects.get(this.boardSelectedId);
    if (!selected) return this.toast("Select an item first.");
    if (selected.locked) return this.toast("Unlock this item before deleting it.");
    await this.postBoardEvent({ type: "delete", objectId: selected.id });
  }

  async clearWhiteboard(shared = false) {
    if (!shared) {
      this.boardObjects.clear();
      this.renderWhiteboard();
      return;
    }
    if (!confirm(`Clear whiteboard page ${this.boardPage} for everyone?`)) return;
    await this.postBoardEvent({ type: "clear", page: this.boardPage });
  }

  async saveBoardVersion() {
    const label = prompt("Version name:", `Whiteboard ${new Date().toLocaleString()}`);
    if (!label) return;
    const event = { type: "snapshot", versionId: meetingId(), label: label.slice(0, 100), createdAt: new Date().toISOString(), snapshot: this.boardSnapshot() };
    await this.postBoardEvent(event, { recordHistory: false });
    this.toast("Whiteboard version saved.");
  }

  async restoreBoardVersion(versionId) {
    const version = this.boardVersions.find((item) => item.versionId === versionId);
    if (!version?.snapshot || !confirm(`Restore "${version.label}" for everyone?`)) return;
    await this.postBoardEvent({ type: "restore", snapshot: version.snapshot });
  }

  async undoBoard() {
    const previous = this.boardHistory.pop();
    if (!previous) return this.toast("Nothing to undo.");
    this.boardFuture.push(this.boardSnapshot());
    await this.postBoardEvent({ type: "restore", snapshot: previous }, { recordHistory: false });
  }

  async redoBoard() {
    const next = this.boardFuture.pop();
    if (!next) return this.toast("Nothing to redo.");
    this.boardHistory.push(this.boardSnapshot());
    await this.postBoardEvent({ type: "restore", snapshot: next }, { recordHistory: false });
  }

  broadcastBoardCursor(point) {
    const now = Date.now();
    if (now - this.boardCursorSentAt < 250) return;
    this.boardCursorSentAt = now;
    this.sendSignal("state", { boardCursor: { type: "cursor", x: point.x, y: point.y, page: this.boardPage, name: this.getUser()?.name || "Participant", color: "#d05f50" } }).catch(() => {});
  }

  async pollWhiteboard() {
    clearInterval(this.whiteboardTimer);
    const poll = async () => {
      if (!this.meeting || this.closed) return;
      try {
        const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/whiteboard?after=${this.whiteboardCursor}`);
        for (const record of data.events || []) {
          this.whiteboardCursor = Math.max(this.whiteboardCursor, Number(record.id || 0));
          this.applyWhiteboardEvent(record.event, record);
        }
      } catch {}
    };
    await poll();
    this.whiteboardTimer = setInterval(poll, 1500);
  }

  async close({ quiet = false } = {}) {
    if (this.closed && !document.querySelector("#village-meeting")) return;
    this.closed = true;
    this.signalPollBusy = false;
    clearInterval(this.signalTimer);
    clearInterval(this.refreshTimer);
    clearInterval(this.whiteboardTimer);
    clearInterval(this.pollCountdownTimer);
    clearTimeout(this.captionTimer);
    clearTimeout(this.boardViewportTimer);
    this.stopCaptions({ resumeVoice: true });
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.peerRecoveryTimers.forEach((timer) => clearTimeout(timer));
    this.peerRecoveryTimers.clear();
    this.peerStates.forEach((state) => clearTimeout(state.disconnectTimer));
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    this.peerStates.clear();
    this.streams.clear();
    this.participantMeta.clear();
    this.remoteBoardCursors.clear();
    this.boardImages.clear();
    this.boardDrag = null;
    this.activeSpeakerId = "";
    this.audioUnlockPending = false;
    if (this.meeting && !quiet) {
      try { await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/join`, { method: "DELETE" }); } catch {}
    }
    document.querySelector("#village-meeting")?.remove();
    this.meeting = null;
    this.room = null;
    this.localStream = null;
    this.screenStream = null;
    this.signalCursor = 0;
    this.captionDisplayToken += 1;
    this.onClose();
  }
}
