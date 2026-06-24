import test from "node:test";
import assert from "node:assert/strict";
import {
  LOCAL_MUSIC_LIMIT_BYTES,
  validateAudioFileMeta,
  selectMusicSource
} from "../public/local-music-store.mjs";

test("audio validation accepts supported extensions and browser MIME variants", () => {
  const cases = [
    ["morning.MP3", "audio/mpeg", "mp3", "audio/mpeg"],
    ["garden.ogg", "audio/ogg; codecs=vorbis", "ogg", "audio/ogg"],
    ["water.wav", "audio/x-wav", "wav", "audio/x-wav"],
    ["evening.m4a", "audio/x-m4a", "m4a", "audio/x-m4a"],
    ["birds.aac", "audio/aac", "aac", "audio/aac"],
    ["field.webm", "audio/webm", "webm", "audio/webm"]
  ];
  for (const [name, type, extension, mimeType] of cases) {
    const result = validateAudioFileMeta({ name, type, size: 1024, lastModified: 42 });
    assert.equal(result.ok, true, name);
    assert.equal(result.extension, extension, name);
    assert.equal(result.mimeType, mimeType, name);
    assert.equal(result.lastModified, 42, name);
  }
});

test("audio validation falls back to extension for empty or generic MIME metadata", () => {
  const emptyMime = validateAudioFileMeta({ name: "quiet-night.mp3", type: "", size: 9 });
  assert.deepEqual(
    { ok: emptyMime.ok, extension: emptyMime.extension, mimeType: emptyMime.mimeType },
    { ok: true, extension: "mp3", mimeType: "audio/mpeg" }
  );

  const genericMime = validateAudioFileMeta({ name: "quiet-night.ogg", type: "application/octet-stream", size: 9 });
  assert.deepEqual(
    { ok: genericMime.ok, extension: genericMime.extension, mimeType: genericMime.mimeType },
    { ok: true, extension: "ogg", mimeType: "audio/ogg" }
  );
});

test("audio validation rejects bad metadata with stable error codes", () => {
  const cases = [
    [null, "NO_FILE"],
    [{ name: "", type: "audio/mpeg", size: 8 }, "MISSING_FILE_NAME"],
    [{ name: "empty.mp3", type: "audio/mpeg", size: 0 }, "EMPTY_FILE"],
    [{ name: "huge.mp3", type: "audio/mpeg", size: LOCAL_MUSIC_LIMIT_BYTES + 1 }, "FILE_TOO_LARGE"],
    [{ name: "notes.txt", type: "audio/mpeg", size: 8 }, "UNSUPPORTED_EXTENSION"],
    [{ name: "disguised.mp3", type: "text/plain", size: 8 }, "UNSUPPORTED_MIME"],
    [{ name: "lossless.flac", type: "audio/flac", size: 8 }, "UNSUPPORTED_EXTENSION"],
    [{ name: "mystery", type: "", size: 8 }, "UNSUPPORTED_EXTENSION"]
  ];
  for (const [meta, code] of cases) {
    const result = validateAudioFileMeta(meta);
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
  }
});

test("audio validation accepts a supported MIME when a browser omits the extension", () => {
  const result = validateAudioFileMeta({ name: "recording", type: "audio/mpeg", size: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.extension, "mp3");
  assert.equal(result.mimeType, "audio/mpeg");
});

test("music selection prioritizes the matching local day or night track", () => {
  const day = { slot: "day", data: new ArrayBuffer(1), name: "day.mp3" };
  const night = { slot: "night", data: new ArrayBuffer(1), name: "night.ogg" };
  const configuredMusic = { day: "/day.mp3", night: "/night.ogg" };

  const dayChoice = selectMusicSource({ isDay: true, localTracks: { day, night }, configuredMusic });
  assert.equal(dayChoice.source, "local");
  assert.equal(dayChoice.slot, "day");
  assert.equal(dayChoice.track, day);

  const nightChoice = selectMusicSource({ isDay: false, localTracks: new Map([["day", day], ["night", night]]), configuredMusic });
  assert.equal(nightChoice.source, "local");
  assert.equal(nightChoice.slot, "night");
  assert.equal(nightChoice.track, night);
});

test("music selection falls back to configured and then procedural music per slot", () => {
  assert.deepEqual(
    selectMusicSource({ isDay: false, localTracks: { day: { data: new ArrayBuffer(1) } }, configuredMusic: { night: " /night.ogg " } }),
    { source: "configured", slot: "night", url: "/night.ogg" }
  );
  assert.deepEqual(
    selectMusicSource({ isDay: true, configuredMusic: { day: "" } }),
    { source: "procedural", slot: "day" }
  );
});
