const DATABASE_NAME = "village-audio";
const DATABASE_VERSION = 1;
const STORE_NAME = "tracks";
const MAX_AUDIO_BYTES = 30 * 1024 * 1024;

const AUDIO_TYPES = Object.freeze({
  mp3: ["audio/mpeg", "audio/mp3"],
  ogg: ["audio/ogg"],
  wav: ["audio/wav", "audio/x-wav", "audio/wave"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  aac: ["audio/aac", "audio/x-aac"],
  webm: ["audio/webm"]
});

const GENERIC_MIME_TYPES = new Set(["", "application/octet-stream"]);
const MIME_TO_EXTENSION = new Map(
  Object.entries(AUDIO_TYPES).flatMap(([extension, types]) => types.map((type) => [type, extension]))
);

function failure(code, details = {}) {
  return { ok: false, code, ...details };
}

function storageError(code, cause) {
  const error = new Error(code);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function assertSlot(slot) {
  if (slot !== "day" && slot !== "night") throw storageError("INVALID_SLOT");
}

function fileExtension(name = "") {
  const match = String(name).trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

/**
 * Validate file metadata without decoding audio. Browsers occasionally provide
 * an empty or generic MIME type, so a supported extension is accepted in that
 * case. An explicit non-audio or unsupported audio MIME type is rejected.
 */
export function validateAudioFileMeta(file, { maxBytes = MAX_AUDIO_BYTES } = {}) {
  if (!file || typeof file !== "object") return failure("NO_FILE");

  const name = typeof file.name === "string" ? file.name.trim() : "";
  const size = Number(file.size);
  const mimeType = typeof file.type === "string" ? file.type.trim().toLowerCase().split(";")[0].trim() : "";
  const extension = fileExtension(name);

  if (!name) return failure("MISSING_FILE_NAME");
  if (!Number.isFinite(size) || size <= 0) return failure("EMPTY_FILE");
  if (size > maxBytes) return failure("FILE_TOO_LARGE", { maxBytes });
  if (extension && !AUDIO_TYPES[extension]) return failure("UNSUPPORTED_EXTENSION", { extension });

  const genericMime = GENERIC_MIME_TYPES.has(mimeType);
  const mimeExtension = MIME_TO_EXTENSION.get(mimeType);
  if (!genericMime && !mimeExtension) return failure("UNSUPPORTED_MIME", { mimeType });
  if (!extension && !mimeExtension) return failure("UNSUPPORTED_EXTENSION", { extension: "" });

  const normalizedExtension = extension || mimeExtension;
  const normalizedMimeType = genericMime ? AUDIO_TYPES[normalizedExtension][0] : mimeType;
  return {
    ok: true,
    code: "VALID_AUDIO",
    name,
    size,
    extension: normalizedExtension,
    mimeType: normalizedMimeType,
    lastModified: Number.isFinite(Number(file.lastModified)) ? Number(file.lastModified) : 0
  };
}

function openDatabase(indexedDBFactory = globalThis.indexedDB) {
  if (!indexedDBFactory?.open) return Promise.reject(storageError("INDEXEDDB_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    let request;
    try {
      request = indexedDBFactory.open(DATABASE_NAME, DATABASE_VERSION);
    } catch (error) {
      reject(storageError("INDEXEDDB_ERROR", error));
      return;
    }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "slot" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError("INDEXEDDB_ERROR", request.error));
    request.onblocked = () => reject(storageError("INDEXEDDB_BLOCKED"));
  });
}

function transact(database, mode, action) {
  return new Promise((resolve, reject) => {
    let transaction;
    let request;
    let result;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      request = action(transaction.objectStore(STORE_NAME));
    } catch (error) {
      reject(storageError("INDEXEDDB_ERROR", error));
      return;
    }
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(storageError("INDEXEDDB_ERROR", request.error));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(storageError("INDEXEDDB_ERROR", transaction.error));
    transaction.onabort = () => reject(storageError("INDEXEDDB_ERROR", transaction.error));
  });
}

/** Store an owned local file as structured-clone-safe bytes plus metadata. */
export async function saveLocalTrack(slot, file, { indexedDBFactory = globalThis.indexedDB, now = Date.now } = {}) {
  assertSlot(slot);
  const validation = validateAudioFileMeta(file);
  if (!validation.ok) throw storageError(validation.code);
  if (typeof file.arrayBuffer !== "function") throw storageError("AUDIO_READ_FAILED");

  let data;
  try {
    data = await file.arrayBuffer();
  } catch (error) {
    throw storageError("AUDIO_READ_FAILED", error);
  }
  if (!(data instanceof ArrayBuffer) || data.byteLength === 0) throw storageError("AUDIO_READ_FAILED");

  const record = {
    version: 1,
    slot,
    name: validation.name,
    type: validation.mimeType,
    extension: validation.extension,
    size: data.byteLength,
    lastModified: validation.lastModified,
    updatedAt: Number(now()),
    bytes: data
  };

  const database = await openDatabase(indexedDBFactory);
  try {
    await transact(database, "readwrite", (store) => store.put(record));
    return record;
  } finally {
    database.close();
  }
}

export async function loadLocalTrack(slot, { indexedDBFactory = globalThis.indexedDB } = {}) {
  assertSlot(slot);
  const database = await openDatabase(indexedDBFactory);
  try {
    return (await transact(database, "readonly", (store) => store.get(slot))) || null;
  } finally {
    database.close();
  }
}

export async function removeLocalTrack(slot, { indexedDBFactory = globalThis.indexedDB } = {}) {
  assertSlot(slot);
  const database = await openDatabase(indexedDBFactory);
  try {
    await transact(database, "readwrite", (store) => store.delete(slot));
  } finally {
    database.close();
  }
}

/**
 * Choose the current music without touching Web Audio. A user's local track
 * wins for its own time slot, followed by configured site music, then the
 * procedural score. Day music is never reused at night (or vice versa).
 */
export function selectMusicSource({ isDay, localTracks = {}, configuredMusic = {} } = {}) {
  const slot = isDay ? "day" : "night";
  const localTrack = typeof localTracks?.get === "function" ? localTracks.get(slot) : localTracks?.[slot];
  if (localTrack?.blob || localTrack?.bytes || localTrack?.data) return { source: "local", slot, track: localTrack };

  const configuredUrl = configuredMusic?.[slot];
  if (typeof configuredUrl === "string" && configuredUrl.trim()) {
    return { source: "configured", slot, url: configuredUrl.trim() };
  }
  return { source: "procedural", slot };
}

export const LOCAL_MUSIC_LIMIT_BYTES = MAX_AUDIO_BYTES;
