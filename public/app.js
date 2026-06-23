const config = window.CAPY_CONFIG;
const state = {
  user: null,
  authMode: "register",
  selectedIsland: null,
  currentTopic: "Education",
  resources: [],
  settings: JSON.parse(localStorage.getItem("capy-settings") || "{}")
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const i18n = {
  en: { begin: "Where would you like to begin?", explore: "Explore at your own pace. There is no wrong door—and Mori can help make any topic feel more manageable." },
  zh: { begin: "你想从哪里开始？", explore: "按自己的节奏探索。没有走错的门——Mori 会帮你把每个主题都变得更容易理解。" },
  es: { begin: "¿Por dónde te gustaría empezar?", explore: "Explora a tu propio ritmo. No hay una puerta equivocada; Mori puede hacer que cada tema sea más manejable." }
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3000);
}

function showScreen(name) {
  ["auth", "survey", "app"].forEach((screen) => $(`#${screen}-screen`).classList.toggle("hidden", screen !== name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$("[data-auth-mode]").forEach((button) => {
    const active = button.dataset.authMode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#name-field").classList.toggle("hidden", mode === "login");
  $("#name-field input").required = mode === "register";
  $("#auth-submit-label").textContent = mode === "register" ? "Create my village" : "Log in";
  $("#auth-form [name='password']").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("#auth-error").textContent = "";
}

async function submitAuth(event) {
  event.preventDefault();
  const formElement = event.target;
  const form = new FormData(formElement);
  const payload = Object.fromEntries(form.entries());
  const submit = formElement.querySelector("button[type='submit']");
  submit.disabled = true;
  $("#auth-error").textContent = "";
  try {
    const { user } = await api(`/api/auth/${state.authMode}`, { method: "POST", body: JSON.stringify(payload) });
    state.user = user;
    routeForUser();
  } catch (error) {
    $("#auth-error").textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

async function submitSurvey(event) {
  event.preventDefault();
  const formElement = event.target;
  const form = new FormData(formElement);
  const responses = {
    interests: form.getAll("interests"),
    age: form.get("age"),
    journey: form.get("journey"),
    situation: form.getAll("situation"),
    note: String(form.get("note") || "").trim()
  };
  if (!responses.interests.length) {
    $("#survey-error").textContent = "Please choose at least one area of interest.";
    return;
  }
  const button = formElement.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Creating your record…";
  try {
    const { user, sync } = await api("/api/profile", { method: "POST", body: JSON.stringify({ responses }) });
    state.user = user;
    showScreen("app");
    hydrateApp();
    toast(sync.synced ? "Personal record saved and synced." : "Personal record saved locally. Sheet sync can be connected later.");
  } catch (error) {
    $("#survey-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = "Create my personal record <span aria-hidden='true'>→</span>";
  }
}

function routeForUser() {
  if (!state.user) return showScreen("auth");
  if (!state.user.surveyCompleted) return showScreen("survey");
  showScreen("app");
  hydrateApp();
}

function renderBuildings() {
  const layer = $("#building-layer");
  layer.innerHTML = config.buildings.map((building) => `
    <button class="building" style="left:${building.x}%;top:${building.y}%" data-building="${escapeHtml(building.id)}" data-island="${building.island}" data-type="${building.type}" data-label="${escapeHtml(building.short)}" aria-label="Open ${escapeHtml(building.label)} on ${building.island === "autism" ? "Autism Island" : "ADHD Island"}">
      <span class="building-icon" aria-hidden="true">${escapeHtml(building.icon)}</span>
    </button>`).join("");
}

function selectIsland(island) {
  state.selectedIsland = island;
  const stage = $("#map-stage");
  stage.classList.remove("focus-autism", "focus-adhd");
  stage.classList.add(`focus-${island}`);
  $("#reset-map").classList.remove("hidden");
  $(".map-hint").textContent = `Choose a building on ${island === "autism" ? "Autism Island" : "ADHD Island"}`;
}

function resetMap() {
  state.selectedIsland = null;
  $("#map-stage").classList.remove("focus-autism", "focus-adhd");
  $("#reset-map").classList.add("hidden");
  $(".map-hint").innerHTML = '<span aria-hidden="true">↖</span> Select an island, then choose a building';
}

function openPanel({ title, eyebrow = "Village building", html }) {
  $("#panel-title").textContent = title;
  $("#panel-eyebrow").textContent = eyebrow;
  $("#panel-content").innerHTML = html;
  $("#panel").classList.add("open");
  $("#panel").setAttribute("aria-hidden", "false");
  $("#panel-scrim").classList.add("open");
  $("#panel .icon-button").focus();
}

function closePanel() {
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#panel-scrim").classList.remove("open");
}

function supportPanel() {
  openPanel({
    title: "Support & Contact",
    eyebrow: "A steadier next step",
    html: `<p class="panel-intro">${escapeHtml(config.support.intro)}</p>
      <div class="card-list">${config.support.contacts.map((contact) => `<article class="info-card"><div><h3>${escapeHtml(contact.title)}</h3><p>${escapeHtml(contact.detail)}</p></div><a href="${escapeHtml(contact.href)}" target="${contact.href.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">${escapeHtml(contact.action)} →</a></article>`).join("")}</div>
      <h3>Small ways to prepare</h3><ul class="gentle-list">${config.support.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>
      <p class="privacy-note">Edit all contact cards in <code>public/site-config.js</code>.</p>`
  });
}

function settingsPanel() {
  const current = state.settings;
  openPanel({
    title: "Settings Studio",
    eyebrow: "Make the village feel right",
    html: `<p class="panel-intro">These preferences are saved on this device.</p>
      <div class="setting-group"><strong>Text size</strong><div class="setting-options">
        ${[["small","Smaller"],["normal","Standard"],["large","Larger"],["xlarge","Extra large"]].map(([value,label]) => `<button class="setting-option ${current.fontSize === value || (!current.fontSize && value === "normal") ? "active" : ""}" data-setting="fontSize" data-value="${value}">${label}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>Color palette</strong><div class="setting-options">
        ${[["sage","#4e856d","Calm sage"],["blue","#517c97","Soft blue"],["plum","#796683","Warm plum"],["high","#111","High contrast"]].map(([value,color,label]) => `<button class="setting-option ${current.theme === value || (!current.theme && value === "sage") ? "active" : ""}" data-setting="theme" data-value="${value}"><span class="color-dot" style="background:${color}"></span>${label}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>Language</strong><div class="setting-options">
        ${[["en","English"],["zh","中文"],["es","Español"]].map(([value,label]) => `<button class="setting-option ${current.language === value || (!current.language && value === "en") ? "active" : ""}" data-setting="language" data-value="${value}">${label}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>Motion & visual detail</strong><button class="secondary-button" data-action="toggle-calm">${document.body.classList.contains("low-stimulation") ? "Use standard view" : "Use low-stimulation view"}</button></div>`
  });
}

function activitiesPanel() {
  openPanel({
    title: "Volunteer & Activity",
    eyebrow: "Things we can do together",
    html: `<p class="panel-intro">Upcoming community activities. Only project editors can change these listings.</p>
      <div class="card-list">${config.activities.map((activity) => `<article class="activity-card"><div class="date-badge">${escapeHtml(activity.date)}</div><div><small>${escapeHtml(activity.meta)}</small><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.description)}</p></div></article>`).join("")}</div>
      <p class="privacy-note">Edit activities in <code>public/site-config.js</code>; users have no editing controls.</p>`
  });
}

function aiPanel(topic = "Education") {
  state.currentTopic = topic;
  const examples = topic === "Legal" ? "For example: I need help understanding a 504 plan for an 11-year-old…" : "For example: I’m looking for executive-function support for a middle-school student…";
  openPanel({
    title: `${topic} Guide`,
    eyebrow: "Mori · Personalized resource matching",
    html: `<div class="ai-shell">
      <div class="mori-stage"><div class="mori-character" id="mori-character"><span class="capy-ear left"></span><span class="capy-ear right"></span><span class="capy-eye left"></span><span class="capy-eye right"></span><span class="capy-nose"></span></div><div><h3>Hi, I’m Mori.</h3><p>I’ll use your personal record, this building’s topic, and the resource database—never made-up links.</p></div></div>
      <form id="ai-form" class="ai-form"><label>What are you trying to find?<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}"></textarea></label><button class="primary-button" type="submit">Find fitting resources <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form>
      <div id="ai-results"></div>
      <p class="privacy-note">Mori provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.</p>
    </div>`
  });
}

async function submitAi(event) {
  event.preventDefault();
  const formElement = event.target;
  const description = new FormData(formElement).get("description");
  const button = formElement.querySelector("button[type='submit']");
  const character = $("#mori-character");
  button.disabled = true;
  button.textContent = "Mori is checking the village…";
  character?.classList.add("thinking");
  $("#ai-error").textContent = "";
  try {
    const data = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify({ topic: state.currentTopic, description }) });
    character?.classList.remove("thinking");
    character?.classList.add("celebrate");
    setTimeout(() => character?.classList.remove("celebrate"), 1500);
    $("#ai-results").innerHTML = `<div class="ai-response">${escapeHtml(data.answer)}</div><div class="card-list">${data.resources.map(resourceCard).join("")}</div><p class="privacy-note">Database source: ${escapeHtml(data.source)} · ${data.ai ? "AI-assisted explanation" : "Rule-based demo mode"}</p>`;
  } catch (error) {
    $("#ai-error").textContent = error.message;
    character?.classList.remove("thinking");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Find fitting resources <span aria-hidden="true">→</span>';
  }
}

function resourceCard(resource) {
  const categories = [...(resource.categories || []), ...(resource.tags || [])].slice(0, 5);
  return `<article class="resource-card"><h3>${escapeHtml(resource.name)}</h3><p>${escapeHtml(resource.description)}</p><div class="resource-meta"><span>${escapeHtml(resource.age || "All ages")}</span><span>${escapeHtml(resource.location || "See website")}</span><span>${escapeHtml(resource.price || "See website")}</span>${categories.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div><a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Visit resource ↗</a></article>`;
}

function profilePanel() {
  const profile = state.user?.profile;
  const history = state.user?.history || [];
  openPanel({
    title: "My personal record",
    eyebrow: state.user?.name || "Village visitor",
    html: `<p class="panel-intro">This record helps Mori choose more relevant entries from the resource database.</p>
      <div class="record-summary">${escapeHtml(profile?.summary || "Complete the Community Compass to create your record.")}</div>
      <div class="card-list"><article class="record-card"><strong>Recent resource searches</strong><ul class="gentle-list">${history.length ? history.slice(-5).reverse().map((item) => `<li><strong>${escapeHtml(item.topic)}</strong> · ${escapeHtml(item.description)}</li>`).join("") : "<li>No searches yet.</li>"}</ul></article></div>
      <form id="feedback-form" class="feedback-form"><label>Feedback for the project team<textarea name="feedback" rows="4" placeholder="What felt helpful or confusing?"></textarea></label><button class="secondary-button" type="submit">Save feedback</button><p id="feedback-status" role="status"></p></form>
      <button class="text-button" data-action="logout">Log out</button>`
  });
}

function handleBuilding(id) {
  const building = config.buildings.find((item) => item.id === id);
  if (!building) return;
  if (building.type === "support") supportPanel();
  if (building.type === "settings") settingsPanel();
  if (building.type === "activity") activitiesPanel();
  if (building.type === "ai") aiPanel(building.topic);
}

function applySettings() {
  const { fontSize = "normal", theme = "sage", language = "en", calm = false } = state.settings;
  const scales = { small: ".9", normal: "1", large: "1.12", xlarge: "1.25" };
  document.documentElement.style.setProperty("--font-scale", scales[fontSize] || "1");
  document.body.classList.remove("theme-blue", "theme-plum", "theme-high");
  if (theme !== "sage") document.body.classList.add(`theme-${theme}`);
  document.body.classList.toggle("low-stimulation", Boolean(calm));
  $("#calm-toggle")?.setAttribute("aria-pressed", String(Boolean(calm)));
  const dictionary = i18n[language] || i18n.en;
  $$('[data-i18n]').forEach((element) => { element.textContent = dictionary[element.dataset.i18n] || i18n.en[element.dataset.i18n]; });
  document.documentElement.lang = language;
  localStorage.setItem("capy-settings", JSON.stringify(state.settings));
}

function updateSetting(key, value) {
  state.settings[key] = value;
  applySettings();
  settingsPanel();
}

function toggleCalm() {
  state.settings.calm = !state.settings.calm;
  applySettings();
  toast(state.settings.calm ? "Low-stimulation view is on." : "Standard view is on.");
  if ($("#panel").classList.contains("open") && $("#panel-title").textContent === "Settings Studio") settingsPanel();
}

async function loadResources(force = false) {
  const count = $("#resource-count");
  const source = $("#resource-source");
  count.textContent = "Refreshing resources…";
  try {
    const data = await api(`/api/resources${force ? "?refresh=1" : ""}`);
    state.resources = data.resources;
    count.textContent = `${data.resources.length} resources ready`;
    source.textContent = data.source === "google-sheet-live" ? "Live from Google Sheets · auto-refreshes" : data.source === "google-sheet-cache" ? "Google Sheets · recently refreshed" : "Bundled fallback · check sheet access";
    if (force) toast("Resource database refreshed.");
  } catch (error) {
    count.textContent = "Resource database unavailable";
    source.textContent = error.message;
  }
}

function hydrateApp() {
  $("#avatar-initial").textContent = (state.user?.name || "C").charAt(0).toUpperCase();
  $("#map-image").src = config.map.image;
  $("#original-survey-link").href = config.survey.url.replace("?embedded=true", "");
  renderBuildings();
  applySettings();
  loadResources();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  closePanel();
  showScreen("auth");
  $("#auth-form").reset();
}

async function submitFeedback(event) {
  event.preventDefault();
  const feedback = new FormData(event.target).get("feedback");
  const status = $("#feedback-status");
  status.textContent = "Saving…";
  try {
    await api("/api/feedback", { method: "POST", body: JSON.stringify({ feedback }) });
    status.textContent = "Feedback saved. Thank you.";
  } catch (error) {
    status.textContent = error.message;
  }
}

document.addEventListener("click", (event) => {
  const authButton = event.target.closest("[data-auth-mode]");
  if (authButton) return setAuthMode(authButton.dataset.authMode);
  const islandButton = event.target.closest("[data-island]:not(.building)");
  if (islandButton) return selectIsland(islandButton.dataset.island);
  const building = event.target.closest("[data-building]");
  if (building) return handleBuilding(building.dataset.building);
  const setting = event.target.closest("[data-setting]");
  if (setting) return updateSetting(setting.dataset.setting, setting.dataset.value);
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "close-panel") closePanel();
  if (action === "reset-map" || action === "home") { closePanel(); resetMap(); }
  if (action === "open-profile") profilePanel();
  if (action === "open-mori") aiPanel("Education");
  if (action === "logout") logout();
  if (action === "toggle-calm") toggleCalm();
  if (action === "refresh-resources") loadResources(true);
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") submitAuth(event);
  if (event.target.id === "survey-form") submitSurvey(event);
  if (event.target.id === "ai-form") submitAi(event);
  if (event.target.id === "feedback-form") submitFeedback(event);
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePanel(); });
$("#calm-toggle").addEventListener("click", toggleCalm);
$("#original-survey-link").href = config.survey.url.replace("?embedded=true", "");

(async function boot() {
  setAuthMode("register");
  applySettings();
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {}
  routeForUser();
})();
