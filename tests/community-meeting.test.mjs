import test from "node:test";
import assert from "node:assert/strict";
import { VillageMeetingRuntime } from "../public/community-meeting.mjs";

class FakeMediaStream {
  constructor(tracks = []) {
    this.tracks = [...tracks];
  }

  addTrack(track) {
    this.tracks.push(track);
  }

  getTracks() {
    return [...this.tracks];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class FakeSender {
  constructor(track = null) {
    this.track = typeof track === "string" ? null : track;
    this.replacements = [];
  }

  async replaceTrack(track) {
    this.track = track;
    this.replacements.push(track);
  }
}

class FakePeerConnection {
  static instances = [];

  constructor(configuration) {
    this.configuration = configuration;
    this.connectionState = "new";
    this.signalingState = "stable";
    this.remoteDescription = null;
    this.localDescription = null;
    this.transceivers = [];
    this.candidates = [];
    this.closed = false;
    FakePeerConnection.instances.push(this);
  }

  addTransceiver(track, options) {
    const transceiver = { sender: new FakeSender(track), options };
    this.transceivers.push(transceiver);
    return transceiver;
  }

  async createOffer(options = {}) {
    return { type: "offer", sdp: options.iceRestart ? "restart-offer" : "offer" };
  }

  async createAnswer() {
    return { type: "answer", sdp: "answer" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
    this.signalingState = description.type === "offer" ? "have-local-offer" : "stable";
  }

  async setRemoteDescription(description) {
    this.remoteDescription = description;
    this.signalingState = description.type === "offer" ? "have-remote-offer" : "stable";
  }

  async addIceCandidate(candidate) {
    this.candidates.push(candidate);
  }

  restartIce() {}

  close() {
    this.closed = true;
    this.signalingState = "closed";
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, force) {
    const enabled = force === undefined ? !this.values.has(value) : Boolean(force);
    if (enabled) this.values.add(value);
    else this.values.delete(value);
    return enabled;
  }

  contains(value) {
    return this.values.has(value);
  }
}

const originalDescriptors = new Map(
  ["MediaStream", "RTCPeerConnection", "document", "window", "navigator", "CSS"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key)
  ])
);

function setGlobal(key, value) {
  Object.defineProperty(globalThis, key, {
    value,
    writable: true,
    configurable: true
  });
}

function installMeetingGlobals() {
  FakePeerConnection.instances = [];
  setGlobal("MediaStream", FakeMediaStream);
  setGlobal("RTCPeerConnection", FakePeerConnection);
  setGlobal("CSS", { escape: (value) => String(value) });
  setGlobal("document", {
    querySelector: () => null,
    querySelectorAll: () => []
  });
  setGlobal("window", globalThis);
  setGlobal("navigator", { mediaDevices: {} });
}

test.beforeEach(() => {
  installMeetingGlobals();
});

test.after(() => {
  for (const [key, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

test("joining a meeting offers every existing participant regardless of ID ordering", async () => {
  const calls = [];
  const offered = [];
  const runtime = new VillageMeetingRuntime({
    api: async (path, options = {}) => {
      calls.push([path, options.method || "GET"]);
      if (path.endsWith("/join")) {
        return { participantIds: ["z-member", "a-member"], signalCursor: 41 };
      }
      return {
        meeting: { id: "meeting-1", hostId: "host", title: "Village call", status: "live", settings: {} },
        participants: [],
        polls: [],
        rtcConfiguration: { iceServers: [{ urls: ["turn:example.test:3478"] }], relayAvailable: true }
      };
    },
    getUser: () => ({ id: "middle-member", name: "Middle" })
  });
  runtime.close = async () => {};
  runtime.mount = () => {};
  runtime.startMedia = async () => {};
  runtime.pollSignals = async () => {};
  runtime.offerTo = async (userId) => offered.push(userId);

  await runtime.open("meeting-1", { id: "room-1" });
  clearInterval(runtime.signalTimer);
  clearInterval(runtime.refreshTimer);

  assert.deepEqual(offered.sort(), ["a-member", "z-member"]);
  assert.equal(runtime.signalCursor, 41);
  assert.deepEqual(runtime.iceServers, [{ urls: ["turn:example.test:3478"] }]);
  assert.equal(runtime.relayAvailable, true);
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/community/meetings/meeting-1",
    "/api/community/meetings/meeting-1/join"
  ]);
});

test("pending device permission does not block joining, signaling, or meeting invitations", async () => {
  const calls = [];
  let invitationsRefreshed = false;
  const runtime = new VillageMeetingRuntime({
    api: async (path, options = {}) => {
      calls.push([path, options.method || "GET"]);
      if (path.endsWith("/join")) return { participantIds: [], signalCursor: 7 };
      return {
        meeting: { id: "meeting-permission", hostId: "local", title: "Permission wait", status: "scheduled", settings: {} },
        participants: [],
        polls: [],
        rtcConfiguration: { iceServers: [] }
      };
    },
    getUser: () => ({ id: "local", name: "Local" })
  });
  runtime.close = async () => {};
  runtime.mount = () => {};
  runtime.startMedia = () => new Promise(() => {});
  runtime.pollSignals = async () => {};
  runtime.refreshMeetingInvitations = async () => { invitationsRefreshed = true; };

  await Promise.race([
    runtime.open("meeting-permission", { id: "room-1" }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("meeting join was blocked by device permission")), 100))
  ]);
  clearInterval(runtime.signalTimer);
  clearInterval(runtime.refreshTimer);

  assert.equal(runtime.signalCursor, 7);
  assert.equal(invitationsRefreshed, true);
  assert.deepEqual(calls.map(([path]) => path), [
    "/api/community/meetings/meeting-permission",
    "/api/community/meetings/meeting-permission/join"
  ]);
});

test("ICE candidates received before an offer are queued and flushed after remote SDP", async () => {
  const sentSignals = [];
  const runtime = new VillageMeetingRuntime({
    api: async (path, options = {}) => {
      if (options.method === "POST") {
        sentSignals.push(JSON.parse(options.body));
        return { ok: true };
      }
      return {
        cursor: 12,
        signals: [
          { cursor: 11, senderId: "remote", kind: "candidate", payload: { candidate: "candidate-1" } },
          { cursor: 12, senderId: "remote", kind: "offer", payload: { type: "offer", sdp: "remote-offer" } }
        ]
      };
    },
    getUser: () => ({ id: "local" })
  });
  runtime.meeting = { id: "meeting-2", status: "live" };
  runtime.localStream = new FakeMediaStream([
    { id: "mic", kind: "audio" },
    { id: "camera", kind: "video" }
  ]);
  runtime.closed = false;

  await runtime.pollSignals();

  const peer = FakePeerConnection.instances[0];
  assert.equal(peer.remoteDescription.sdp, "remote-offer");
  assert.deepEqual(peer.candidates, [{ candidate: "candidate-1" }]);
  assert.equal(runtime.peerStates.get("remote").pendingCandidates.length, 0);
  assert.equal(runtime.signalCursor, 12);
  assert.equal(sentSignals.at(-1).kind, "answer");
  assert.equal(sentSignals.at(-1).recipientId, "remote");
});

test("a malformed signal is isolated so later meeting updates are not blocked", async () => {
  const requestedCursors = [];
  const handled = [];
  const runtime = new VillageMeetingRuntime({
    api: async (path) => {
      const cursor = Number(new URL(path, "https://village.test").searchParams.get("cursor") || 0);
      requestedCursors.push(cursor);
      const signals = [
        { cursor: 31, senderId: "remote", kind: "state", payload: {} },
        { cursor: 32, senderId: "remote", kind: "offer", payload: {} },
        { cursor: 33, senderId: "remote", kind: "state", payload: {} }
      ].filter((signal) => signal.cursor > cursor);
      return { cursor: 33, signals };
    },
    getUser: () => ({ id: "local" })
  });
  runtime.meeting = { id: "meeting-retry" };
  runtime.closed = false;
  runtime.handleSignal = async (signal) => {
    handled.push(signal.cursor);
    if (signal.cursor === 32) throw new Error("invalid SDP");
  };

  await runtime.pollSignals();
  assert.equal(runtime.signalCursor, 33);
  assert.deepEqual(handled, [31, 32, 33]);

  await runtime.pollSignals();
  assert.equal(runtime.signalCursor, 33);
  assert.deepEqual(handled, [31, 32, 33]);
  assert.deepEqual(requestedCursors, [0, 33]);
});

test("concurrent signal polls share one in-flight request and do not process a signal twice", async () => {
  let releaseRequest;
  let apiCalls = 0;
  const handled = [];
  const requestGate = new Promise((resolve) => { releaseRequest = resolve; });
  const runtime = new VillageMeetingRuntime({
    api: async () => {
      apiCalls += 1;
      await requestGate;
      return { cursor: 44, signals: [{ cursor: 44, senderId: "remote", kind: "state", payload: {} }] };
    },
    getUser: () => ({ id: "local" })
  });
  runtime.meeting = { id: "meeting-in-flight" };
  runtime.closed = false;
  runtime.handleSignal = async (signal) => handled.push(signal.cursor);

  const firstPoll = runtime.pollSignals();
  await Promise.resolve();
  const overlappingPoll = runtime.pollSignals();
  assert.equal(apiCalls, 1);
  releaseRequest();
  await Promise.all([firstPoll, overlappingPoll]);

  assert.deepEqual(handled, [44]);
  assert.equal(runtime.signalCursor, 44);
  assert.equal(runtime.signalPollBusy, false);
});

test("a terminal Meeting access rejection closes local media and peer connections", async () => {
  let stopped = 0;
  const toasts = [];
  const runtime = new VillageMeetingRuntime({
    api: async () => {
      const error = new Error("The host removed you from this meeting.");
      error.status = 403;
      throw error;
    },
    getUser: () => ({ id: "local" }),
    toast: (message) => toasts.push(message)
  });
  const peer = new FakePeerConnection({});
  runtime.meeting = { id: "meeting-removed" };
  runtime.closed = false;
  runtime.localStream = new FakeMediaStream([{ kind: "audio", stop: () => { stopped += 1; } }]);
  runtime.peers.set("remote", peer);

  await runtime.pollSignals();

  assert.equal(runtime.closed, true);
  assert.equal(runtime.meeting, null);
  assert.equal(stopped, 1);
  assert.equal(peer.closed, true);
  assert.deepEqual(toasts, ["The host removed you from this meeting."]);
});

test("an accepted answer clears glare state so its ICE candidates are not discarded", async () => {
  const runtime = new VillageMeetingRuntime({
    api: async (_path, options = {}) => {
      if (options.method === "POST") return { ok: true };
      return {
        cursor: 22,
        signals: [
          { cursor: 21, senderId: "remote", kind: "answer", payload: { type: "answer", sdp: "accepted-answer" } },
          { cursor: 22, senderId: "remote", kind: "candidate", payload: { candidate: "answer-candidate" } }
        ]
      };
    },
    getUser: () => ({ id: "local" })
  });
  runtime.meeting = { id: "meeting-glare", status: "live" };
  runtime.localStream = new FakeMediaStream([
    { id: "mic", kind: "audio" },
    { id: "camera", kind: "video" }
  ]);
  runtime.closed = false;
  const peer = await runtime.peerFor("remote");
  await peer.setLocalDescription({ type: "offer", sdp: "local-offer" });
  runtime.peerStates.get("remote").ignoreOffer = true;

  await runtime.pollSignals();

  assert.equal(runtime.peerStates.get("remote").ignoreOffer, false);
  assert.equal(peer.remoteDescription.sdp, "accepted-answer");
  assert.deepEqual(peer.candidates, [{ candidate: "answer-candidate" }]);
});

test("screen video and system audio replace peer senders and restore camera and mic", async () => {
  const microphone = { id: "mic", kind: "audio" };
  const camera = { id: "camera", kind: "video" };
  const screenVideo = { id: "screen", kind: "video" };
  const screenAudio = { id: "system-audio", kind: "audio" };
  const runtime = new VillageMeetingRuntime({
    api: async () => ({ ok: true }),
    getUser: () => ({ id: "local" })
  });
  runtime.closed = false;
  runtime.localStream = new FakeMediaStream([microphone, camera]);
  runtime.screenStream = new FakeMediaStream([screenVideo, screenAudio]);

  await runtime.peerFor("late-joiner");
  const peerState = runtime.peerStates.get("late-joiner");
  assert.equal(peerState.audioSender.track, microphone);
  assert.equal(peerState.videoSender.track, screenVideo);
  assert.equal(peerState.screenAudioSender.track, screenAudio);

  runtime.screenStream = null;
  await runtime.syncPeerSenders("late-joiner");
  assert.equal(peerState.audioSender.track, microphone);
  assert.equal(peerState.videoSender.track, camera);
  assert.equal(peerState.screenAudioSender.track, null);
});

test("camera and microphone permissions degrade independently", async () => {
  const camera = { id: "camera", kind: "video" };
  const notices = [];
  setGlobal("navigator", {
    mediaDevices: {
      getUserMedia: async (constraints) => {
        if (constraints.audio) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
        return new FakeMediaStream([camera]);
      }
    }
  });
  const runtime = new VillageMeetingRuntime({
    api: async () => ({}),
    getUser: () => ({ id: "local" }),
    toast: (message) => notices.push(message)
  });
  runtime.attachStream = () => {};
  runtime.focusParticipant = () => {};
  runtime.meeting = { id: "meeting-permissions" };
  runtime.closed = false;

  await runtime.startMedia();

  assert.deepEqual(runtime.localStream.getVideoTracks(), [camera]);
  assert.deepEqual(runtime.localStream.getAudioTracks(), []);
  assert.match(notices[0], /Microphone was unavailable/);
});

test("remote audio retries on the next Meeting gesture when autoplay is blocked", async () => {
  let playCount = 0;
  let unlockHandler = null;
  const status = { textContent: "" };
  const audio = {
    autoplay: false,
    playsInline: false,
    dataset: {},
    srcObject: null,
    play: () => {
      playCount += 1;
      return playCount === 1 ? Promise.reject(new Error("autoplay blocked")) : Promise.resolve();
    }
  };
  const container = {
    querySelector: () => null,
    querySelectorAll: () => [audio],
    append: () => {}
  };
  const surface = {
    addEventListener: (type, handler, options) => {
      assert.equal(type, "pointerdown");
      assert.deepEqual(options, { once: true, capture: true });
      unlockHandler = handler;
    }
  };
  setGlobal("document", {
    createElement: () => audio,
    querySelector: (selector) => selector === "#meeting-remote-audio"
      ? container
      : selector === "#village-meeting"
        ? surface
        : selector === "#meeting-focus-state"
          ? status
          : null,
    querySelectorAll: () => []
  });
  const runtime = new VillageMeetingRuntime({
    api: async () => ({ ok: true }),
    getUser: () => ({ id: "local" })
  });
  runtime.closed = false;
  runtime.activeSpeakerId = "remote";

  runtime.attachRemoteAudio("remote", { id: "remote-stream" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(playCount, 1);
  assert.equal(status.textContent, "Tap the meeting once to enable sound");
  assert.equal(typeof unlockHandler, "function");

  unlockHandler();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(playCount, 2);
  assert.equal(status.textContent, "Connected");
  assert.equal(runtime.audioUnlockPending, false);
});

test("captions process every final result, keep interim text local, and restart after onend", async () => {
  class FakeRecognition {
    static instances = [];

    constructor() {
      FakeRecognition.instances.push(this);
    }

    start() {
      this.started = true;
    }

    stop() {
      this.stopped = true;
    }
  }
  setGlobal("window", { SpeechRecognition: FakeRecognition });
  const signals = [];
  let suspended = 0;
  let resumed = 0;
  const shown = [];
  const runtime = new VillageMeetingRuntime({
    api: async (_path, options = {}) => {
      if (options.method === "POST") signals.push(JSON.parse(options.body));
      return { ok: true };
    },
    getUser: () => ({ id: "speaker" }),
    suspendVoiceControl: () => {
      suspended += 1;
      return true;
    },
    resumeVoiceControl: () => {
      resumed += 1;
    }
  });
  runtime.meeting = { id: "meeting-3" };
  runtime.closed = false;
  runtime.showCaption = async (caption) => shown.push(caption);
  const label = { textContent: "Captions" };
  const button = { classList: new FakeClassList(), querySelector: () => label };

  runtime.toggleCaptions(button);
  const first = FakeRecognition.instances[0];
  first.onresult({
    resultIndex: 0,
    results: [
      Object.assign([{ transcript: "First sentence" }], { isFinal: true }),
      Object.assign([{ transcript: "still speaking" }], { isFinal: false }),
      Object.assign([{ transcript: "Second sentence" }], { isFinal: true })
    ]
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(suspended, 1);
  assert.equal(shown.filter((caption) => caption.final).length, 2);
  assert.equal(shown.filter((caption) => caption.final === false).length, 1);
  assert.deepEqual(signals.map((signal) => signal.payload.caption.text), ["First sentence", "Second sentence"]);

  first.onend();
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(FakeRecognition.instances.length, 2);
  assert.equal(FakeRecognition.instances[1].started, true);

  runtime.stopCaptions({ button });
  assert.equal(resumed, 1);
  assert.equal(runtime.captionsWanted, false);
  assert.equal(label.textContent, "Captions");
});

test("caption translation targets are independent for each participant view", async () => {
  const requests = [];
  const buildRuntime = (userId, targetLanguage) => {
    const rendered = [];
    const runtime = new VillageMeetingRuntime({
      api: async (_path, options) => {
        const input = JSON.parse(options.body);
        requests.push([userId, input.targetLanguage]);
        return { translation: `${input.targetLanguage}:${input.text}` };
      },
      getUser: () => ({ id: userId })
    });
    runtime.meeting = { id: "meeting-4" };
    runtime.captionTranslationLanguage = targetLanguage;
    runtime.participantMeta.set("speaker", { displayName: "Speaker" });
    runtime.renderCaption = (caption) => rendered.push(caption);
    return { runtime, rendered };
  };
  const chineseView = buildRuntime("viewer-cn", "zh-CN");
  const englishView = buildRuntime("viewer-en", "en");

  await Promise.all([
    chineseView.runtime.showCaption({ id: "caption-1", text: "Hola", sourceLanguage: "es-ES", final: true }, "speaker"),
    englishView.runtime.showCaption({ id: "caption-1", text: "Hola", sourceLanguage: "es-ES", final: true }, "speaker")
  ]);

  assert.deepEqual(requests.sort(), [["viewer-cn", "zh-CN"], ["viewer-en", "en"]].sort());
  assert.equal(chineseView.rendered.at(-1).text, "zh-CN:Hola");
  assert.equal(englishView.rendered.at(-1).text, "en:Hola");
  assert.equal(chineseView.rendered.at(-1).original, "Hola");
  assert.equal(englishView.rendered.at(-1).original, "Hola");
});

test("a Community chat mute keeps meeting content readable and removes rejected write controls", async () => {
  let apiCalls = 0;
  const notices = [];
  const runtime = new VillageMeetingRuntime({
    api: async () => {
      apiCalls += 1;
      return { ok: true };
    },
    getUser: () => ({ id: "local", name: "Local" }),
    canChatWrite: () => false,
    toast: (message) => notices.push(message)
  });
  runtime.meeting = {
    id: "meeting-muted",
    hostId: "local",
    settings: { allowMemberPolls: true, whiteboardPermission: "edit" }
  };

  const chat = runtime.chatMarkup([], true);
  assert.match(chat, /id="meeting-chat-list"/);
  assert.match(chat, /Meeting chat is read-only/);
  assert.doesNotMatch(chat, /id="meeting-chat-form"/);
  assert.match(chat, /class="meeting-chat-targets hidden"/);

  const polls = runtime.pollPanelMarkup([], true);
  assert.match(polls, /Creating polls is unavailable/);
  assert.doesNotMatch(polls, /id="meeting-poll-form"/);

  const invites = runtime.meetingInvitationFriendsHtml([{ userId: "friend", displayName: "Friend" }]);
  assert.match(invites, /Meeting invitations are unavailable/);
  assert.doesNotMatch(invites, /id="meeting-invite-form"/);

  const board = runtime.whiteboardMarkup(true);
  assert.match(board, /data-meeting-action="board-tool"/);
  assert.match(board, /disabled data-meeting-action="board-version"/);

  const message = runtime.chatMessageHtml({ id: "message-1", mine: true, author: "Local", body: "Readable", reactions: { "👍": { count: 2, mine: true } } });
  assert.match(message, /Readable/);
  assert.doesNotMatch(message, /data-meeting-action="chat-react"/);
  assert.doesNotMatch(message, /data-meeting-action="chat-reply"/);
  assert.match(message, /data-meeting-action="chat-delete"/);

  await runtime.postBoardEvent({ type: "clear", page: 1 });
  assert.equal(apiCalls, 0);
  assert.match(notices.at(-1), /Whiteboard editing is unavailable/);
});
