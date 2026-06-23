const config = window.CAPY_CONFIG;

function loadSavedSettings() {
  try {
    return JSON.parse(localStorage.getItem("capy-settings") || "{}");
  } catch {
    localStorage.removeItem("capy-settings");
    return {};
  }
}

const state = {
  user: null,
  authMode: "register",
  selectedIsland: null,
  currentTopic: "Education",
  resources: [],
  sheetSync: { configured: false },
  settings: loadSavedSettings()
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const i18n = {
  en: {
    begin: "Where would you like to begin?", explore: "Explore at your own pace. There is no wrong door—and JA can help make any topic feel more manageable.", choosePath: "Choose your own path",
    village: "Village", myRecord: "My record", lowStimulation: "Low-stimulation", viewBoth: "← View both islands", selectIsland: "Select an island, then choose a building",
    quietGardens: "Quiet gardens", momentumTrails: "Momentum trails", autismIsland: "Autism Island", adhdIsland: "ADHD Island",
    resourcesLoading: "Loading resources…", resourcesChecking: "Checking the live database", personalReady: "Your personal record is ready", personalMatch: "JA uses it only to improve matching", view: "View", refresh: "Refresh",
    jaGuide: "JA · AI guide", jaReady: "I’m here when you’re ready.",
    settingsTitle: "Settings Studio", settingsEyebrow: "Make the village feel right", settingsIntro: "These preferences are saved on this device and applied immediately.",
    textSize: "Text size", smaller: "Smaller", standard: "Standard", larger: "Larger", extraLarge: "Extra large", colorPalette: "Color palette", calmSage: "Calm sage", softBlue: "Soft blue", warmPlum: "Warm plum", highContrast: "High contrast",
    language: "Language", motion: "Motion & visual detail", useLow: "Use low-stimulation view", useStandard: "Use standard view", settingsSaved: "Settings saved and applied.", previewTitle: "Live preview", previewText: "This text changes with your size, color, and language settings.",
    support: "Support", settings: "Settings", education: "Education", legal: "Legal", activities: "Activities",
    supportTitle: "Support & Contact", supportEyebrow: "A steadier next step", prepare: "Small ways to prepare",
    activityTitle: "Volunteer & Activity", activityEyebrow: "Things we can do together", activityIntro: "Upcoming community activities. Only project editors can change these listings.",
    aiEyebrow: "JA · Personalized resource matching", aiHello: "Hi, I’m JA.", aiExplain: "I’ll use your personal record, this building’s topic, and the resource database—never made-up links.", aiQuestion: "What are you trying to find?", aiFind: "Find fitting resources", aiChecking: "JA is checking the village…", aiDisclaimer: "JA provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.",
    recordTitle: "My personal record", recordIntro: "This record helps JA choose more relevant entries from the resource database.", recentSearches: "Recent resource searches", noSearches: "No searches yet.", feedbackLabel: "Feedback for the project team", feedbackSave: "Save feedback", logout: "Log out",
    sheetConnected: "Google Sheet sync connected", sheetMissing: "Google Sheet sync is not connected yet"
  },
  zh: {
    begin: "你想从哪里开始？", explore: "按自己的节奏探索。没有走错的门——JA 会帮你把每个主题都变得更容易理解。", choosePath: "选择你自己的路径",
    village: "村庄", myRecord: "我的记录", lowStimulation: "低刺激模式", viewBoth: "← 查看两座岛", selectIsland: "先选择一座岛，再选择一栋建筑",
    quietGardens: "安静花园", momentumTrails: "活力小径", autismIsland: "自闭症岛", adhdIsland: "ADHD 岛",
    resourcesLoading: "正在加载资源…", resourcesChecking: "正在检查实时数据库", personalReady: "你的个人记录已准备好", personalMatch: "JA 只用它来改善资源匹配", view: "查看", refresh: "刷新",
    jaGuide: "JA · AI 向导", jaReady: "准备好时，我就在这里。",
    settingsTitle: "设置中心", settingsEyebrow: "让村庄更适合你", settingsIntro: "这些偏好会保存在本设备，并立即生效。",
    textSize: "文字大小", smaller: "较小", standard: "标准", larger: "较大", extraLarge: "超大", colorPalette: "颜色主题", calmSage: "宁静绿色", softBlue: "柔和蓝色", warmPlum: "温暖紫色", highContrast: "高对比度",
    language: "语言", motion: "动画与视觉细节", useLow: "使用低刺激模式", useStandard: "使用标准模式", settingsSaved: "设置已保存并生效。", previewTitle: "实时预览", previewText: "这段文字会跟随字体、颜色和语言设置变化。",
    support: "支持", settings: "设置", education: "教育", legal: "法律", activities: "活动",
    supportTitle: "支持与联系", supportEyebrow: "找到更稳妥的下一步", prepare: "可以先做的小准备",
    activityTitle: "志愿者与活动", activityEyebrow: "一起参与的事情", activityIntro: "即将开始的社区活动。只有项目管理员可以修改内容。",
    aiEyebrow: "JA · 个性化资源匹配", aiHello: "你好，我是 JA。", aiExplain: "我会结合你的个人记录、建筑主题和资源数据库，不会编造链接。", aiQuestion: "你正在寻找什么？", aiFind: "查找合适资源", aiChecking: "JA 正在查找村庄资源…", aiDisclaimer: "JA 提供资源导航，不构成医疗或法律建议。请向服务机构确认资格、费用与当前名额。",
    recordTitle: "我的个人记录", recordIntro: "这份记录帮助 JA 从数据库中选择更相关的资源。", recentSearches: "最近的资源搜索", noSearches: "还没有搜索记录。", feedbackLabel: "给项目团队的反馈", feedbackSave: "保存反馈", logout: "退出登录",
    sheetConnected: "Google Sheet 自动同步已连接", sheetMissing: "Google Sheet 自动同步尚未连接"
  },
  es: {
    begin: "¿Por dónde te gustaría empezar?", explore: "Explora a tu propio ritmo. No hay una puerta equivocada; JA puede hacer que cada tema sea más manejable.", choosePath: "Elige tu propio camino",
    village: "Aldea", myRecord: "Mi registro", lowStimulation: "Baja estimulación", viewBoth: "← Ver ambas islas", selectIsland: "Elige una isla y luego un edificio",
    quietGardens: "Jardines tranquilos", momentumTrails: "Senderos activos", autismIsland: "Isla Autismo", adhdIsland: "Isla TDAH",
    resourcesLoading: "Cargando recursos…", resourcesChecking: "Consultando la base de datos", personalReady: "Tu registro personal está listo", personalMatch: "JA lo usa solo para mejorar las coincidencias", view: "Ver", refresh: "Actualizar",
    jaGuide: "JA · Guía de IA", jaReady: "Estoy aquí cuando quieras.",
    settingsTitle: "Centro de ajustes", settingsEyebrow: "Haz que la aldea se adapte a ti", settingsIntro: "Estas preferencias se guardan en este dispositivo y se aplican inmediatamente.",
    textSize: "Tamaño del texto", smaller: "Pequeño", standard: "Estándar", larger: "Grande", extraLarge: "Muy grande", colorPalette: "Paleta de colores", calmSage: "Verde salvia", softBlue: "Azul suave", warmPlum: "Ciruela cálida", highContrast: "Alto contraste",
    language: "Idioma", motion: "Movimiento y detalle visual", useLow: "Usar vista de baja estimulación", useStandard: "Usar vista estándar", settingsSaved: "Ajustes guardados y aplicados.", previewTitle: "Vista previa", previewText: "Este texto cambia con el tamaño, color e idioma elegidos.",
    support: "Apoyo", settings: "Ajustes", education: "Educación", legal: "Legal", activities: "Actividades",
    supportTitle: "Apoyo y contacto", supportEyebrow: "Un próximo paso más tranquilo", prepare: "Pequeñas formas de prepararse",
    activityTitle: "Voluntariado y actividades", activityEyebrow: "Cosas que podemos hacer juntos", activityIntro: "Próximas actividades comunitarias. Solo los editores del proyecto pueden cambiarlas.",
    aiEyebrow: "JA · Recursos personalizados", aiHello: "Hola, soy JA.", aiExplain: "Usaré tu registro, el tema y la base de recursos; nunca inventaré enlaces.", aiQuestion: "¿Qué estás buscando?", aiFind: "Buscar recursos", aiChecking: "JA está buscando recursos…", aiDisclaimer: "JA orienta sobre recursos; no ofrece consejo médico ni legal. Confirma requisitos, costo y disponibilidad.",
    recordTitle: "Mi registro personal", recordIntro: "Este registro ayuda a JA a elegir recursos más relevantes.", recentSearches: "Búsquedas recientes", noSearches: "Aún no hay búsquedas.", feedbackLabel: "Comentarios para el equipo", feedbackSave: "Guardar comentarios", logout: "Cerrar sesión",
    sheetConnected: "Sincronización con Google Sheets conectada", sheetMissing: "La sincronización con Google Sheets aún no está conectada"
  }
};

function t(key) {
  const language = state.settings.language || "en";
  return i18n[language]?.[key] || i18n.en[key] || key;
}

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
    const { user, sync } = await api(`/api/auth/${state.authMode}`, { method: "POST", body: JSON.stringify(payload) });
    state.user = user;
    if (sync) state.sheetSync = { configured: sync.synced || state.sheetSync.configured, ...sync };
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
    state.sheetSync = { configured: sync.synced || state.sheetSync.configured, ...sync };
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
  const buildingLabel = (building) => building.type === "ai" ? t(building.topic === "Legal" ? "legal" : "education") : t(building.type === "activity" ? "activities" : building.type);
  layer.innerHTML = config.buildings.map((building) => `
    <button class="building" type="button" style="left:${building.x}%;top:${building.y}%" data-building="${escapeHtml(building.id)}" data-island="${building.island}" data-type="${building.type}" data-label="${escapeHtml(buildingLabel(building))}" aria-label="${escapeHtml(buildingLabel(building))} · ${building.island === "autism" ? t("autismIsland") : t("adhdIsland")}">
      <span class="building-icon" aria-hidden="true">${escapeHtml(building.icon)}</span>
    </button>`).join("");
}

function selectIsland(island) {
  state.selectedIsland = island;
  const stage = $("#map-stage");
  stage.classList.remove("focus-autism", "focus-adhd");
  stage.classList.add(`focus-${island}`);
  $("#reset-map").classList.remove("hidden");
  $(".map-hint").textContent = `${t("selectIsland")} · ${island === "autism" ? t("autismIsland") : t("adhdIsland")}`;
}

function resetMap() {
  state.selectedIsland = null;
  $("#map-stage").classList.remove("focus-autism", "focus-adhd");
  $("#reset-map").classList.add("hidden");
  $(".map-hint").innerHTML = `<span aria-hidden="true">↖</span> ${escapeHtml(t("selectIsland"))}`;
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
    title: t("supportTitle"),
    eyebrow: t("supportEyebrow"),
    html: `<p class="panel-intro">${escapeHtml(config.support.intro)}</p>
      <div class="card-list">${config.support.contacts.map((contact) => `<article class="info-card"><div><h3>${escapeHtml(contact.title)}</h3><p>${escapeHtml(contact.detail)}</p></div><a href="${escapeHtml(contact.href)}" target="${contact.href.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">${escapeHtml(contact.action)} →</a></article>`).join("")}</div>
      <h3>${escapeHtml(t("prepare"))}</h3><ul class="gentle-list">${config.support.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>
      <p class="privacy-note">Edit all contact cards in <code>public/site-config.js</code>.</p>`
  });
}

function settingsPanel() {
  const current = state.settings;
  openPanel({
    title: t("settingsTitle"),
    eyebrow: t("settingsEyebrow"),
    html: `<p class="panel-intro">${escapeHtml(t("settingsIntro"))}</p>
      <div class="settings-preview" aria-live="polite"><strong>${escapeHtml(t("previewTitle"))}</strong><span>${escapeHtml(t("previewText"))}</span></div>
      <div class="setting-group"><strong>${escapeHtml(t("textSize"))}</strong><div class="setting-options">
        ${[["small",t("smaller")],["normal",t("standard")],["large",t("larger")],["xlarge",t("extraLarge")]].map(([value,label]) => `<button type="button" aria-pressed="${String((current.fontSize || "normal") === value)}" class="setting-option ${(current.fontSize || "normal") === value ? "active" : ""}" data-setting="fontSize" data-value="${value}">${escapeHtml(label)}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>${escapeHtml(t("colorPalette"))}</strong><div class="setting-options">
        ${[["sage","#4e856d",t("calmSage")],["blue","#517c97",t("softBlue")],["plum","#796683",t("warmPlum")],["high","#111",t("highContrast")]].map(([value,color,label]) => `<button type="button" aria-pressed="${String((current.theme || "sage") === value)}" class="setting-option ${(current.theme || "sage") === value ? "active" : ""}" data-setting="theme" data-value="${value}"><span class="color-dot" style="background:${color}"></span>${escapeHtml(label)}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>${escapeHtml(t("language"))}</strong><div class="setting-options">
        ${[["en","English"],["zh","中文"],["es","Español"]].map(([value,label]) => `<button type="button" aria-pressed="${String((current.language || "en") === value)}" class="setting-option ${(current.language || "en") === value ? "active" : ""}" data-setting="language" data-value="${value}">${label}</button>`).join("")}
      </div></div>
      <div class="setting-group"><strong>${escapeHtml(t("motion"))}</strong><button type="button" class="secondary-button" data-action="toggle-calm">${escapeHtml(document.body.classList.contains("low-stimulation") ? t("useStandard") : t("useLow"))}</button></div>`
  });
}

function activitiesPanel() {
  openPanel({
    title: t("activityTitle"),
    eyebrow: t("activityEyebrow"),
    html: `<p class="panel-intro">${escapeHtml(t("activityIntro"))}</p>
      <div class="card-list">${config.activities.map((activity) => `<article class="activity-card"><div class="date-badge">${escapeHtml(activity.date)}</div><div><small>${escapeHtml(activity.meta)}</small><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.description)}</p></div></article>`).join("")}</div>
      <p class="privacy-note">Edit activities in <code>public/site-config.js</code>; users have no editing controls.</p>`
  });
}

function aiPanel(topic = "Education") {
  state.currentTopic = topic;
  const examples = topic === "Legal" ? "For example: I need help understanding a 504 plan for an 11-year-old…" : "For example: I’m looking for executive-function support for a middle-school student…";
  openPanel({
    title: `${t(topic === "Legal" ? "legal" : "education")} · JA`,
    eyebrow: t("aiEyebrow"),
    html: `<div class="ai-shell">
      <div class="mori-stage"><div class="mori-character" id="mori-character"><span class="capy-ear left"></span><span class="capy-ear right"></span><span class="capy-eye left"></span><span class="capy-eye right"></span><span class="capy-nose"></span></div><div><h3>${escapeHtml(t("aiHello"))}</h3><p>${escapeHtml(t("aiExplain"))}</p></div></div>
      <form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}"></textarea></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form>
      <div id="ai-results"></div>
      <p class="privacy-note">${escapeHtml(t("aiDisclaimer"))}</p>
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
  button.textContent = t("aiChecking");
  character?.classList.add("thinking");
  $("#ai-error").textContent = "";
  try {
    const data = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify({ topic: state.currentTopic, description }) });
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    character?.classList.remove("thinking");
    character?.classList.add("celebrate");
    setTimeout(() => character?.classList.remove("celebrate"), 1500);
    $("#ai-results").innerHTML = `<div class="ai-response">${escapeHtml(data.answer)}</div><div class="card-list">${data.resources.map(resourceCard).join("")}</div><p class="privacy-note">Database source: ${escapeHtml(data.source)} · ${data.ai ? "AI-assisted explanation" : "Rule-based demo mode"}</p>`;
  } catch (error) {
    $("#ai-error").textContent = error.message;
    character?.classList.remove("thinking");
  } finally {
    button.disabled = false;
    button.innerHTML = `${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span>`;
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
    title: t("recordTitle"),
    eyebrow: state.user?.name || "Village visitor",
    html: `<p class="panel-intro">${escapeHtml(t("recordIntro"))}</p>
      <div class="sync-badge ${state.sheetSync.configured ? "connected" : "missing"}">${escapeHtml(state.sheetSync.configured ? t("sheetConnected") : t("sheetMissing"))}</div>
      <div class="record-summary">${escapeHtml(profile?.summary || "Complete the Community Compass to create your record.")}</div>
      <div class="card-list"><article class="record-card"><strong>${escapeHtml(t("recentSearches"))}</strong><ul class="gentle-list">${history.length ? history.slice(-5).reverse().map((item) => `<li><strong>${escapeHtml(item.topic)}</strong> · ${escapeHtml(item.description)}</li>`).join("") : `<li>${escapeHtml(t("noSearches"))}</li>`}</ul></article></div>
      <form id="feedback-form" class="feedback-form"><label>${escapeHtml(t("feedbackLabel"))}<textarea name="feedback" rows="4" placeholder="What felt helpful or confusing?"></textarea></label><button class="secondary-button" type="submit">${escapeHtml(t("feedbackSave"))}</button><p id="feedback-status" role="status"></p></form>
      <button class="text-button" data-action="logout">${escapeHtml(t("logout"))}</button>`
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
  state.settings = { fontSize: "normal", theme: "sage", language: "en", calm: false, ...state.settings };
  const { fontSize, theme, language, calm } = state.settings;
  const scales = { small: ".9", normal: "1", large: "1.12", xlarge: "1.25" };
  document.documentElement.style.setProperty("--font-scale", scales[fontSize] || "1");
  document.body.classList.remove("theme-sage", "theme-blue", "theme-plum", "theme-high");
  document.body.classList.add(`theme-${theme}`);
  document.body.dataset.fontSize = fontSize;
  document.body.classList.toggle("low-stimulation", Boolean(calm));
  $("#calm-toggle")?.setAttribute("aria-pressed", String(Boolean(calm)));
  const dictionary = i18n[language] || i18n.en;
  $$('[data-i18n]').forEach((element) => { element.textContent = dictionary[element.dataset.i18n] || i18n.en[element.dataset.i18n]; });
  document.documentElement.lang = language;
  if ($("#building-layer")) renderBuildings();
  if ($(".map-hint") && !state.selectedIsland) $(".map-hint").innerHTML = `<span aria-hidden="true">↖</span> ${escapeHtml(t("selectIsland"))}`;
  localStorage.setItem("capy-settings", JSON.stringify(state.settings));
}

function updateSetting(key, value) {
  state.settings[key] = value;
  applySettings();
  settingsPanel();
  toast(t("settingsSaved"));
}

function toggleCalm() {
  state.settings.calm = !state.settings.calm;
  applySettings();
  toast(t("settingsSaved"));
  if ($("#panel").classList.contains("open") && $("#panel-content [data-setting]")) settingsPanel();
}

async function loadIntegrationStatus() {
  try {
    const health = await api("/api/health");
    state.sheetSync = { configured: Boolean(health.userSheetConfigured) };
  } catch {
    state.sheetSync = { configured: false };
  }
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
  loadIntegrationStatus();
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
    const data = await api("/api/feedback", { method: "POST", body: JSON.stringify({ feedback }) });
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
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
