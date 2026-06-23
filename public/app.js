import { EcosystemController } from "./ecosystem-runtime.mjs";

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
  settings: loadSavedSettings(),
  environment: null,
  environmentTimer: null,
  environmentRefreshTimer: null,
  audio: null,
  ecosystem: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const i18n = {
  en: {
    begin: "Where would you like to begin?", explore: "Explore at your own pace. There is no wrong door—and Waffles can help make any topic feel more manageable.", choosePath: "Choose your own path",
    village: "Village", myRecord: "My record", lowStimulation: "Low-stimulation", viewBoth: "← View both islands", selectIsland: "Select an island, then choose a building",
    quietGardens: "Quiet gardens", momentumTrails: "Momentum trails", autismIsland: "Autism Island", adhdIsland: "ADHD Island",
    resourcesLoading: "Loading resources…", resourcesChecking: "Checking the live database", personalReady: "Your personal record is ready", personalMatch: "Waffles uses it only to improve matching", view: "View", refresh: "Refresh",
    jaGuide: "Waffles · AI guide", jaReady: "I’m here when you’re ready.",
    settingsTitle: "Settings Studio", settingsEyebrow: "Make the village feel right", settingsIntro: "These preferences are saved on this device and applied immediately.",
    textSize: "Text size", smaller: "Smaller", standard: "Standard", larger: "Larger", extraLarge: "Extra large", colorPalette: "Color palette", calmSage: "Calm sage", softBlue: "Soft blue", warmPlum: "Warm plum", highContrast: "High contrast",
    language: "Language", motion: "Motion & visual detail", useLow: "Use low-stimulation view", useStandard: "Use standard view", settingsSaved: "Settings saved and applied.", previewTitle: "Live preview", previewText: "This text changes with your size, color, and language settings.", sound: "Village sound", soundOff: "Sound is off", soundOn: "Sound is on", enableSound: "Enable sound", muteSound: "Mute sound", masterVolume: "Master volume", environmentVolume: "Weather & environment", musicVolume: "Background music", animalVolume: "Animals", soundHint: "Weather stays prominent; music and individual animal calls remain gentler.",
    support: "Support", settings: "Settings", education: "Education", legal: "Legal", activities: "Activities",
    supportTitle: "Support & Contact", supportEyebrow: "A steadier next step", prepare: "Small ways to prepare",
    activityTitle: "Volunteer & Activity", activityEyebrow: "Things we can do together", activityIntro: "Upcoming community activities. Only project editors can change these listings.",
    aiEyebrow: "Waffles · Personalized resource matching", aiHello: "Hi, I’m Waffles.", aiExplain: "I’ll score tags first, then descriptions and issue conflicts, using your record and this building’s topic.", aiQuestion: "What are you trying to find?", aiFind: "Find fitting resources", aiChecking: "Waffles is checking the village…", aiDisclaimer: "Waffles provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.", resultCount: "Number of resources", scoreWhy: "Why this matched", expandedTerms: "Related terms used",
    recordTitle: "My personal record", recordIntro: "This record helps Waffles choose more relevant entries from the resource database.", recentSearches: "Recent resource searches", noSearches: "No searches yet.", feedbackLabel: "Feedback for the project team", feedbackSave: "Save feedback", logout: "Log out",
    sheetConnected: "Google Sheet sync connected", sheetMissing: "Google Sheet sync is not connected yet",
    environmentFinding: "Finding your local sky…", environmentUnavailable: "Local weather unavailable", approximateIp: "Approx. by IP · Open-Meteo",
    spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter",
    weatherClear: "Clear", weatherCloudy: "Cloudy", weatherFog: "Foggy", weatherRain: "Rain", weatherSnow: "Snow", weatherStorm: "Thunderstorm", weatherRefresh: "Refresh local weather"
  },
  zh: {
    begin: "你想从哪里开始？", explore: "按自己的节奏探索。没有走错的门——Waffles 会帮你把每个主题都变得更容易理解。", choosePath: "选择你自己的路径",
    village: "村庄", myRecord: "我的记录", lowStimulation: "低刺激模式", viewBoth: "← 查看两座岛", selectIsland: "先选择一座岛，再选择一栋建筑",
    quietGardens: "安静花园", momentumTrails: "活力小径", autismIsland: "自闭症岛", adhdIsland: "ADHD 岛",
    resourcesLoading: "正在加载资源…", resourcesChecking: "正在检查实时数据库", personalReady: "你的个人记录已准备好", personalMatch: "Waffles 只用它来改善资源匹配", view: "查看", refresh: "刷新",
    jaGuide: "Waffles · AI 向导", jaReady: "准备好时，我就在这里。",
    settingsTitle: "设置中心", settingsEyebrow: "让村庄更适合你", settingsIntro: "这些偏好会保存在本设备，并立即生效。",
    textSize: "文字大小", smaller: "较小", standard: "标准", larger: "较大", extraLarge: "超大", colorPalette: "颜色主题", calmSage: "宁静绿色", softBlue: "柔和蓝色", warmPlum: "温暖紫色", highContrast: "高对比度",
    language: "语言", motion: "动画与视觉细节", useLow: "使用低刺激模式", useStandard: "使用标准模式", settingsSaved: "设置已保存并生效。", previewTitle: "实时预览", previewText: "这段文字会跟随字体、颜色和语言设置变化。", sound: "村庄声音", soundOff: "声音已关闭", soundOn: "声音已开启", enableSound: "开启声音", muteSound: "静音", masterVolume: "总音量", environmentVolume: "天气与环境", musicVolume: "背景音乐", animalVolume: "动物", soundHint: "天气与环境声较明显，音乐和各类动物声保持轻柔。",
    support: "支持", settings: "设置", education: "教育", legal: "法律", activities: "活动",
    supportTitle: "支持与联系", supportEyebrow: "找到更稳妥的下一步", prepare: "可以先做的小准备",
    activityTitle: "志愿者与活动", activityEyebrow: "一起参与的事情", activityIntro: "即将开始的社区活动。只有项目管理员可以修改内容。",
    aiEyebrow: "Waffles · 个性化资源匹配", aiHello: "你好，我是 Waffles。", aiExplain: "我会先匹配标签，再检查描述与冲突项，并结合你的个人记录和建筑主题透明评分。", aiQuestion: "你正在寻找什么？", aiFind: "查找合适资源", aiChecking: "Waffles 正在查找村庄资源…", aiDisclaimer: "Waffles 提供资源导航，不构成医疗或法律建议。请向服务机构确认资格、费用与当前名额。", resultCount: "显示资源数量", scoreWhy: "匹配原因", expandedTerms: "使用的相关词",
    recordTitle: "我的个人记录", recordIntro: "这份记录帮助 Waffles 从数据库中选择更相关的资源。", recentSearches: "最近的资源搜索", noSearches: "还没有搜索记录。", feedbackLabel: "给项目团队的反馈", feedbackSave: "保存反馈", logout: "退出登录",
    sheetConnected: "Google Sheet 自动同步已连接", sheetMissing: "Google Sheet 自动同步尚未连接",
    environmentFinding: "正在寻找你当地的天空…", environmentUnavailable: "暂时无法获取当地天气", approximateIp: "IP 大致位置 · Open-Meteo",
    spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季",
    weatherClear: "晴朗", weatherCloudy: "多云", weatherFog: "有雾", weatherRain: "下雨", weatherSnow: "下雪", weatherStorm: "雷雨", weatherRefresh: "刷新当地天气"
  },
  es: {
    begin: "¿Por dónde te gustaría empezar?", explore: "Explora a tu propio ritmo. No hay una puerta equivocada; Waffles puede hacer que cada tema sea más manejable.", choosePath: "Elige tu propio camino",
    village: "Aldea", myRecord: "Mi registro", lowStimulation: "Baja estimulación", viewBoth: "← Ver ambas islas", selectIsland: "Elige una isla y luego un edificio",
    quietGardens: "Jardines tranquilos", momentumTrails: "Senderos activos", autismIsland: "Isla Autismo", adhdIsland: "Isla TDAH",
    resourcesLoading: "Cargando recursos…", resourcesChecking: "Consultando la base de datos", personalReady: "Tu registro personal está listo", personalMatch: "Waffles lo usa solo para mejorar las coincidencias", view: "Ver", refresh: "Actualizar",
    jaGuide: "Waffles · Guía de IA", jaReady: "Estoy aquí cuando quieras.",
    settingsTitle: "Centro de ajustes", settingsEyebrow: "Haz que la aldea se adapte a ti", settingsIntro: "Estas preferencias se guardan en este dispositivo y se aplican inmediatamente.",
    textSize: "Tamaño del texto", smaller: "Pequeño", standard: "Estándar", larger: "Grande", extraLarge: "Muy grande", colorPalette: "Paleta de colores", calmSage: "Verde salvia", softBlue: "Azul suave", warmPlum: "Ciruela cálida", highContrast: "Alto contraste",
    language: "Idioma", motion: "Movimiento y detalle visual", useLow: "Usar vista de baja estimulación", useStandard: "Usar vista estándar", settingsSaved: "Ajustes guardados y aplicados.", previewTitle: "Vista previa", previewText: "Este texto cambia con el tamaño, color e idioma elegidos.", sound: "Sonido de la aldea", soundOff: "Sonido apagado", soundOn: "Sonido activado", enableSound: "Activar sonido", muteSound: "Silenciar", masterVolume: "Volumen general", environmentVolume: "Clima y ambiente", musicVolume: "Música de fondo", animalVolume: "Animales", soundHint: "El clima queda presente; la música y los animales se mantienen suaves.",
    support: "Apoyo", settings: "Ajustes", education: "Educación", legal: "Legal", activities: "Actividades",
    supportTitle: "Apoyo y contacto", supportEyebrow: "Un próximo paso más tranquilo", prepare: "Pequeñas formas de prepararse",
    activityTitle: "Voluntariado y actividades", activityEyebrow: "Cosas que podemos hacer juntos", activityIntro: "Próximas actividades comunitarias. Solo los editores del proyecto pueden cambiarlas.",
    aiEyebrow: "Waffles · Recursos personalizados", aiHello: "Hola, soy Waffles.", aiExplain: "Puntuaré primero las etiquetas y después la descripción y los posibles conflictos.", aiQuestion: "¿Qué estás buscando?", aiFind: "Buscar recursos", aiChecking: "Waffles está buscando recursos…", aiDisclaimer: "Waffles orienta sobre recursos; no ofrece consejo médico ni legal. Confirma requisitos, costo y disponibilidad.", resultCount: "Cantidad de recursos", scoreWhy: "Por qué coincide", expandedTerms: "Términos relacionados usados",
    recordTitle: "Mi registro personal", recordIntro: "Este registro ayuda a Waffles a elegir recursos más relevantes.", recentSearches: "Búsquedas recientes", noSearches: "Aún no hay búsquedas.", feedbackLabel: "Comentarios para el equipo", feedbackSave: "Guardar comentarios", logout: "Cerrar sesión",
    sheetConnected: "Sincronización con Google Sheets conectada", sheetMissing: "La sincronización con Google Sheets aún no está conectada",
    environmentFinding: "Buscando tu cielo local…", environmentUnavailable: "Clima local no disponible", approximateIp: "Ubicación aproximada por IP · Open-Meteo",
    spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno",
    weatherClear: "Despejado", weatherCloudy: "Nublado", weatherFog: "Niebla", weatherRain: "Lluvia", weatherSnow: "Nieve", weatherStorm: "Tormenta", weatherRefresh: "Actualizar el clima local"
  }
};

class VillageAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.environmentGain = null;
    this.musicGain = null;
    this.animalGain = null;
    this.environmentNodes = [];
    this.musicNodes = [];
    this.musicTimer = null;
    this.animalTimer = null;
    this.weather = "clear";
    this.isDay = true;
    this.buffers = new Map();
    this.bufferPromise = null;
  }

  createNoiseBuffer() {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * .965 + white * .035;
      data[index] = last * 3.2;
    }
    return buffer;
  }

  async enable() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.environmentGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.animalGain = this.context.createGain();
      this.environmentGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.animalGain.connect(this.master);
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
    await this.context.resume();
    await this.loadBuffers();
    this.restartEnvironment();
    this.restartMusic();
    this.scheduleAnimal();
    this.applySettings();
  }

  async loadBuffers() {
    if (this.bufferPromise) return this.bufferPromise;
    const sampleEntries = Object.entries(config.ecosystem?.audio?.samples || {}).map(([key, item]) => [key, item.src]);
    const musicEntries = Object.entries(config.ecosystem?.audio?.music || {}).filter(([, url]) => url).map(([key, url]) => [`music-${key}`, url]);
    this.bufferPromise = Promise.allSettled([...sampleEntries, ...musicEntries].map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio ${key} returned ${response.status}`);
      this.buffers.set(key, await this.context.decodeAudioData(await response.arrayBuffer()));
    }));
    return this.bufferPromise;
  }

  stopEnvironment() {
    this.environmentNodes.forEach((node) => { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} });
    this.environmentNodes = [];
  }

  restartEnvironment() {
    if (!this.context || this.context.state !== "running") return;
    this.stopEnvironment();
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const texture = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const presets = {
      clear: ["lowpass", 540, .035], cloudy: ["lowpass", 420, .055], fog: ["lowpass", 260, .075],
      rain: ["highpass", 850, .2], snow: ["lowpass", 320, .035], storm: ["bandpass", 480, .28]
    };
    const [type, frequency, level] = presets[this.weather] || presets.clear;
    filter.type = type;
    filter.frequency.value = frequency;
    texture.gain.value = level;
    source.connect(filter).connect(texture).connect(this.environmentGain);
    source.start();
    this.environmentNodes.push(source, filter, texture);
    if (this.weather === "storm") {
      const rumble = this.context.createOscillator();
      const rumbleGain = this.context.createGain();
      rumble.type = "sine";
      rumble.frequency.value = 42;
      rumbleGain.gain.value = .035;
      rumble.connect(rumbleGain).connect(this.environmentGain);
      rumble.start();
      this.environmentNodes.push(rumble, rumbleGain);
    }
  }

  playBuffer(buffer, destination, volume = .3, maximumDuration = null) {
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(destination);
    source.start(0, 0, maximumDuration || buffer.duration);
    return true;
  }

  chirp(frequencies, { type = "sine", level = .025, duration = .28, gap = .13 } = {}) {
    const now = this.context.currentTime;
    frequencies.forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + index * gap;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 1.06), start + duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(level, start + .035);
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain).connect(this.animalGain);
      oscillator.start(start);
      oscillator.stop(start + duration + .02);
    });
  }

  noiseGesture({ frequency = 700, level = .04, duration = .55, type = "bandpass" } = {}) {
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, frequency * .38), now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + .06);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.animalGain);
    source.start(now);
    source.stop(now + duration + .03);
  }

  synthesizeSpecies(species) {
    const profiles = {
      rabbit: () => this.chirp([890, 1120], { level: .012, duration: .16, gap: .1 }),
      fox: () => { this.noiseGesture({ frequency: 1050, level: .022, duration: .22 }); this.chirp([310], { type: "triangle", level: .02, duration: .24 }); },
      bird: () => this.chirp([1320, 1680, 1510], { level: .014, duration: .16, gap: .11 }),
      villager: () => this.chirp([92, 82], { type: "sine", level: .012, duration: .12, gap: .24 }),
      dragon: () => this.noiseGesture({ frequency: 1800, level: .11, duration: 1.8, type: "highpass" }),
      capybara: () => this.chirp([420, 560, 470], { type: "triangle", level: .026, duration: .2, gap: .14 }),
      cow: () => this.chirp([105, 92], { type: "sawtooth", level: .012, duration: .6, gap: .22 }),
      sheep: () => this.chirp([390, 330], { type: "triangle", level: .018, duration: .34, gap: .17 }),
      deer: () => this.chirp([220, 180], { type: "sine", level: .016, duration: .42, gap: .18 }),
      gull: () => this.chirp([720, 610, 760], { type: "triangle", level: .016, duration: .2, gap: .14 })
    };
    (profiles[species] || profiles.bird)();
  }

  playAnimal(species) {
    if (!this.context || this.context.state !== "running" || !state.settings.soundEnabled) return;
    const sample = config.ecosystem?.audio?.samples?.[species];
    if (sample && this.playBuffer(this.buffers.get(species), this.animalGain, Number(sample.volume || .3), species === "gull" ? 5.8 : null)) return;
    this.synthesizeSpecies(species);
  }

  animalCall() {
    const species = state.ecosystem?.audibleSpecies(state.selectedIsland) || ["bird"];
    if (!species.length) return;
    this.playAnimal(species[Math.floor(Math.random() * species.length)]);
  }

  scheduleAnimal() {
    clearTimeout(this.animalTimer);
    if (!state.settings.soundEnabled) return;
    this.animalTimer = setTimeout(() => {
      this.animalCall();
      this.scheduleAnimal();
    }, 9000 + Math.random() * 9000);
  }

  setWeather(kind) {
    if (kind === this.weather) return;
    this.weather = kind;
    this.restartEnvironment();
  }

  stopMusic() {
    clearTimeout(this.musicTimer);
    this.musicTimer = null;
    this.musicNodes.forEach((node) => { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} });
    this.musicNodes = [];
  }

  proceduralMusicPhrase() {
    if (!this.context || this.context.state !== "running" || !state.settings.soundEnabled) return;
    const now = this.context.currentTime;
    const scale = this.isDay ? [261.63, 329.63, 392, 523.25] : [196, 246.94, 293.66, 392];
    scale.forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const start = now + index * 1.18;
      oscillator.type = this.isDay ? "sine" : "triangle";
      oscillator.frequency.value = frequency * (index === 3 ? .5 : 1);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(this.isDay ? .022 : .014, start + .18);
      gain.gain.exponentialRampToValueAtTime(.0001, start + 1.8);
      oscillator.connect(gain).connect(this.musicGain);
      oscillator.start(start);
      oscillator.stop(start + 1.85);
      this.musicNodes.push(oscillator, gain);
    });
    this.musicTimer = setTimeout(() => this.proceduralMusicPhrase(), this.isDay ? 7200 : 8800);
  }

  restartMusic() {
    if (!this.context || this.context.state !== "running") return;
    this.stopMusic();
    const key = `music-${this.isDay ? "day" : "night"}`;
    const buffer = this.buffers.get(key);
    if (buffer) {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.musicGain);
      source.start();
      this.musicNodes.push(source);
      return;
    }
    this.proceduralMusicPhrase();
  }

  setDay(isDay) {
    const next = Boolean(isDay);
    if (next === this.isDay) return;
    this.isDay = next;
    this.restartMusic();
  }

  applySettings() {
    if (!this.context) return;
    const enabled = Boolean(state.settings.soundEnabled);
    const calmScale = state.settings.calm ? .55 : 1;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(enabled ? Number(state.settings.masterVolume ?? .35) : 0, now, .08);
    this.environmentGain.gain.setTargetAtTime(Number(state.settings.environmentVolume ?? .65) * calmScale, now, .08);
    this.musicGain.gain.setTargetAtTime(Number(state.settings.musicVolume ?? .26) * calmScale, now, .08);
    this.animalGain.gain.setTargetAtTime(Number(state.settings.animalVolume ?? .22) * calmScale, now, .08);
    if (!enabled) { clearTimeout(this.animalTimer); this.stopMusic(); }
    else { this.scheduleAnimal(); if (!this.musicTimer && !this.musicNodes.length) this.restartMusic(); }
  }
}

state.audio = new VillageAudio();
state.ecosystem = new EcosystemController({
  config: config.ecosystem,
  stage: $("#map-stage"),
  creatureLayer: $("#creature-layer"),
  skyLayer: $("#sky-creature-layer"),
  onSound: (species) => state.audio?.playAnimal(species)
});

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
  state.audio?.scheduleAnimal();
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
      <div class="setting-group"><strong>${escapeHtml(t("motion"))}</strong><button type="button" class="secondary-button" data-action="toggle-calm">${escapeHtml(document.body.classList.contains("low-stimulation") ? t("useStandard") : t("useLow"))}</button></div>
      <div class="setting-group sound-settings"><div class="sound-heading"><strong>${escapeHtml(t("sound"))}</strong><span class="sound-status">${escapeHtml(current.soundEnabled ? t("soundOn") : t("soundOff"))}</span></div>
        <button type="button" class="secondary-button sound-toggle" data-action="toggle-sound">${escapeHtml(current.soundEnabled ? t("muteSound") : t("enableSound"))}</button>
        ${[["masterVolume",t("masterVolume"),current.masterVolume ?? .35],["environmentVolume",t("environmentVolume"),current.environmentVolume ?? .65],["musicVolume",t("musicVolume"),current.musicVolume ?? .26],["animalVolume",t("animalVolume"),current.animalVolume ?? .22]].map(([key,label,value]) => `<label class="volume-control"><span>${escapeHtml(label)}</span><output>${Math.round(Number(value) * 100)}%</output><input type="range" min="0" max="1" step="0.01" value="${Number(value)}" data-volume="${key}" aria-label="${escapeHtml(label)}" /></label>`).join("")}
        <small>${escapeHtml(t("soundHint"))}</small>
      </div>`
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
    title: `${t(topic === "Legal" ? "legal" : "education")} · Waffles`,
    eyebrow: t("aiEyebrow"),
    html: `<div class="ai-shell">
      <div class="mori-stage"><div class="mori-character" id="mori-character"><span class="capy-ear left"></span><span class="capy-ear right"></span><span class="capy-eye left"></span><span class="capy-eye right"></span><span class="capy-nose"></span></div><div><h3>${escapeHtml(t("aiHello"))}</h3><p>${escapeHtml(t("aiExplain"))}</p></div></div>
      <form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}"></textarea></label><label class="result-count">${escapeHtml(t("resultCount"))}<select name="count">${[3,4,5,6,7,8,9,10].map((value) => `<option value="${value}" ${value === Number(state.settings.resourceCount || 5) ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form>
      <div id="ai-results"></div>
      <p class="privacy-note">${escapeHtml(t("aiDisclaimer"))}</p>
    </div>`
  });
}

async function submitAi(event) {
  event.preventDefault();
  const formElement = event.target;
  const formData = new FormData(formElement);
  const description = formData.get("description");
  const count = Number(formData.get("count") || 5);
  state.settings.resourceCount = count;
  localStorage.setItem("capy-settings", JSON.stringify(state.settings));
  const button = formElement.querySelector("button[type='submit']");
  const character = $("#mori-character");
  button.disabled = true;
  button.textContent = t("aiChecking");
  character?.classList.add("thinking");
  $("#ai-error").textContent = "";
  try {
    const data = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify({ topic: state.currentTopic, description, count }) });
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    character?.classList.remove("thinking");
    character?.classList.add("celebrate");
    state.audio?.playAnimal("capybara");
    setTimeout(() => character?.classList.remove("celebrate"), 1500);
    const expanded = data.keywordExpansion?.suggested || [];
    $("#ai-results").innerHTML = `<div class="ai-response">${escapeHtml(data.answer)}</div>${expanded.length ? `<p class="keyword-expansion"><strong>${escapeHtml(t("expandedTerms"))}:</strong> ${expanded.map(escapeHtml).join(" · ")}</p>` : ""}<div class="card-list">${data.resources.map(resourceCard).join("")}</div><p class="privacy-note">Database source: ${escapeHtml(data.source)} · scoring v${escapeHtml(data.scoring?.version || "1.0")} · ${data.keywordExpansion?.ai ? "AI-expanded keywords" : "local synonym expansion"}</p>`;
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
  const reasons = resource.explanation || [];
  return `<article class="resource-card"><div class="resource-heading"><h3>${escapeHtml(resource.name)}</h3><span class="score-badge">${escapeHtml(String(resource.score ?? 0))} pts</span></div><p>${escapeHtml(resource.description)}</p><div class="resource-meta"><span>${escapeHtml(resource.age || "All ages")}</span><span>${escapeHtml(resource.location || "See website")}</span><span>${escapeHtml(resource.price || "See website")}</span>${categories.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>${reasons.length ? `<details class="score-details"><summary>${escapeHtml(t("scoreWhy"))}</summary><ul>${reasons.map((reason) => `<li><b class="${reason.points < 0 ? "negative" : "positive"}">${reason.points > 0 ? "+" : ""}${escapeHtml(String(reason.points))}</b> ${escapeHtml(reason.label)} · “${escapeHtml(reason.keyword)}”</li>`).join("")}</ul></details>` : ""}<a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">Visit resource ↗</a></article>`;
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
  state.settings = { fontSize: "normal", theme: "sage", language: "en", calm: false, soundEnabled: false, masterVolume: .35, environmentVolume: .65, musicVolume: .26, animalVolume: .22, resourceCount: 5, ...state.settings };
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
  renderEnvironmentStatus();
  state.ecosystem?.setCalm(calm);
  state.audio?.applySettings();
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

async function toggleSound() {
  state.settings.soundEnabled = !state.settings.soundEnabled;
  if (state.settings.soundEnabled) {
    try { await state.audio.enable(); } catch { state.settings.soundEnabled = false; toast("Audio is not available in this browser."); }
  }
  applySettings();
  settingsPanel();
  toast(state.settings.soundEnabled ? t("soundOn") : t("soundOff"));
}

function updateVolume(input) {
  const value = Math.max(0, Math.min(1, Number(input.value)));
  state.settings[input.dataset.volume] = value;
  input.closest("label")?.querySelector("output")?.replaceChildren(`${Math.round(value * 100)}%`);
  state.audio?.applySettings();
  localStorage.setItem("capy-settings", JSON.stringify(state.settings));
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

const WEATHER_ICONS = { clear: "☀", cloudy: "☁", fog: "≋", rain: "☂", snow: "❄", storm: "ϟ" };

function weatherKind(code) {
  if ([95, 96, 99].includes(code)) return "storm";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([45, 48].includes(code)) return "fog";
  if ([1, 2, 3].includes(code)) return "cloudy";
  return "clear";
}

function seasonFor(month, hemisphere = "north") {
  const shifted = hemisphere === "south" ? ((month + 5) % 12) + 1 : month;
  if (shifted >= 3 && shifted <= 5) return "spring";
  if (shifted >= 6 && shifted <= 8) return "summer";
  if (shifted >= 9 && shifted <= 11) return "autumn";
  return "winter";
}

function zonedParts(timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function minutesFromIso(value, fallback) {
  const match = String(value || "").match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function localFallbackEnvironment() {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = zonedParts(timezone);
  const hour = Number(parts.hour);
  return {
    available: false,
    location: { city: "", region: "", country: "", timezone, approximate: true },
    hemisphere: "north",
    current: { isDay: hour >= 6 && hour < 18, weatherCode: 0, cloudCover: 0, temperature: null },
    sun: { sunrise: "2000-01-01T06:00", sunset: "2000-01-01T18:00" },
    source: "Device time"
  };
}

function renderEnvironmentStatus() {
  const environment = state.environment;
  const summary = $("#environment-summary");
  const detail = $("#environment-detail");
  const icon = $("#environment-icon");
  if (!environment || !summary || !detail || !icon) return;

  const timezone = environment.location?.timezone || "UTC";
  const localTime = new Intl.DateTimeFormat(state.settings.language || "en", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
  const location = [environment.location?.city, environment.location?.region].filter(Boolean).join(", ");
  const season = environment.season || "summer";
  const kind = environment.weatherKind || "clear";
  icon.textContent = WEATHER_ICONS[kind];
  summary.textContent = environment.available
    ? `${t(`weather${kind.charAt(0).toUpperCase() + kind.slice(1)}`)} · ${Math.round(environment.current.temperature)}°C`
    : t("environmentUnavailable");
  detail.textContent = [location, t(season), localTime, environment.available ? t("approximateIp") : ""].filter(Boolean).join(" · ");
  $("#environment-status").title = environment.available ? t("approximateIp") : t("environmentUnavailable");
  $("#environment-status button")?.setAttribute("aria-label", t("weatherRefresh"));
}

function updateCelestialScene() {
  const environment = state.environment;
  const stage = $("#map-stage");
  if (!environment || !stage) return;
  const parts = zonedParts(environment.location?.timezone || "UTC");
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
  const sunrise = minutesFromIso(environment.sun?.sunrise, 360);
  const sunset = minutesFromIso(environment.sun?.sunset, 1080);
  const isDay = currentMinutes >= sunrise && currentMinutes <= sunset;
  let sunX = 50;
  let sunY = 18;
  let moonX = 50;
  let moonY = 18;

  if (isDay) {
    const progress = Math.max(0, Math.min(1, (currentMinutes - sunrise) / Math.max(1, sunset - sunrise)));
    sunX = 7 + progress * 86;
    sunY = 76 - Math.sin(Math.PI * progress) * 61;
  } else {
    const nightLength = 1440 - sunset + sunrise;
    const elapsed = currentMinutes >= sunset ? currentMinutes - sunset : 1440 - sunset + currentMinutes;
    const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, nightLength)));
    moonX = 7 + progress * 86;
    moonY = 75 - Math.sin(Math.PI * progress) * 59;
  }

  stage.classList.toggle("time-day", isDay);
  stage.classList.toggle("time-night", !isDay);
  $("#environment-status")?.classList.toggle("night", !isDay);
  stage.style.setProperty("--celestial-x", `${sunX}%`);
  stage.style.setProperty("--celestial-y", `${sunY}%`);
  stage.style.setProperty("--moon-x", `${moonX}%`);
  stage.style.setProperty("--moon-y", `${moonY}%`);
  stage.style.setProperty("--sun-visible", isDay ? "1" : "0");
  stage.style.setProperty("--moon-visible", isDay ? "0" : ".9");
  stage.style.setProperty("--night-strength", isDay ? ".03" : ".72");
  stage.style.setProperty("--star-opacity", isDay ? "0" : ".92");
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const locationSeed = [environment.location?.city, environment.location?.region, environment.location?.country, environment.location?.timezone].filter(Boolean).join("|") || "village";
  state.ecosystem?.setClock({ isDay, currentMinutes, sunrise, sunset, localDate, locationSeed });
  state.audio?.setDay(isDay);
  renderEnvironmentStatus();
}

function applyEnvironment(environment, available = true) {
  const stage = $("#map-stage");
  if (!stage) return;
  const parts = zonedParts(environment.location?.timezone || "UTC");
  const season = seasonFor(Number(parts.month), environment.hemisphere);
  const kind = weatherKind(Number(environment.current?.weatherCode || 0));
  state.environment = { ...environment, available, season, weatherKind: kind };
  stage.classList.remove("season-spring", "season-summer", "season-autumn", "season-winter", "weather-clear", "weather-cloudy", "weather-fog", "weather-rain", "weather-snow", "weather-storm");
  stage.classList.add(`season-${season}`, `weather-${kind}`);
  stage.style.setProperty("--cloud-strength", String(Math.max(.15, Math.min(1, Number(environment.current?.cloudCover || 0) / 100))));
  state.audio?.setWeather(kind);
  state.ecosystem?.setWeather(kind);
  updateCelestialScene();
  clearInterval(state.environmentTimer);
  state.environmentTimer = setInterval(updateCelestialScene, 60_000);
}

async function loadEnvironment(force = false) {
  const status = $("#environment-status");
  status?.classList.add("loading");
  if (!state.environment && $("#environment-summary")) $("#environment-summary").textContent = t("environmentFinding");
  try {
    const environment = await api(`/api/environment${force ? "?refresh=1" : ""}`);
    applyEnvironment(environment, true);
    if (force) toast(t("approximateIp"));
  } catch {
    applyEnvironment(localFallbackEnvironment(), false);
  } finally {
    status?.classList.remove("loading");
    clearTimeout(state.environmentRefreshTimer);
    state.environmentRefreshTimer = setTimeout(() => loadEnvironment(false), 10 * 60_000);
  }
}

function hydrateApp() {
  $("#avatar-initial").textContent = (state.user?.name || "C").charAt(0).toUpperCase();
  $("#map-image").src = config.map.image;
  $("#original-survey-link").href = config.survey.url.replace("?embedded=true", "");
  renderBuildings();
  state.ecosystem?.init();
  applySettings();
  loadIntegrationStatus();
  loadResources();
  loadEnvironment();
}

async function logout() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  state.user = null;
  clearInterval(state.environmentTimer);
  clearTimeout(state.environmentRefreshTimer);
  state.ecosystem?.destroy();
  state.audio?.context?.suspend().catch(() => {});
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
  if (action === "toggle-sound") toggleSound();
  if (action === "refresh-resources") loadResources(true);
  if (action === "refresh-environment") loadEnvironment(true);
});

document.addEventListener("input", (event) => {
  const volume = event.target.closest("[data-volume]");
  if (volume) updateVolume(volume);
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
