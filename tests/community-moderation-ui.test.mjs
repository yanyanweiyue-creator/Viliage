import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Community penalty reminder is driven by the server overview on every open", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const panelStart = app.indexOf("async function communityPanel()");
  const panelEnd = app.indexOf("\nfunction communityMessagesHtml", panelStart);
  const panel = app.slice(panelStart, panelEnd);

  assert.ok(panelStart >= 0 && panelEnd > panelStart);
  const overviewFetch = panel.indexOf('await api("/api/community")');
  const optionalFetches = panel.indexOf("await Promise.all");
  const reminder = panel.indexOf("showCommunityPenaltyNotice(data.moderation)");
  const accessCheck = panel.indexOf("data.moderation?.access?.community === false");
  assert.ok(overviewFetch >= 0);
  assert.ok(reminder > overviewFetch);
  assert.ok(accessCheck > reminder);
  assert.ok(optionalFetches > accessCheck);
  assert.match(panel, /communityRestrictedByPenaltyHtml\(data\);[\s\S]*?return;/);

  const reminderStart = app.indexOf("function showCommunityPenaltyNotice");
  const reminderEnd = app.indexOf("\nfunction communityAllRooms", reminderStart);
  const reminderHelper = app.slice(reminderStart, reminderEnd);
  assert.match(reminderHelper, /moderation\.sanctions/);
  assert.match(reminderHelper, /This reminder appears each time you open Village Community while a penalty is active\./);
  assert.match(reminderHelper, /moderationSanctionsHtml\(moderation\)/);

  const detailsStart = app.indexOf("function moderationSanctionsHtml");
  const detailsEnd = app.indexOf("\nfunction communityModerationBanner", detailsStart);
  const detailsHelper = app.slice(detailsStart, detailsEnd);
  for (const label of ["Reason", "Duration", "Ends"]) assert.match(detailsHelper, new RegExp(label));
});

test("chat mute keeps messages readable while disabling every chat-card write control", async () => {
  const [app, meeting, documents] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/community-meeting.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/community-documents.mjs", import.meta.url), "utf8")
  ]);
  const roomStart = app.indexOf("function communityRoomWorkspaceMainHtml");
  const roomEnd = app.indexOf("\nfunction communityOverviewHtml", roomStart);
  const room = app.slice(roomStart, roomEnd);
  assert.match(room, /const chatWritable = communityCanChatWrite\(\)/);
  assert.match(room, /id="community-message-list"/);
  assert.match(room, /communityModerationBanner\(state\.communityOverview\?\.moderation\)/);
  assert.match(room, /textarea name="message" \$\{disabled\}/);
  assert.match(room, /data-community-attachment/);
  assert.match(room, /data-action="share-community-location"/);
  assert.match(room, /data-action="create-community-document"/);
  assert.match(room, /data-action="toggle-meeting-scheduler"/);
  assert.match(room, /room\.systemManaged \? "" : `<label class="compose-tool"[\s\S]*?data-action="toggle-meeting-scheduler"/);
  assert.match(room, /room\.systemManaged \? "" : `<label class="compose-tool" title="Upload a custom sticker">[\s\S]*?data-community-sticker/);
  assert.match(room, /data-action="send-sticker"/);
  assert.ok((room.match(/\$\{disabled\}/g) || []).length >= 10);

  const overviewStart = app.indexOf("function communityOverviewHtml");
  const overviewEnd = app.indexOf("\nasync function communityPanel", overviewStart);
  const overview = app.slice(overviewStart, overviewEnd);
  assert.match(overview, /const chatWritable = communityCanChatWrite\(data\)/);
  assert.match(overview, /communityMomentComposerHtml\(data, \{ chatWritable \}\)/);
  assert.match(overview, /communityPostsHtml\(posts, \{ chatWritable \}\)/);
  assert.match(overview, /communityFriendChoices\(data, "memberIds", \{ disabled: !chatWritable \}\)/);

  for (const handler of [
    "submitCommunityMessage",
    "submitCommunityGroup",
    "submitCommunityRoomInvite",
    "submitCommunityPost",
    "submitCommunityComment",
    "submitCommunityMeeting"
  ]) {
    const start = app.indexOf(`async function ${handler}`);
    const end = app.indexOf("\n}", start) + 2;
    assert.match(app.slice(start, end), /requireCommunityChatWrite\(form\)/);
  }
  assert.match(app, /canChatWrite: \(\) => communityCanChatWrite\(\)/);
  assert.match(meeting, /canChatWrite = \(\) => true/);
  assert.match(meeting, /MODERATION_BLOCKED_MEETING_ACTIONS/);
  assert.match(meeting, /Whiteboard editing is unavailable while your Community chat mute is active/);
  assert.match(documents, /this\.active\.canComment && chatWritable/);
  assert.match(documents, /if \(this\.roomId && !this\.canChatWrite\(\)\)/);

  const openStart = app.indexOf("async function openCommunityRoom");
  const openEnd = app.indexOf("\nasync function submitCommunitySettings", openStart);
  const openRoom = app.slice(openStart, openEnd);
  assert.match(openRoom, /state\.communityRoom = \{[\s\S]*?data, meetingData \}/);
  assert.match(openRoom, /renderOpenCommunityRoom\(\)/);
});

test("room read UI consumes the server's authoritative unread count and notification audio can unlock again", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const readStart = app.indexOf("async function markCommunityRoomRead");
  const readEnd = app.indexOf("\nfunction renderCommunityBadges", readStart);
  const markRead = app.slice(readStart, readEnd);
  assert.match(markRead, /Number\(result\.unreadCount \|\| 0\)/);
  assert.match(markRead, /updateCommunityRoomSummary\(roomId, \{ unreadCount \}\)/);
  assert.doesNotMatch(markRead, /unreadCount:\s*0/);
  assert.match(app, /if \(state\.audio\?\.context\?\.state === "running"\) return;/);
  assert.doesNotMatch(app, /unlockNotifications\(\)\.catch\(\(\) => \{\}\); \}, \{ once: true/);
});

test("administrator penalty UI includes safeguards, revocation, and explicit reopening", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  for (const type of ["chat_mute", "community_ban", "site_blacklist"]) assert.match(app, new RegExp(`value="${type}"`));
  assert.match(app, /data-report-status="open">Reopen for review/);
  assert.match(app, /\/api\/admin\/community-reports\/\$\{encodeURIComponent\(form\.dataset\.reportId\)\}\/sanctions/);
  assert.match(app, /\/api\/admin\/community-sanctions\/\$\{encodeURIComponent\(sanctionId\)\}\/revoke/);
  assert.match(app, /confirm\(warning\)/);
  assert.match(app, /type === "site_blacklist" && !confirm\(`Final confirmation:/);
  assert.match(app, /immediately sign the member out and prevent Village website login/);
  assert.match(app, /Their account data will not be deleted/);
  assert.match(app, /Administrator accounts cannot be penalized through this tool/);
  for (const className of [
    "moderation-banner",
    "moderation-dialog",
    "moderation-sanction-card",
    "moderation-restricted-view",
    "moderation-report-row"
  ]) assert.match(css, new RegExp(`\\.${className}`));
});

test("moderation migration preserves penalties and audit actors independently of admin deletion", async () => {
  const migration = await readFile(new URL("../migrations/0014_community_moderation.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS community_sanctions/);
  assert.match(migration, /CHECK \(type IN \('chat_mute', 'community_ban', 'site_blacklist'\)\)/);
  assert.match(migration, /FOREIGN KEY \(created_by\) REFERENCES users\(id\) ON DELETE SET NULL/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS community_moderation_audit/);
  assert.match(migration, /FOREIGN KEY \(actor_id\) REFERENCES users\(id\) ON DELETE SET NULL/);
  assert.match(migration, /CHECK \(\s*\(duration_seconds IS NULL AND ends_at IS NULL\) OR[\s\S]*?\)/);
});
