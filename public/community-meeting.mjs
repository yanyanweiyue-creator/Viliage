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
    phone: "M5 4h4l2 5-3 2c1.5 3 3 4.5 6 6l2-3 5 2v4c0 1-1 2-2 2C10 21 3 14 2 6c0-1 1-2 3-2Z",
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

export class VillageMeetingRuntime {
  constructor({ api, getUser, toast = () => {}, onClose = () => {} }) {
    this.api = api;
    this.getUser = getUser;
    this.toast = toast;
    this.onClose = onClose;
    this.meeting = null;
    this.room = null;
    this.localStream = null;
    this.screenStream = null;
    this.peers = new Map();
    this.signalTimer = null;
    this.refreshTimer = null;
    this.whiteboardTimer = null;
    this.signalCursor = "";
    this.whiteboardCursor = 0;
    this.recorder = null;
    this.recordingChunks = [];
    this.captionRecognition = null;
    this.raisedHand = false;
    this.virtualBackground = false;
    this.closed = true;
  }

  async open(meetingId, room) {
    await this.close({ quiet: true });
    this.closed = false;
    this.room = room;
    const data = await this.api(`/api/community/meetings/${encodeURIComponent(meetingId)}`);
    this.meeting = data.meeting;
    this.mount(data);
    const joined = await this.api(`/api/community/meetings/${encodeURIComponent(meetingId)}/join`, { method: "POST", body: "{}" });
    await this.startMedia();
    for (const participantId of joined.participantIds || []) {
      if (String(this.getUser()?.id || "") < String(participantId)) await this.offerTo(participantId);
    }
    this.signalTimer = setInterval(() => this.pollSignals(), 1200);
    this.refreshTimer = setInterval(() => this.refreshWorkspace(), 4000);
    await this.pollSignals();
  }

  mount(data) {
    document.querySelector("#village-meeting")?.remove();
    const overlay = document.createElement("section");
    overlay.id = "village-meeting";
    overlay.className = "village-meeting";
    overlay.setAttribute("aria-label", "Village video meeting");
    overlay.innerHTML = `
      <header class="meeting-header">
        <div><small>LIVE VILLAGE MEETING</small><h2>${escapeHtml(data.meeting.title)}</h2><span id="meeting-status">${escapeHtml(data.meeting.status)}</span></div>
        <div class="meeting-header-actions">
          ${data.meeting.hostId === this.getUser()?.id ? `<button type="button" data-meeting-action="end" class="meeting-end">End for everyone</button>` : ""}
          <button type="button" data-meeting-action="close" class="meeting-icon" title="Leave meeting">${icon("close")}<span class="sr-only">Leave meeting</span></button>
        </div>
      </header>
      <div class="meeting-layout">
        <main class="meeting-stage">
          <div id="meeting-video-grid" class="meeting-video-grid">
            <article class="meeting-video-tile local" data-user-id="${escapeHtml(this.getUser()?.id || "")}">
              <video id="meeting-local-video" autoplay muted playsinline></video>
              <div class="meeting-video-placeholder">${escapeHtml(String(this.getUser()?.name || "You").charAt(0))}</div>
              <footer><strong>You</strong><span id="meeting-local-state">Connecting…</span></footer>
            </article>
          </div>
          <div id="meeting-captions" class="meeting-captions" aria-live="polite"></div>
          <section id="meeting-whiteboard-panel" class="meeting-tool-panel hidden">
            <header><strong>Shared whiteboard</strong><button type="button" data-meeting-action="clear-local-board">Clear my view</button></header>
            <canvas id="meeting-whiteboard" width="1000" height="560"></canvas>
          </section>
          <section id="meeting-poll-panel" class="meeting-tool-panel hidden">
            <header><strong>Live polls</strong></header>
            <form id="meeting-poll-form" class="meeting-poll-form">
              <input name="question" maxlength="240" placeholder="Ask the room a question" required>
              <textarea name="options" rows="3" placeholder="One answer per line" required></textarea>
              <button type="submit">Create poll</button><p class="form-error"></p>
            </form>
            <div id="meeting-poll-list">${this.pollsHtml(data.polls || [])}</div>
          </section>
        </main>
        <aside class="meeting-sidebar">
          <section><header><strong>Members</strong><span id="meeting-participant-count">${(data.participants || []).length}</span></header><div id="meeting-participants">${this.participantsHtml(data.participants || [])}</div></section>
          <section class="meeting-chat"><header><strong>Meeting chat</strong><label class="meeting-file-button" title="Attach file">+<input id="meeting-chat-file" type="file" accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx"></label></header><div id="meeting-chat-list"></div><form id="meeting-chat-form"><input name="message" maxlength="1000" placeholder="Message everyone"><button>Send</button><p class="form-error"></p></form></section>
        </aside>
      </div>
      <nav class="meeting-controls" aria-label="Meeting controls">
        <button type="button" data-meeting-action="mic" class="active" title="Mute microphone">${icon("mic")}<span>Mic</span></button>
        <button type="button" data-meeting-action="camera" class="active" title="Turn camera off">${icon("video")}<span>Camera</span></button>
        <button type="button" data-meeting-action="screen" title="Share screen">${icon("screen")}<span>Share</span></button>
        <button type="button" data-meeting-action="record" title="Record locally">${icon("record")}<span>Record</span></button>
        <button type="button" data-meeting-action="background" title="Toggle village backdrop">${icon("background")}<span>Backdrop</span></button>
        <button type="button" data-meeting-action="hand" title="Raise hand">${icon("hand")}<span>Raise</span></button>
        <button type="button" data-meeting-action="captions" title="Toggle live captions">${icon("captions")}<span>Captions</span></button>
        <button type="button" data-meeting-action="board" title="Open whiteboard">${icon("board")}<span>Board</span></button>
        <button type="button" data-meeting-action="poll" title="Open polls">${icon("poll")}<span>Polls</span></button>
        <button type="button" data-meeting-action="close" class="hangup" title="Leave meeting">${icon("phone")}<span>Leave</span></button>
      </nav>`;
    document.body.append(overlay);
    overlay.addEventListener("click", (event) => this.handleClick(event));
    overlay.addEventListener("submit", (event) => this.handleSubmit(event));
    this.setupWhiteboard();
    this.refreshChat();
  }

  participantsHtml(participants = []) {
    const host = this.meeting?.hostId === this.getUser()?.id;
    return participants.map((participant) => `<article class="meeting-participant" data-participant-id="${escapeHtml(participant.userId)}"><span class="meeting-avatar">${participant.avatarDataUrl ? `<img src="${escapeHtml(participant.avatarDataUrl)}" alt="">` : escapeHtml(String(participant.displayName || "V").charAt(0))}</span><div><strong>${escapeHtml(participant.displayName)}${participant.mine ? " (You)" : ""}</strong><small>${escapeHtml(participant.breakoutRoom || participant.role)}${participant.raisedHand ? " · Hand raised" : ""}</small></div>${host && !participant.mine ? `<details><summary>Manage</summary><button type="button" data-meeting-action="cohost" data-user-id="${escapeHtml(participant.userId)}">Make cohost</button><button type="button" data-meeting-action="breakout" data-user-id="${escapeHtml(participant.userId)}">Assign room</button><button type="button" data-meeting-action="remove" data-user-id="${escapeHtml(participant.userId)}">Remove</button></details>` : ""}</article>`).join("") || `<p class="meeting-empty">Waiting for others to join.</p>`;
  }

  pollsHtml(polls = []) {
    return polls.map((poll) => `<article class="meeting-poll"><strong>${escapeHtml(poll.question)}</strong>${(poll.options || []).map((option, index) => `<button type="button" data-meeting-action="vote" data-poll-id="${escapeHtml(poll.id)}" data-option-index="${index}"><span>${escapeHtml(option)}</span><b>${Number(poll.votes?.[index] || 0)}</b></button>`).join("")}</article>`).join("") || `<p class="meeting-empty">No polls yet.</p>`;
  }

  async startMedia() {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
      const video = document.querySelector("#meeting-local-video");
      if (video) video.srcObject = this.localStream;
      video?.closest(".meeting-video-tile")?.classList.add("has-video");
      document.querySelector("#meeting-local-state").textContent = "Camera and mic ready";
      for (const peer of this.peers.values()) this.localStream.getTracks().forEach((track) => peer.addTrack(track, this.localStream));
    } catch {
      this.localStream = new MediaStream();
      document.querySelector("#meeting-local-state").textContent = "Joined without camera";
      this.toast("Camera or microphone was unavailable. You can still use chat, polls, and the whiteboard.");
    }
  }

  async peerFor(userId) {
    if (this.peers.has(userId)) return this.peers.get(userId);
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    this.localStream?.getTracks().forEach((track) => peer.addTrack(track, this.localStream));
    peer.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal("candidate", event.candidate.toJSON(), userId);
    };
    peer.ontrack = (event) => this.showRemoteStream(userId, event.streams[0]);
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) this.removePeer(userId);
    };
    this.peers.set(userId, peer);
    return peer;
  }

  async offerTo(userId) {
    const peer = await this.peerFor(userId);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await this.sendSignal("offer", offer, userId);
  }

  async sendSignal(kind, payload, recipientId = "") {
    if (!this.meeting || this.closed) return;
    await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/signals`, { method: "POST", body: JSON.stringify({ kind, payload, recipientId }) });
  }

  async pollSignals() {
    if (!this.meeting || this.closed) return;
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/signals?after=${encodeURIComponent(this.signalCursor)}`);
      for (const signal of data.signals || []) {
        this.signalCursor = signal.createdAt > this.signalCursor ? signal.createdAt : this.signalCursor;
        if (signal.kind === "leave") {
          this.removePeer(signal.senderId);
          continue;
        }
        if (signal.kind === "state") {
          if (signal.payload?.caption) this.showCaption(signal.payload.caption, signal.senderId);
          continue;
        }
        const peer = await this.peerFor(signal.senderId);
        if (signal.kind === "offer") {
          await peer.setRemoteDescription(signal.payload);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          await this.sendSignal("answer", answer, signal.senderId);
        } else if (signal.kind === "answer") {
          if (!peer.currentRemoteDescription) await peer.setRemoteDescription(signal.payload);
        } else if (signal.kind === "candidate") {
          try { await peer.addIceCandidate(signal.payload); } catch {}
        }
      }
    } catch {}
  }

  showRemoteStream(userId, stream) {
    const grid = document.querySelector("#meeting-video-grid");
    if (!grid) return;
    let tile = grid.querySelector(`[data-user-id="${CSS.escape(userId)}"]`);
    if (!tile) {
      tile = document.createElement("article");
      tile.className = "meeting-video-tile";
      tile.dataset.userId = userId;
      tile.innerHTML = `<video autoplay playsinline></video><div class="meeting-video-placeholder">V</div><footer><strong>Village member</strong><span>Connected</span></footer>`;
      grid.append(tile);
    }
    tile.querySelector("video").srcObject = stream;
    tile.classList.add("has-video");
  }

  removePeer(userId) {
    this.peers.get(userId)?.close();
    this.peers.delete(userId);
    document.querySelector(`#meeting-video-grid [data-user-id="${CSS.escape(userId)}"]`)?.remove();
  }

  async refreshWorkspace() {
    if (!this.meeting || this.closed) return;
    try {
      const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}`);
      this.meeting = data.meeting;
      const participants = document.querySelector("#meeting-participants");
      if (participants) participants.innerHTML = this.participantsHtml(data.participants || []);
      const count = document.querySelector("#meeting-participant-count");
      if (count) count.textContent = String((data.participants || []).length);
      const polls = document.querySelector("#meeting-poll-list");
      if (polls) polls.innerHTML = this.pollsHtml(data.polls || []);
      if (data.meeting.status === "ended") await this.close();
      await this.refreshChat();
    } catch {}
  }

  async refreshChat() {
    if (!this.room || this.closed) return;
    try {
      const data = await this.api(`/api/community/rooms/${encodeURIComponent(this.room.id)}/messages`);
      const list = document.querySelector("#meeting-chat-list");
      if (!list) return;
      list.innerHTML = (data.messages || []).slice(-30).map((message) => `<article class="${message.mine ? "mine" : ""}"><strong>${escapeHtml(message.author)}</strong><p>${escapeHtml(message.body)}</p>${message.attachment ? `<a href="${escapeHtml(message.attachment.dataUrl)}" download="${escapeHtml(message.attachment.name)}">${escapeHtml(message.attachment.name)}</a>` : ""}</article>`).join("") || `<p class="meeting-empty">No meeting messages yet.</p>`;
      list.scrollTop = list.scrollHeight;
    } catch {}
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (event.target.id === "meeting-chat-form") {
      const form = event.target;
      const file = document.querySelector("#meeting-chat-file")?.files?.[0];
      try {
        const attachment = await readFileDataUrl(file);
        const message = new FormData(form).get("message");
        await this.api(`/api/community/rooms/${encodeURIComponent(this.room.id)}/messages`, { method: "POST", body: JSON.stringify({ message, attachment }) });
        form.reset();
        if (document.querySelector("#meeting-chat-file")) document.querySelector("#meeting-chat-file").value = "";
        await this.refreshChat();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
    }
    if (event.target.id === "meeting-poll-form") {
      const form = event.target;
      const data = new FormData(form);
      try {
        await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/polls`, { method: "POST", body: JSON.stringify({ question: data.get("question"), options: String(data.get("options") || "").split(/\r?\n/) }) });
        form.reset();
        await this.refreshWorkspace();
      } catch (error) { form.querySelector(".form-error").textContent = error.message; }
    }
  }

  async handleClick(event) {
    const button = event.target.closest("[data-meeting-action]");
    if (!button) return;
    const action = button.dataset.meetingAction;
    try {
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
      if (action === "board") return this.toggleTool("meeting-whiteboard-panel", button);
      if (action === "poll") return this.toggleTool("meeting-poll-panel", button);
      if (action === "clear-local-board") return this.clearWhiteboard();
      if (action === "vote") {
        await this.api(`/api/community/polls/${encodeURIComponent(button.dataset.pollId)}/vote`, { method: "POST", body: JSON.stringify({ optionIndex: Number(button.dataset.optionIndex) }) });
        return this.refreshWorkspace();
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

  toggleTrack(kind, button) {
    const track = this.localStream?.getTracks().find((item) => item.kind === kind);
    if (!track) return this.toast(`${kind === "audio" ? "Microphone" : "Camera"} is unavailable.`);
    track.enabled = !track.enabled;
    button.classList.toggle("active", track.enabled);
    button.querySelector("span").textContent = kind === "audio" ? (track.enabled ? "Mic" : "Muted") : (track.enabled ? "Camera" : "Camera off");
  }

  async toggleScreen(button) {
    if (this.screenStream) {
      const cameraTrack = this.localStream?.getVideoTracks()[0];
      for (const peer of this.peers.values()) {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
      }
      this.screenStream.getTracks().forEach((track) => track.stop());
      this.screenStream = null;
      document.querySelector("#meeting-local-video").srcObject = this.localStream;
      button.classList.remove("active");
      return;
    }
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenTrack = this.screenStream.getVideoTracks()[0];
      for (const peer of this.peers.values()) {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }
      document.querySelector("#meeting-local-video").srcObject = this.screenStream;
      screenTrack.onended = () => this.toggleScreen(button);
      button.classList.add("active");
    } catch {}
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
    document.querySelector(".meeting-video-tile.local")?.classList.toggle("village-backdrop", this.virtualBackground);
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
    if (this.captionRecognition) {
      this.captionRecognition.stop();
      this.captionRecognition = null;
      button.classList.remove("active");
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return this.toast("Live captions are unavailable in this browser.");
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const caption = String(result?.[0]?.transcript || "").trim();
      if (!caption) return;
      this.showCaption(caption, this.getUser()?.id);
      if (result.isFinal) this.sendSignal("state", { caption });
    };
    recognition.onend = () => { if (this.captionRecognition === recognition && !this.closed) try { recognition.start(); } catch {} };
    recognition.start();
    this.captionRecognition = recognition;
    button.classList.add("active");
  }

  showCaption(text, userId) {
    const captions = document.querySelector("#meeting-captions");
    if (!captions) return;
    captions.textContent = `${userId === this.getUser()?.id ? "You" : "Participant"}: ${text}`;
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => { if (captions) captions.textContent = ""; }, 6000);
  }

  toggleTool(id, button) {
    const panel = document.querySelector(`#${id}`);
    if (!panel) return;
    const opening = panel.classList.contains("hidden");
    document.querySelectorAll(".meeting-tool-panel").forEach((item) => item.classList.add("hidden"));
    panel.classList.toggle("hidden", !opening);
    button.classList.toggle("active", opening);
    if (id === "meeting-whiteboard-panel" && opening) this.pollWhiteboard();
  }

  setupWhiteboard() {
    const canvas = document.querySelector("#meeting-whiteboard");
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.lineWidth = 4;
    context.strokeStyle = "#275547";
    let drawing = false;
    let previous = null;
    const point = (event) => {
      const rect = canvas.getBoundingClientRect();
      return { x: Math.round((event.clientX - rect.left) / rect.width * canvas.width), y: Math.round((event.clientY - rect.top) / rect.height * canvas.height) };
    };
    canvas.addEventListener("pointerdown", (event) => { drawing = true; previous = point(event); canvas.setPointerCapture(event.pointerId); });
    canvas.addEventListener("pointermove", async (event) => {
      if (!drawing) return;
      const next = point(event);
      this.drawWhiteboardLine({ from: previous, to: next, color: "#275547", width: 4 });
      const record = { type: "line", from: previous, to: next, color: "#275547", width: 4 };
      previous = next;
      try { await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/whiteboard`, { method: "POST", body: JSON.stringify({ event: record }) }); } catch {}
    });
    canvas.addEventListener("pointerup", () => { drawing = false; previous = null; });
  }

  drawWhiteboardLine(event) {
    const canvas = document.querySelector("#meeting-whiteboard");
    const context = canvas?.getContext("2d");
    if (!context || event.type !== "line") return;
    context.strokeStyle = event.color || "#275547";
    context.lineWidth = Number(event.width || 4);
    context.beginPath();
    context.moveTo(event.from.x, event.from.y);
    context.lineTo(event.to.x, event.to.y);
    context.stroke();
  }

  clearWhiteboard() {
    const canvas = document.querySelector("#meeting-whiteboard");
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async pollWhiteboard() {
    clearInterval(this.whiteboardTimer);
    const poll = async () => {
      if (!this.meeting || this.closed) return;
      try {
        const data = await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/whiteboard?after=${this.whiteboardCursor}`);
        for (const record of data.events || []) {
          this.whiteboardCursor = Math.max(this.whiteboardCursor, Number(record.id || 0));
          if (record.userId !== this.getUser()?.id) this.drawWhiteboardLine(record.event);
        }
      } catch {}
    };
    await poll();
    this.whiteboardTimer = setInterval(poll, 1500);
  }

  async close({ quiet = false } = {}) {
    if (this.closed && !document.querySelector("#village-meeting")) return;
    this.closed = true;
    clearInterval(this.signalTimer);
    clearInterval(this.refreshTimer);
    clearInterval(this.whiteboardTimer);
    clearTimeout(this.captionTimer);
    this.captionRecognition?.stop();
    if (this.recorder?.state === "recording") this.recorder.stop();
    this.localStream?.getTracks().forEach((track) => track.stop());
    this.screenStream?.getTracks().forEach((track) => track.stop());
    this.peers.forEach((peer) => peer.close());
    this.peers.clear();
    if (this.meeting && !quiet) {
      try { await this.api(`/api/community/meetings/${encodeURIComponent(this.meeting.id)}/join`, { method: "DELETE" }); } catch {}
    }
    document.querySelector("#village-meeting")?.remove();
    this.meeting = null;
    this.room = null;
    this.localStream = null;
    this.screenStream = null;
    this.onClose();
  }
}
