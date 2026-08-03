import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function sources() {
  return Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
}

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Expected ${start} before ${end}`);
  return source.slice(from, to);
}

test("group administration controls trust server capabilities and distinguish owner, admin, and member", async () => {
  const [app] = await sources();
  const capabilities = section(app, "function communityRoomCapabilities", "\nfunction communityCurrentRoomMute");
  assert.match(capabilities, /canManageAdmins:\s*room\.canManageAdmins === true/);
  assert.doesNotMatch(capabilities, /canManageAdmins:[^\n]*canManageMembers/);
  for (const capability of ["canManageMembers", "canManageAdmins", "canManageJoinSettings", "canTransferOwnership", "canDeleteGroup", "canMentionEveryone"]) {
    assert.match(capabilities, new RegExp(capability));
  }

  const members = section(app, "function groupMemberControls", "\nfunction communityRoomManagementSignature");
  assert.match(members, /communityMemberRoleBadge\(member\)/);
  assert.match(members, /role !== "owner"/);
  assert.match(members, /!\(room\.systemManaged && member\.isSiteAdmin\)/);
  for (const action of ["promote-group-admin", "demote-group-admin", "transfer-community-ownership", "mute-community-member", "unmute-community-member", "remove-community-member"]) {
    assert.match(members, new RegExp(`data-action="${action}"`));
  }
  assert.match(members, /capabilities\.canManageAdmins/);
  assert.match(members, /capabilities\.canTransferOwnership/);
  assert.match(members, /capabilities\.canManageMembers/);

  const chat = section(app, "function communityRoomWorkspaceMainHtml", "\nfunction communityOverviewHtml");
  assert.match(chat, /room\.kind === "group" \? `<button[^`]*data-mention="@everyone"/);
  assert.doesNotMatch(chat, /capabilities\.canMentionEveryone/);
});

test("group details expose announcements, approval review, protected leaving, and destructive confirmation", async () => {
  const [app] = await sources();
  const management = section(app, "function communityGroupManagementHtml", "\nfunction communityRoomInfoHtml");
  for (const field of ["announcement", "announcementPinned", "joinApprovalRequired", "inviteConfirmationRequired"]) {
    assert.match(management, new RegExp(`name="${field}"`));
  }
  assert.match(management, /capabilities\.canManageJoinSettings/);
  assert.match(management, /data-action="review-community-join-request"/);
  assert.match(management, /data-action="dissolve-community-group"/);

  const details = section(app, "function communityRoomInfoHtml", "\nfunction communityRoomWorkspaceMainHtml");
  assert.match(details, /currentUserRole === "owner"/);
  assert.match(details, /Transfer ownership before you leave/);
  assert.match(details, /community-info-disabled/);

  const dissolve = section(app, "async function dissolveCommunityGroup", "\nasync function submitCommunityPost");
  assert.match(dissolve, /Type “\$\{roomName\}” to continue/);
  assert.match(dissolve, /Final confirmation:/);
  assert.match(dissolve, /method: "DELETE"/);
});

test("group management actions use scoped room APIs and refresh authority after every mutation", async () => {
  const [app] = await sources();
  const handlers = section(app, "async function updateCommunityGroupAdmin", "\nasync function submitCommunityPost");
  assert.match(handlers, /\/members\/\$\{encodeURIComponent\(userId\)\}/);
  assert.match(handlers, /JSON\.stringify\(\{ role \}\)/);
  assert.match(handlers, /\/ownership`/);
  assert.match(handlers, /durationSeconds:\s*Math\.round\(hours \* 3600\)/);
  assert.match(handlers, /mutedUntil:\s*null/);
  assert.match(handlers, /\/join-requests\/\$\{encodeURIComponent\(requestId\)\}/);
  assert.ok((handlers.match(/await openCommunityRoom\(room\.id, room\.name\)/g) || []).length >= 6);

  const openRoom = section(app, "async function openCommunityRoom", "\nasync function submitCommunitySettings");
  assert.match(openRoom, /\/join-requests`/);
  assert.match(openRoom, /canReviewJoinRequests/);
  const settings = section(app, "async function submitCommunityGroupSettings", "\nasync function updateCommunityGroupAdmin");
  assert.match(settings, /form\.elements\.namedItem\("joinApprovalRequired"\)/);
  assert.match(settings, /form\.elements\.namedItem\("inviteConfirmationRequired"\)/);
});

test("group administration uses the dark WeChat-style details drawer at desktop and mobile widths", async () => {
  const [, css] = await sources();
  for (const className of [
    "community-member-row",
    "community-member-role",
    "community-member-menu",
    "community-group-settings",
    "community-join-request",
    "community-group-danger-action",
    "community-group-announcement",
    "community-room-mute-banner"
  ]) assert.match(css, new RegExp(`\\.${className}`));
  assert.match(css, /\.community-room-info\s*\{[\s\S]*?width:\s*min\(23rem, 88vw\)/);
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*?\.community-room-info/);
});
