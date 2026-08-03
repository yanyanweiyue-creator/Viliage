import test from "node:test";
import assert from "node:assert/strict";
import { communityModerationState, communitySimilarity, containsBlockedLanguage, isCommunityChatWrite, maskBlockedLanguage, normalizeBlockedTerms, normalizeCommunitySanctionInput, normalizeMeetingSignalInput, pairKey, safeDisplayName } from "../community-logic.mjs";

test("community matching uses shared survey fields without exposing notes", () => {
  const current = { responses: { interests: ["ADHD", "Autism"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"], note: "private current note" } };
  const candidate = { responses: { interests: ["ADHD"], age: "8–12", journey: "1–3 years", situation: ["Exploring concerns"], note: "private candidate note" } };
  const match = communitySimilarity(current, candidate);
  assert.equal(match.score, 10);
  assert.ok(match.reasons.some((reason) => reason.includes("ADHD")));
  assert.equal(JSON.stringify(match).includes("private"), false);
});

test("connection pairs are stable and display names are sanitized", () => {
  assert.equal(pairKey("z-user", "a-user"), "a-user:z-user");
  assert.equal(pairKey("a-user", "z-user"), "a-user:z-user");
  assert.equal(safeDisplayName(" <Mira>\n "), "Mira");
});

test("meeting signals reject malformed SDP and ICE payloads", () => {
  assert.deepEqual(normalizeMeetingSignalInput({ kind: "offer", payload: { type: "offer", sdp: "v=0" } }), {
    kind: "offer",
    payload: { type: "offer", sdp: "v=0" }
  });
  assert.throws(() => normalizeMeetingSignalInput({ kind: "offer", payload: {} }), /description is invalid/);
  assert.throws(() => normalizeMeetingSignalInput({ kind: "answer", payload: { type: "offer", sdp: "v=0" } }), /does not match/);
  assert.throws(() => normalizeMeetingSignalInput({ kind: "candidate", payload: [] }), /must be an object/);
  assert.throws(() => normalizeMeetingSignalInput({ kind: "candidate", payload: {} }), /candidate is invalid/);
});

test("community moderation catches abusive English and Chinese while allowing ordinary words", () => {
  assert.equal(containsBlockedLanguage("Please go die"), true);
  assert.equal(containsBlockedLanguage("你这个傻逼"), true);
  assert.equal(containsBlockedLanguage("Dickinson family support group"), false);
  assert.equal(containsBlockedLanguage("Thank you for helping today"), false);
});

test("Community penalties calculate duration, active access, and every chat-writing route", () => {
  const now = Date.parse("2026-07-29T00:00:00.000Z");
  const mute = normalizeCommunitySanctionInput({ type: "chat_mute", reason: "Repeated unsafe messages", durationSeconds: 864000 }, now);
  assert.equal(mute.endsAt, "2026-08-08T00:00:00.000Z");
  const moderation = communityModerationState([{ id: "mute", ...mute, createdAt: mute.startsAt }], now + 1000);
  assert.equal(moderation.access.site, true);
  assert.equal(moderation.access.community, true);
  assert.equal(moderation.access.chatWrite, false);
  assert.equal(moderation.sanctions[0].label, "Chat mute");
  for (const path of [
    "/api/community/connect",
    "/api/community/groups",
    "/api/community/posts",
    "/api/community/posts/post-1/comments",
    "/api/community/rooms/group-general/messages",
    "/api/community/rooms/group-general/invite",
    "/api/community/rooms/group-general/ownership",
    "/api/community/rooms/group-general/join-requests",
    "/api/community/meetings",
    "/api/community/meetings/meeting-1/invitations",
    "/api/community/meetings/meeting-1/messages",
    "/api/community/meetings/meeting-1/polls",
    "/api/community/meetings/meeting-1/whiteboard",
    "/api/community/meeting-messages/message-1/reactions",
    "/api/community/documents/document-1/comments",
    "/api/community/documents/document-1/share",
  ]) assert.equal(isCommunityChatWrite("POST", path), true, path);
  for (const path of [
    "/api/community/rooms/group-general",
    "/api/community/rooms/group-general/members/member-1",
    "/api/community/rooms/group-general/join-requests/request-1"
  ]) assert.equal(isCommunityChatWrite("PATCH", path), true, path);
  for (const path of [
    "/api/community/rooms/group-general",
    "/api/community/rooms/group-general/members/member-1"
  ]) assert.equal(isCommunityChatWrite("DELETE", path), true, path);
  assert.equal(isCommunityChatWrite("DELETE", "/api/community/meeting-messages/message-1/reactions"), false);
  assert.equal(isCommunityChatWrite("GET", "/api/community/rooms/group-general/messages"), false);
  assert.equal(isCommunityChatWrite("POST", "/api/community/messages/message-1/report"), false);
  assert.equal(isCommunityChatWrite("POST", "/api/community/meetings/meeting-1/join"), false);
  assert.equal(isCommunityChatWrite("POST", "/api/community/polls/poll-1/vote"), false);
  assert.throws(() => normalizeCommunitySanctionInput({ type: "site_blacklist", reason: "x", durationSeconds: 60 }, now), /clear penalty reason/);
});

test("shared restricted terms preserve exact phrases and mask matching text", () => {
  const terms = normalizeBlockedTerms("No Spoilers\npineapples\nno spoilers");
  assert.deepEqual(terms, ["no spoilers", "pineapples"]);
  assert.equal(maskBlockedLanguage("Please, no spoilers or PINEAPPLES.", terms), "Please, ** ******** or **********.");
});
