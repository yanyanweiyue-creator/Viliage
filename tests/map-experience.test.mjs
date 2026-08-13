import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadConfig() {
  const source = await readFile(new URL("../public/site-config.js", import.meta.url), "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.CAPY_CONFIG;
}

test("approved PDF map raster and its single-island interaction shell are present", async () => {
  const [config, html, css, app] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.equal(config.map.image, "/assets/village-map-approved.png");
  await access(new URL("../public/assets/village-map-approved.png", import.meta.url));
  assert.match(html, /id="island-transition"/);
  assert.match(html, /id="surface-motion"/);
  assert.match(html, /data-action="continue-guest"/);
  assert.match(html, /class="island-hit-area autism"/);
  assert.match(html, /class="island-hit-area adhd"/);
  assert.match(html, /styles\.css\?v=quick-search-i18n-park-20260727b/);
  assert.match(html, /app\.js\?v=quick-search-i18n-park-20260727b/);
  assert.match(css, /body\.scene-2d \.map-hotspot \{[^}]*width:\s*calc\(var\(--hotspot-width\) \* \.72\)/);
  assert.match(css, /body\.scene-2d \.map-hotspot \{[^}]*height:\s*calc\(var\(--hotspot-height\) \* \.62\)/);
  assert.match(css, /body\.scene-2d \.map-hotspot \{[^}]*border:\s*0 !important/);
  assert.match(css, /body\.scene-2d \.map-stage\.focus-autism \.map-hotspot\[data-island="autism"\],[\s\S]*?border:\s*1\.5px dashed rgba\(255,255,255,\.82\) !important/);
  assert.match(css, /\.ecosystem-actor\[data-species="capybara"\] \{[^}]*width:\s*clamp\(1\.45rem, 2\.45vw, 2\.65rem\)/);
  assert.match(app, /type="button" data-action="save-announcement"/);
  assert.match(app, /if \(action === "save-announcement"\) submitAnnouncementForm/);
  assert.match(app, /activity-form"\) submitActivity/);
  assert.match(app, /primary-keyword-blocklist-form/);
  assert.match(app, /submitPrimaryKeywordBlocklist/);
  assert.match(app, /finally \{[\s\S]*control\.disabled = false;[\s\S]*delete control\.dataset\.busy/);
  assert.match(app, /class="hotspot-outline"/);
  assert.match(css, /\.hotspot-outline \{[^}]*display:\s*none/);
  assert.match(css, /body\.scene-3d \.celestial \{[^}]*display:\s*none/);
  assert.match(css, /\.building::after \{[^}]*opacity:\s*0/);
  assert.match(css, /\.ecosystem-actor\.interactive-actor:is\(:hover,:focus-visible\)::before \{[^}]*content:\s*none/);
  assert.match(css, /\.map-hotspot::after \{[^}]*content:\s*attr\(data-label\)/);
  assert.match(css, /body\.scene-2d \.map-hotspot::after \{[^}]*display:\s*block/);
  assert.doesNotMatch(await readFile(new URL("../public/ecosystem-runtime.mjs", import.meta.url), "utf8"), /element\.title = definition\.label/);
  assert.doesNotMatch(css, /\.map-hotspot:hover::after,\s*\.map-hotspot:focus-visible::after\s*\{[^}]*opacity:\s*1/);
  assert.match(css, /body\.scene-2d \.map-stage\.focus-autism \.map-hotspot\[data-island="autism"\]:hover::after/);
  assert.match(css, /body\.scene-2d \.map-stage\.focus-adhd \.map-hotspot\[data-island="adhd"\]:hover::after/);
  assert.match(css, /body\.scene-3d \.map-hotspot[^}]*border:\s*0 !important/);
  assert.match(css, /\.island-hit-area[^}]*background:\s*transparent/);
  assert.match(css, /\.island-hit-area\.autism[^}]*clip-path:\s*polygon\(3\.8% 52\.4%/);
  assert.match(css, /\.island-hit-area\.adhd[^}]*clip-path:\s*polygon\(49\.2% 58\.2%/);
  assert.match(css, /\.island-label[^}]*display:\s*none/);
  assert.match(css, /body\.scene-3d \.island-label[^}]*display:\s*grid/);
  assert.match(css, /\.map-hotspot \{[^}]*border-radius:\s*\.55rem/);
  assert.match(html, /id="waffles-intro"/);
  assert.match(css, /island-transition\.active/);
  assert.match(css, /island-transition\.disperse/);
  assert.match(css, /map-stage\.focus-autism/);
  assert.match(css, /map-stage\.focus-adhd/);
  assert.match(app, /const orbitStart = celestialOrbit\(0\)/);
  assert.match(app, /function guidePanel\(\)/);
  assert.match(app, /if \(action === "open-mori"\) guidePanel\(\)/);
  assert.match(app, /\/api\/guide\/chat/);
  assert.match(app, /data-action="speak-guide"/);
  assert.match(app, /data-action="listen-guide"/);
  assert.match(app, /data-action="guide-suggestion"/);
  assert.match(app, /function startGuideVoiceInput\(\)/);
  assert.match(app, /startVoiceCommand\(\{ continuous: true, announce: false \}\)/);
  assert.match(app, /guideScoringTitle/);
  assert.match(app, /resources with the most points are the ones Waffles sees as most relevant/);
  assert.doesNotMatch(app, /two islands connected by a small bridge/);
  assert.match(app, /searchQuery/);
  assert.match(app, /autoSubmit/);
  assert.match(css, /\.guide-chat/);
  assert.match(css, /\.guide-message/);
});

test("research feedback adds a 1-5 rating and optional details without changing My record feedback", async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.equal((html.match(/data-action="select-feedback-rating"/g) || []).length, 5);
  assert.match(html, /data-feedback-details[^>]*maxlength="2000"/);
  assert.match(app, /function renderResearchFeedbackFields\(\)/);
  assert.match(app, /data-action="select-feedback-rating"/);
  assert.match(app, /rating,\s*details,\s*source/);
  assert.match(css, /\.feedback-star-bar/);
  assert.match(css, /\.research-feedback-details textarea/);
  assert.match(app, /<form id="feedback-form" class="feedback-form">/);
  assert.doesNotMatch(app, /<form id="feedback-form"[^>]*data-feedback-container/);
});

test("every building opens through a capybara loading walk into its illustrated scene", async () => {
  const [config, html, css, app, live3d] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/interior-3d.mjs", import.meta.url), "utf8")
  ]);
  assert.deepEqual(Object.keys(config.interiors).sort(), ["activity", "courthouse", "jungle", "park", "school", "village"]);
  for (const scene of Object.values(config.interiors)) {
    if (scene.image.startsWith("data:")) continue;
    await access(new URL(`../public${scene.image}`, import.meta.url));
  }
  assert.equal(config.buildings.every((building) => Boolean(config.interiors[building.interior])), true);
  assert.equal(config.buildings.every((building) => !building.interior2d || Boolean(config.interiors[building.interior2d])), true);
  assert.match(html, /id="building-loading"/);
  assert.match(html, /id="building-interior"/);
  assert.match(html, /id="building-interior-3d"/);
  assert.match(html, /data-action="exit-building"/);
  assert.match(css, /\.building-loading \{[^}]*background:\s*#050706/);
  assert.match(css, /@keyframes buildingWalk/);
  assert.match(app, /function enterBuilding\(building\)/);
  assert.match(app, /showBuildingInterior\(building\)/);
  assert.match(app, /data-action="toggle-precision-research"/);
  assert.match(app, /allowFollowUpQuestions:\s*Boolean\(state\.settings\.precisionResearch\)/);
  assert.match(app, /data-action="restart-introduction"/);
  assert.match(app, /data-action="edit-survey"/);
  assert.match(app, /openWafflesIntro\(\{ force: true \}\)/);
  assert.match(app, /new LiveBuildingInterior/);
  assert.match(app, /state\.settings\.sceneMode === "3d"/);
  assert.match(css, /\.building-interior\.live-3d-ready \.building-interior-3d\.active/);
  await access(new URL("../public/vendor/three.module.min.js", import.meta.url));
  await access(new URL("../public/vendor/three.core.min.js", import.meta.url));
  for (const building of config.buildings) assert.match(live3d, new RegExp(`"${building.id}"\\s*:`));
  for (const kind of ["school", "activity", "courthouse", "village", "jungle"]) {
    assert.match(live3d, new RegExp(`function build${kind[0].toUpperCase()}${kind.slice(1)}\\(`));
  }
  assert.match(live3d, /requestAnimationFrame/);
  assert.match(live3d, /pointermove/);
  assert.match(live3d, /WebGLRenderer/);
  assert.match(live3d, /createPatternTexture/);
  assert.match(live3d, /new THREE\.CanvasTexture/);
  for (const materialName of ["wood", "stone", "bark", "leaf", "grass", "fur"]) assert.match(live3d, new RegExp(`${materialName}: createPatternTexture`));
  assert.match(live3d, /function addSceneLighting/);
  assert.match(live3d, /new THREE\.SpotLight/);
  assert.match(live3d, /sheen:\s*\.34/);
  for (const quality of ["low", "medium", "high", "ultra"]) {
    assert.match(live3d, new RegExp(`${quality}: \\{ pixelRatio:`));
  }
  assert.match(live3d, /setEnvironment\(environment/);
  assert.match(live3d, /createWeatherField\(\)/);
  assert.match(live3d, /new THREE\.PointsMaterial/);
  assert.match(live3d, /toneMappingExposure/);
  assert.match(live3d, /weather === "storm"/);
  assert.match(live3d, /const eyeCatchlight = addSphere/);
  assert.match(live3d, /eye\.scale\.y = 1 - blink/);
  assert.equal((live3d.match(/const eye = new THREE\.Group\(\)/g) || []).length, 1);
  assert.doesNotMatch(live3d, /nostril/i);
  assert.match(app, /current\.sceneMode === "3d" \? `<div class="setting-group visual-quality-settings"/);
  assert.match(app, /state\.interior3d\?\.setEnvironment\(renderedEnvironment\)/);
  assert.match(css, /\.visual-quality-settings \.setting-options/);
});

test("guest entry always starts the introduction and Quick Research uses the personal record without an island", async () => {
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const guestStart = app.indexOf("async function continueAsGuest");
  const guestEnd = app.indexOf("\nfunction prepareSurveyForm", guestStart);
  const guest = app.slice(guestStart, guestEnd);
  assert.match(guest, /routeForUser\(\);[\s\S]*?openWafflesIntro\(\{ guestSession: true \}\)/);

  const introStart = app.indexOf("function openWafflesIntro");
  const introEnd = app.indexOf("\nasync function finishWafflesIntro", introStart);
  const intro = app.slice(introStart, introEnd);
  assert.match(intro, /state\.user\.guest && !guestSession/);

  const quickStart = app.indexOf("function quickSearchPanel");
  const quickEnd = app.indexOf("\nfunction aiPanel", quickStart);
  const quick = app.slice(quickStart, quickEnd);
  assert.doesNotMatch(quick, /name="island"|selectedPath|quickSearchPath/);
  assert.match(quick, /usePersonalRecord: true/);
  assert.match(app, /usePersonalRecord: state\.quickResearchUsesPersonalRecord/);
});

test("low-stimulation mode removes animals and weather while forcing the lowest 3D quality", async () => {
  const [app, css, live3d, immersive] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/interior-3d.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/immersive-scene.mjs", import.meta.url), "utf8")
  ]);
  assert.match(app, /function effectiveVisualQuality\(\) \{\s*return state\.settings\.calm \? "low"/);
  assert.match(app, /visualQualityBeforeCalm/);
  assert.match(app, /weatherKind: "clear"/);
  assert.match(app, /state\.surfaceMotion\?\.setEnabled\(sceneMode !== "3d" && !calm\)/);
  assert.match(app, /if \(!enabled \|\| state\.settings\.calm\) \{ clearTimeout\(this\.animalTimer\); this\.stopEnvironment\(\); this\.stopMusic\(\); \}/);
  assert.match(css, /body\.low-stimulation #environment-status,[\s\S]*body\.low-stimulation \.ecosystem-actor,[\s\S]*body\.low-stimulation #app-screen \.village-character,[\s\S]*\{ display: none !important; \}/);
  assert.match(live3d, /group\.userData\.isAnimal = true/);
  assert.match(live3d, /object\.visible = !this\.reducedMotion/);
  assert.match(immersive, /this\.dpr = this\.reducedMotion \? 1 : Math\.min/);
});

test("administrator functions are collected behind an admin-only header control", async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.match(html, /id="admin-functions-button"[^>]*class="admin-functions-button hidden"/);
  assert.match(html, /data-action="open-admin-functions"/);
  assert.match(app, /classList\.toggle\("hidden", !state\.user\?\.isAdmin\)/);
  assert.match(app, /function adminFunctionsPanel\(\)/);
  for (const action of [
    "admin-publish-announcement",
    "admin-manage-announcements",
    "admin-publish-activity",
    "admin-manage-activities",
    "admin-manage-users",
    "admin-keyword-controls",
    "admin-community-blocklist",
    "admin-community-reports"
  ]) assert.match(app, new RegExp(`data-action="\\$\\{escapeHtml\\(action\\)\\}"|${action}`));
  assert.match(css, /\.admin-function-grid/);
  assert.match(css, /\.admin-function-button/);
});

test("Village Community includes Moments, Self, shared files, documents, and live meetings", async () => {
  const [app, css, meeting] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/community-meeting.mjs", import.meta.url), "utf8")
  ]);
  for (const tab of ["direct", "groups", "moments", "inbox", "self"]) assert.match(app, new RegExp(`\\["${tab}"`));
  for (const action of ["data-community-attachment", "share-community-location", "open-community-document", "toggle-meeting-scheduler", "save-community-message", "report-community-message"]) {
    assert.match(app, new RegExp(action));
  }
  assert.match(app, /moment-camera-button/);
  assert.match(app, /data-community-cover/);
  assert.match(app, /momentVisibilityDays/);
  assert.match(app, /allowStrangerRequests/);
  assert.match(app, /allowStrangerMoments/);
  assert.match(app, /custom-sticker-button/);
  assert.match(css, /\.moments-page/);
  assert.match(css, /\.community-self/);
  assert.match(css, /\.village-meeting/);
  assert.match(css, /\.meeting-video-strip/);
  assert.match(css, /\.meeting-speaker-stage/);
  assert.match(css, /\.meeting-layout\.sidebar-closed/);
  assert.match(meeting, /class="meeting-layout sidebar-closed"/);
  assert.match(meeting, /class="meeting-sidebar hidden"/);
  assert.match(meeting, /id="meeting-video-strip"/);
  assert.match(meeting, /id="meeting-focus-video"/);
  assert.match(meeting, /data-meeting-action="focus-participant"/);
  assert.match(meeting, /data-meeting-action="sidebar-participants"/);
  assert.match(meeting, /data-meeting-action="sidebar-chat"/);
  assert.match(meeting, /classList\.toggle\("camera-off", cameraOff\)/);
  assert.match(app, /if \(metadata\.meetingId\) return state\.meetingRuntime\.open\(metadata\.meetingId,/);
  for (const capability of ["getDisplayMedia", "MediaRecorder", "SpeechRecognition", "whiteboard", "poll"]) assert.match(meeting, new RegExp(capability, "i"));
});

test("Community overview and chat rooms both stay inside the original Village side panel", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  const overviewStart = app.indexOf("function communityOverviewHtml");
  const overviewEnd = app.indexOf("\nasync function communityPanel", overviewStart);
  const overview = app.slice(overviewStart, overviewEnd);
  const panelStart = app.indexOf("async function communityPanel");
  const panelEnd = app.indexOf("\nfunction communityMessagesHtml", panelStart);
  const panel = app.slice(panelStart, panelEnd);
  const roomStart = app.indexOf("async function openCommunityRoom");
  const roomEnd = app.indexOf("\nasync function submitCommunitySettings", roomStart);
  const room = app.slice(roomStart, roomEnd);
  const renderStart = app.indexOf("function renderOpenCommunityRoom");
  const renderEnd = app.indexOf("\nasync function openCommunityRoom", renderStart);
  const renderRoom = app.slice(renderStart, renderEnd);
  const badgesStart = app.indexOf("function renderCommunityBadges");
  const badgesEnd = app.indexOf("\nfunction mergeCommunityRoomUpdates", badgesStart);
  const badges = app.slice(badgesStart, badgesEnd);

  assert.ok(overviewStart >= 0 && overviewEnd > overviewStart);
  assert.match(overview, /classList\.remove\("community-workspace-panel"\)/);
  assert.match(overview, /#panel-title/);
  assert.match(overview, /#panel-eyebrow/);
  assert.match(overview, /class="community-dock"/);
  assert.match(overview, /data-overview-room-id/);
  assert.match(overview, /class="overview-room-avatar"/);
  assert.match(overview, /data-community-tab-badge/);
  assert.match(overview, /return mainHtml;/);
  assert.doesNotMatch(overview, /return communityWorkspaceHtml/);
  assert.doesNotMatch(panel, /className: "community-workspace-panel"/);
  assert.doesNotMatch(room, /className: "community-workspace-panel"/);
  assert.match(room, /renderOpenCommunityRoom\(\)/);
  assert.match(room, /data\.room\.kind === "direct" \? \(roomName \|\| data\.room\.name\)/);
  assert.match(renderRoom, /classList\.remove\("community-workspace-panel"\)/);
  assert.match(renderRoom, /community-panel-room-shell/);
  assert.match(renderRoom, /communityRoomInfoHtml/);
  assert.match(renderRoom, /communityRoomWorkspaceMainHtml/);
  assert.doesNotMatch(renderRoom, /communityWorkspaceHtml\(/);
  assert.match(badges, /data-overview-room-id/);
  assert.match(badges, /\.community-dock \[data-community-tab-badge/);
  assert.match(css, /\.overview-room-avatar \{ position: relative; \}/);
  assert.match(css, /\.community-dock b\.hidden \{ display: none; \}/);
});

test("Community chat rooms use a responsive original side-panel layout with per-room sound and unread controls", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  for (const marker of [
    "communityRoomWorkspaceMainHtml",
    "communityRoomInfoHtml",
    "community-panel-room-shell",
    "community-panel-chat",
    "toggle-room-alerts",
    "/preferences",
    "/read",
    "readCursor",
    "pollCommunityUpdates",
    "playChatDing",
    "community-hotspot-badge",
    "data-community-unread-badge"
  ]) assert.match(app, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const selector of [
    ".community-panel-room-shell",
    ".community-panel-chat",
    ".community-panel-room-info",
    ".community-panel-compose",
    ".community-unread-badge",
    ".community-panel-chat-nav"
  ]) assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const chat = app.slice(app.indexOf("function communityRoomWorkspaceMainHtml"), app.indexOf("\nfunction communityOverviewHtml"));
  assert.match(chat, /community-chat community-panel-chat/);
  assert.doesNotMatch(chat, /community-chat wechat-chat/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.community-panel-compose \.community-message-form/);
  assert.match(app, /events\.filter\(\(event\) => !event\.alertsHidden\)/);
  assert.match(app, /notificationGain\.connect\(this\.context\.destination\)/);
  assert.match(css, /\.community-panel-room-info \{ position: static; width: 100%;/);
  assert.match(css, /#meeting-chat-list \{ grid-row: 5; min-height: 0; \}/);
  assert.match(css, /\.meeting-caption-options > div \{ position: fixed;/);
});

test("live meetings expose raised hands, a collaborative whiteboard, floating polls, and meeting-only chat", async () => {
  const meeting = await readFile(new URL("../public/community-meeting.mjs", import.meta.url), "utf8");
  const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  for (const marker of [
    "meeting-hand-badge",
    "meeting-avatar-hand",
    "meeting-board-toolbar",
    "meeting-board-minimap",
    "boardCursor",
    "meeting-live-poll",
    "poll-start",
    "meeting-chat-targets",
    "meeting-friend-invite",
    "meeting-invite-form",
    "/invitations",
    "/api/community/meetings/${encodeURIComponent(this.meeting.id)}/messages"
  ]) assert.match(meeting, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const marker of [".meeting-hand-badge", ".meeting-board-workspace", ".meeting-live-poll", ".meeting-chat-targets", ".meeting-friend-invite"]) {
    assert.match(styles, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Google Apps Script strictly routes user upserts and maps existing headers", async () => {
  const script = await readFile(new URL("../integrations/google-apps-script.gs", import.meta.url), "utf8");
  assert.match(script, /data\.action === "upsert-user"/);
  assert.match(script, /function upsertUser_\(data\)/);
  for (const header of [
    "Unique User ID",
    "Email",
    "Username",
    "Password",
    "Summary of Survey Response",
    "Survey Response \\(Unedited\\)",
    "Summary of Search History",
    "Save Resource",
    "Dislike Resource"
  ]) assert.match(script, new RegExp(header));
  assert.match(script, /normalizeHeader_\(header\)/);
  assert.match(script, /User Data sheet is missing required row-1 headers/);
  assert.match(script, /existingRow < 0 && email/);
  assert.match(script, /throw new Error\("spreadsheetId is required\."\)/);
  assert.match(script, /throw new Error\("sheetGid is required\."\)/);
  assert.match(script, /Sheet gid " \+ gid \+ " was not found/);
  assert.doesNotMatch(script, /return spreadsheet\.getSheets\(\)\[0\]/);
  assert.doesNotMatch(script, /setValues\(\[missingHeaders\]\)/);
  assert.match(script, /function feedbackHeaderKey_\(value\)/);
  assert.match(script, /\^unique user id \\\(\(\?:if applicable\|n\\\/a if guest\)\\\)\\\)\?\$/);
  assert.match(script, /\^email \\\(\(\?:if applicable\|n\\\/a if guest\)\\\)\\\)\?\$/);
  assert.match(script, /feedbackHeaderKey_\(key\) === normalizedHeader/);
  assert.match(script, /var metricKeys = Object\.keys\(metrics\)/);
  assert.match(script, /normalizeHeader_\(metricKey\) === normalizedHeader/);
  assert.match(script, /setValues\(\[safeSheetRow_\(row\)\]\)\.setNumberFormat\("0\.##"\)/);
  assert.match(script, /var targetRow = 2/);
  assert.doesNotMatch(script, /user-count-row:/);
  assert.match(script, /PropertiesService\.getScriptProperties\(\)\.getProperty\("WEBHOOK_SECRET"\)/);
  assert.match(script, /data\.action === "record-feedback"/);
  assert.match(script, /function appendFeedback_\(data\)/);
  assert.match(script, /status \+ ": " \+ details/);
  assert.match(script, /Feedback sheet needs row-1 headers/);
  assert.match(script, /LockService\.getScriptLock\(\)/);
  assert.match(script, /lock\.releaseLock\(\)/);
  assert.doesNotMatch(script, /Total Guest Logins|Most Number of Online Users|How many poeple feel helpful/);
});

test("village animals and contact details match the current experience", async () => {
  const [config, runtime, css] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/ecosystem-runtime.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  const species = config.ecosystem.animals.map((animal) => animal.species);
  for (const removed of ["rabbit", "cow", "sheep"]) assert.equal(species.includes(removed), false);
  assert.equal(config.support.contacts.at(-1).href, "mailto:Ittakesavillage.capybara@gmail.com");
  assert.match(runtime, /POSITIVE_CHAT/);
  assert.match(runtime, /maybeStartConversation/);
  assert.match(runtime, /celebrate\(\)/);
  assert.match(css, /\.actor-chat-bubble/);
});

test("header logo fits its lockup without the old oversized crop", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  const lockup = css.match(/\.brand-logo-lockup \{[^}]*width:\s*clamp\(([^;]+);[^}]*height:\s*([^;]+);/);
  const image = css.match(/\.brand-logo-lockup img \{[^}]*left:\s*(-?\d+)%[^}]*top:\s*(-?\d+)%[^}]*height:\s*(\d+)%/);
  assert.ok(lockup, "logo lockup should declare explicit dimensions");
  assert.ok(image, "logo image should declare crop-safe placement");
  assert.ok(Number(image[1]) >= -20, "logo should not be pushed too far left");
  assert.ok(Number(image[2]) >= -75, "logo should not be pushed too far above the lockup");
  assert.ok(Number(image[3]) <= 250, "logo should not use the old oversized 297% crop");
});

test("weather status and map hint swap top and bottom positions", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.environment-status \{[^}]*bottom:\s*1rem/);
  assert.match(css, /\.map-hint \{[^}]*top:\s*1\.2rem/);
  assert.doesNotMatch(css, /\.environment-status \{[^}]*top:\s*1rem/);
});

test("single-island focus keeps the whole island in view", async () => {
  const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.map-stage \{[^}]*aspect-ratio:\s*30\s*\/\s*13/);
  assert.match(css, /\.village-map \{[^}]*background:\s*#0797bd/);
  for (const island of ["autism", "adhd"]) {
    const rule = css.match(new RegExp(`\\.map-stage\\.focus-${island} \\{[^}]*transform:\\s*scale\\(([^)]+)\\) translate\\(([-0-9.]+)%`));
    assert.ok(rule, `${island} focus needs an explicit scale and translate`);
    assert.ok(Number(rule[1]) <= 1.35, `${island} focus should not crop the island`);
    assert.ok(Math.abs(Number(rule[2])) <= 10, `${island} focus should not expose the map container edge`);
  }
});

test("the ocean motion mask keeps animation off islands and the bridge", async () => {
  const { normalizedStagePoint, pointIsOpenWater } = await import("../public/surface-motion.mjs");
  assert.equal(pointIsOpenWater(0.03, 0.04), true);
  assert.equal(pointIsOpenWater(0.5, 0.08), true);
  assert.equal(pointIsOpenWater(0.255, 0.615), false);
  assert.equal(pointIsOpenWater(0.745, 0.6), false);
  assert.equal(pointIsOpenWater(0.49, 0.5), true);
  assert.equal(pointIsOpenWater(0.5, 0.55), false);

  const transformedStage = {
    clientWidth: 1000,
    clientHeight: 500,
    getBoundingClientRect: () => ({ left: 100, top: 80, width: 1280, height: 640 })
  };
  assert.deepEqual(normalizedStagePoint({ clientX: 740, clientY: 400 }, transformedStage), { x: .5, y: .5 });
});

test("each island exposes the five approved map destinations", async () => {
  const config = await loadConfig();
  const expectedHotspots = new Map([
    ["autism-support", { x: 29.5, y: 18, hitWidth: 16, hitHeight: 12 }],
    ["autism-education", { x: 21.5, y: 35, hitWidth: 13, hitHeight: 14 }],
    ["autism-legal", { x: 21, y: 60, hitWidth: 10, hitHeight: 25 }],
    ["adhd-support", { x: 80, y: 60, hitWidth: 12.5, hitHeight: 20 }],
    ["adhd-education", { x: 66, y: 40, hitWidth: 12.5, hitHeight: 16.5 }],
    ["adhd-legal", { x: 61, y: 62, hitWidth: 8, hitHeight: 18 }],
    ["adhd-activity", { x: 70, y: 20, hitWidth: 10.5, hitHeight: 10.5 }]
  ]);
  const expected = new Map([
    ["Village", "support"],
    ["School", "ai"],
    ["Courthouse", "ai"],
    ["Park", "ai"],
    ["Woods", "activity"]
  ]);
  for (const island of ["autism", "adhd"]) {
    const buildings = config.buildings.filter((building) => building.island === island);
    assert.equal(buildings.length, 5);
    for (const [label, type] of expected) {
      const building = buildings.find((item) => item.mapLabel === label);
      assert.ok(building, `${island} needs a ${label} hotspot`);
      assert.equal(building.type, type);
      assert.ok(building.hitWidth <= 16.5, `${building.id} hotspot should stay close to the drawing`);
      assert.ok(Number.isFinite(building.x) && Number.isFinite(building.y), `${building.id} needs a center point for its 2D hotspot`);
      assert.ok(Array.isArray(building.hitPolygon), `${building.id} needs an explicit hit polygon`);
      if (expectedHotspots.has(building.id)) {
        assert.deepEqual(
          { x: building.x, y: building.y, hitWidth: building.hitWidth, hitHeight: building.hitHeight },
          expectedHotspots.get(building.id)
        );
      }
    }
    assert.equal(buildings.find((item) => item.mapLabel === "School").topic, "Education");
    assert.equal(buildings.find((item) => item.mapLabel === "Courthouse").topic, "Legal");
    assert.equal(buildings.find((item) => item.mapLabel === "Park").topic, "Recreation");
    assert.equal(buildings.find((item) => item.mapLabel === "Woods").topic, undefined);
  }
});

test("2D buildings select their island before opening building functions", async () => {
  const [config, css, app, surface] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/surface-motion.mjs", import.meta.url), "utf8")
  ]);
  assert.ok(config.buildings.some((building) => building.island === "autism"));
  assert.ok(config.buildings.some((building) => building.island === "adhd"));
  assert.match(app, /data-building="\$\{escapeHtml\(building\.id\)\}"/);
  assert.match(app, /data-island="\$\{building\.island\}"/);
  assert.match(app, /const building = event\.target\.closest\("\[data-building\]"\)/);
  assert.match(app, /if \(building\) return handleBuilding\(building\.dataset\.building\)/);
  assert.match(app, /if \(state\.selectedIsland !== building\.island\) \{\s*selectIsland\(building\.island\);\s*return;\s*\}/);
  assert.match(css, /body\.scene-2d \.map-stage\.focus-autism \.map-hotspot\[data-island="autism"\]/);
  assert.match(css, /body\.scene-2d \.map-stage\.focus-adhd \.map-hotspot\[data-island="adhd"\]/);
  assert.match(surface, /closest\?\.\("\.island-hit-area, \.building, \.map-hotspot"\)/);
});

test("community groups keep descriptions and menus aligned and documents open the full studio", async () => {
  const [css, app, studio, exporter] = await Promise.all([
    readFile(new URL("../public/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/community-documents.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/document-export.mjs", import.meta.url), "utf8")
  ]);
  assert.match(css, /\.village-room-card\s*\{[^}]*grid-template-columns:\s*3rem minmax\(0,1fr\) auto/);
  assert.match(css, /\.village-room-card > \.secondary-button\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.village-room-card > \.community-room-open\s*\{[^}]*border:\s*0/);
  assert.match(css, /\.village-document-studio\.editor-mode\s*\{[^}]*grid-template-rows/);
  assert.match(css, /\.doc-editor-layout\s*\{[^}]*grid-template-columns:\s*13rem minmax\(0,1fr\) 20rem/);
  assert.match(app, /import \{ VillageDocumentStudio \}/);
  assert.match(app, /state\.documentRuntime\.openDocument\(documentId\)/);
  assert.match(studio, /contenteditable="\$\{editable\}"/);
  for (const capability of ["insert-table", "insert-link", "insert-toc", "voice-input", "save-version", "collaborators", "approvals", "signatures", "integrations"]) {
    assert.match(studio, new RegExp(capability));
  }
  for (const template of ["Resume", "Report", "Meeting notes", "Project plan", "Agreement", "Application form", "Letter"]) {
    assert.match(studio, new RegExp(template));
  }
  assert.match(exporter, /0x06054b50/);
  assert.match(exporter, /word\/document\.xml/);
});

test("header offers Quick search and My Record tabs while retaining the avatar shortcut", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(html, /data-action="open-quick-search"[^>]*data-i18n="quickSearch"/);
  assert.match(html, /data-action="open-profile"[^>]*class="nav-button"[^>]*data-i18n="myRecord"/);
  assert.match(html, /class="avatar-button" data-action="open-profile"/);
  assert.match(html, /id="record-status-action" data-action="open-profile"/);
  assert.match(app, /function quickSearchPanel\(\)/);
  assert.match(app, /id="quick-search-form"/);
  assert.match(app, /aiPanel\(String\(formData\.get\("topic"\)/);
  assert.match(css, /\.quick-search-filters\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.app-header nav\s*\{[^}]*grid-area:\s*nav;[^}]*display:\s*flex/);
});

test("the header avatar opens My Record, where the shared profile photo can be changed", async () => {
  const [html, app, css] = await Promise.all([
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/styles.css", import.meta.url), "utf8")
  ]);
  assert.match(html, /class="avatar-button" data-action="open-profile"/);
  assert.match(app, /data-community-avatar data-avatar-context="profile"/);
  assert.match(app, /function renderHeaderAvatar\(\)/);
  assert.match(app, /input\.dataset\.avatarContext === "profile"/);
  assert.match(css, /\.avatar-button img\s*\{[^}]*object-fit:\s*cover/);
});

test("Park uses the supplied illustration only in 2D mode", async () => {
  const [config, app] = await Promise.all([
    loadConfig(),
    readFile(new URL("../public/app.js", import.meta.url), "utf8")
  ]);
  assert.match(config.interiors.park.image, /^data:image\/jpeg;base64,/);
  assert.ok(config.interiors.park.image.length > 100_000);
  for (const park of config.buildings.filter((building) => building.mapLabel === "Park")) {
    assert.equal(park.interior, "jungle");
    assert.equal(park.interior2d, "park");
  }
  assert.match(app, /state\.settings\.sceneMode === "3d" \? building\.interior : building\.interior2d \|\| building\.interior/);
});

test("dynamic Community and Support controls use the selected language", async () => {
  const [app, html] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8")
  ]);
  for (const key of ["yourVillageProfile", "savedFromChat", "villageDocuments", "privacyNotifications", "communitySelfTab", "communitySearchPlaceholder", "communityDirectIntro", "communityNotificationsTitle", "communityGroupsIntro", "supportIntroBody", "supportSearchPlaceholder", "resourcesReadyCount"]) {
    assert.match(app, new RegExp(`t\\("${key}"\\)`));
  }
  assert.match(html, /data-i18n="backIsland"/);
  assert.match(app, /zh:\s*\{[\s\S]*quickSearch:\s*"快速检索"/);
  assert.match(app, /es:\s*\{[\s\S]*quickSearch:\s*"Búsqueda rápida"/);
});
