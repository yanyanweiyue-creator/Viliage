import { EcosystemController } from "./ecosystem-runtime.mjs?v=land-map-20260624";
import { ImmersiveScene } from "./immersive-scene.mjs?v=land-map-20260624";
import { SurfaceMotion } from "./surface-motion.mjs?v=land-map-20260624";
import { celestialOrbit, moonPhaseForDate, moonPhaseName } from "./celestial-logic.mjs?v=village-guide-voice-20260625";
import { loadLocalTrack, removeLocalTrack, saveLocalTrack, validateAudioFileMeta } from "./local-music-store.mjs";
import { activeAmbientScenes } from "./ambient-schedule.mjs?v=grounded-audio-20260623";

const config = window.CAPY_CONFIG;
const WAFFLES_INTRO_STEPS = Object.freeze([
  { eyebrow: "Meet your village guide", title: "Hi, I’m Waffles.", text: "I’m a friendly AI resource guide. Tell me what you are trying to find, and I’ll compare the village database with your personal record. I don’t diagnose or replace professional advice." },
  { eyebrow: "Village · Support", title: "Start with support.", text: "The Village connects you with contact options, community conversations, friends, groups, and a dedicated search for support resources.", building: "Village", symbol: "⌂" },
  { eyebrow: "School · Education", title: "Find education resources.", text: "The School helps Waffles search for education programs, school accommodations, IEP information, learning support, and nearby services.", building: "School", symbol: "▤" },
  { eyebrow: "Courthouse · Legal", title: "Understand rights and advocacy.", text: "The Courthouse searches legal and advocacy resources. Always verify formal advice with a qualified professional or service provider.", building: "Courthouse", symbol: "§" },
  { eyebrow: "Park · Recreation", title: "Explore recreation.", text: "The Park helps you find inclusive recreation, calm weekend activities, sports, camps, and community programs that fit your needs.", building: "Park", symbol: "◇" },
  { eyebrow: "Woods · Activities", title: "See village activities.", text: "The Woods opens volunteer opportunities and upcoming village activities. You can return to Waffles from the guide button at any time.", building: "Woods", symbol: "♧" }
]);

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
  currentDiagnosis: "",
  pendingSearch: null,
  passwordResetEmail: "",
  introStep: 0,
  introOpen: false,
  resources: [],
  sheetSync: { configured: false },
  settings: loadSavedSettings(),
  environment: null,
  environmentTimer: null,
  environmentRefreshTimer: null,
  communityTimer: null,
  communityRoom: null,
  communityOverview: null,
  communityPosts: [],
  communityTab: "direct",
  communityPostImage: null,
  communityPostImagePromise: null,
  supportTab: "phone",
  supportIsland: null,
  voiceRecognition: null,
  voiceListening: false,
  voiceRestartTimer: null,
  guideListening: false,
  lastGuideAnswer: "",
  voiceAudio: null,
  voiceCache: new Map(),
  voiceClarification: null,
  audio: null,
  ecosystem: null,
  immersive: null,
  surfaceMotion: null,
  localMusic: { day: null, night: null }
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const i18n = {
  en: {
    begin: "Where would you like to begin?", explore: "Explore at your own pace. There is no wrong door—and Waffles can help make any topic feel more manageable.", choosePath: "Choose your own path",
    village: "Village", myRecord: "My record", lowStimulation: "Low-stimulation", viewBoth: "← View both islands", selectIsland: "Tap an island, then choose a building", chooseBuilding: "Choose a building",
    quietGardens: "Quiet gardens", momentumTrails: "Momentum trails", autismIsland: "Autism Island", adhdIsland: "ADHD Island",
    resourcesLoading: "Loading resources…", resourcesChecking: "Checking the live database", personalReady: "Your personal record is ready", personalMatch: "Waffles uses it only to improve matching", guestReady: "Temporary guest visit", guestMatch: "Searches and records are not saved", account: "Account", view: "View", refresh: "Refresh",
    jaGuide: "Waffles · Site guider", jaReady: "Ask me how this village works.",
    guideTitle: "Waffles · Village guider", guideEyebrow: "A friendly tour of the project", guideIntro: "This website helps people explore neurodiversity resources at their own pace. You can enter an island, choose a building, and let Waffles compare resources from the village database with your personal record.", guideStoryTitle: "The story", guideStory: "The village is shown as two neighboring islands in 2D, each with its own pace, buildings, and sense of support. The 3D view can feel more connected, but Waffles still treats each island as its own path through the resource village.", guideBuiltByTitle: "Made by", guideBuiltBy: "Created by SNP- Group D, 2026, cohort3.", guideUseTitle: "How Waffles helps", guideUse: "Waffles can introduce buildings, explain why a resource matched, save or dislike resources, and listen for natural voice commands when microphone control is turned on.", guideScoringTitle: "Resource points", guideScoring: "Under the site guider, resources with the most points are the ones Waffles sees as most relevant to the user’s search because their topic, tags, description, and profile fit overlap the strongest.", guideQuestion: "Ask Waffles about the site", guidePlaceholder: "For example: who made this site, what does the Courthouse do, or where should I go for legal help?", guideAsk: "Ask guide", guideSpeak: "Read aloud", guideListen: "Voice question", guideListening: "Listening for a guide question…", guideThinking: "Waffles is thinking…", guideActionPrefix: "Suggested next steps", guideError: "Waffles could not answer that yet.",
    settingsTitle: "Settings Studio", settingsEyebrow: "Make the village feel right", settingsIntro: "These preferences are saved on this device and applied immediately.",
    textSize: "Text size", smaller: "Smaller", standard: "Standard", larger: "Larger", extraLarge: "Extra large", colorPalette: "Color palette", calmSage: "Calm sage", softBlue: "Soft blue", warmPlum: "Warm plum", highContrast: "High contrast",
    language: "Language", motion: "Motion & visual detail", useLow: "Use low-stimulation view", useStandard: "Use standard view", settingsSaved: "Settings saved and applied.", previewTitle: "Live preview", previewText: "This text changes with your size, color, and language settings.", sceneStyle: "Environment style", scene2d: "Illustrated 2D", scene3d: "Immersive 3D", sceneHint: "3D adds perspective lighting, reflective animated water, forest depth and parallax.", sound: "Village sound", soundOff: "Sound is off", soundOn: "Sound is on", enableSound: "Enable sound", muteSound: "Mute sound", masterVolume: "Master volume", environmentVolume: "Weather & environment", musicVolume: "Background music", animalVolume: "Animals", soundHint: "Weather stays prominent; music and individual animal calls remain gentler.", customMusic: "Your local music", dayTrack: "Day soundtrack", nightTrack: "Night soundtrack", dayScoreName: "Garden Footsteps · original", nightScoreName: "Starlit Current · original", chooseAudio: "Choose audio", removeTrack: "Use original", musicLocalOnly: "MP3, OGG, WAV, M4A, AAC or WebM · up to 30 MB. Stored only in this browser and never uploaded.", trackSaved: "Local soundtrack saved.", trackRemoved: "Original soundtrack restored.", trackInvalid: "That audio file cannot be used.",
    support: "Support", settings: "Settings", education: "Education", legal: "Legal", recreation: "Recreation", activities: "Activities",
    supportTitle: "Support & Contact", supportEyebrow: "A steadier next step", prepare: "Small ways to prepare",
    communityTitle: "Village Community", communityIntro: "Join group conversations or connect privately with people who chose to participate.", communityOpen: "Open community chats", communityPrivacy: "Your email and private survey note are never shown. Waffles matches only shared interests, age group, and journey stage. You can leave at any time.", communityEnable: "Join the community", communityDisable: "Leave community matching", communityDisplayName: "Community display name", communityGroups: "Group chats", communitySuggestions: "People Waffles suggests", communityIncoming: "Connection requests", communityDirect: "Private chats", communityJoin: "Join group", communityOpenRoom: "Open chat", communityConnect: "Say hello", communityPending: "Request sent", communityAccept: "Accept", communityDecline: "Decline", communitySend: "Send", communityMessagePlaceholder: "Write a kind message…", communityEmpty: "No messages yet. You can start gently.", communityLoading: "Opening the community…", communitySafety: "Community messages are stored securely but are not end-to-end encrypted. They are peer conversation, not professional or emergency support. Do not share passwords, addresses, or urgent medical details.",
    activityTitle: "Volunteer & Activity", activityEyebrow: "Things we can do together", activityIntro: "Upcoming community activities. Only project editors can change these listings.",
    aiEyebrow: "Waffles · Personalized resource matching", aiHello: "Hi, I’m Waffles.", aiExplain: "I’ll score tags first, then descriptions and issue conflicts, using your record and this building’s topic.", aiQuestion: "What are you trying to find?", aiFind: "Find fitting resources", aiChecking: "Waffles is checking the village…", aiDisclaimer: "Waffles provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.", resultCount: "Number of resources", scoreWhy: "Why this matched", expandedTerms: "Related terms used", resourceExplain: "Waffles explain", resourceLike: "Save", resourceLiked: "Saved", resourceDislike: "Dislike", resourceDisliked: "Disliked", resourceVisit: "Visit resource ↗", resourceSaved: "Resource saved to your record.", resourceUnsaved: "Resource removed from saved list.", resourceDislikeSaved: "Resource added to disliked list.", resourceDislikeRemoved: "Resource removed from disliked list.", savedResourcesTitle: "Saved resources", dislikedResourcesTitle: "Disliked resources", noSavedResources: "No saved resources yet.", noDislikedResources: "No disliked resources yet.", clarificationTitle: "A quick detail will improve these matches", clarificationNone: "None of these", clarificationContinue: "Continue search", clarificationRequired: "Choose any relevant option, or select “None of these.”", sourceLabel: "Database source", scoringLabel: "scoring", aiExpandedKeywords: "AI-expanded keywords", localExpandedKeywords: "local synonym expansion", supportSearchTitle: "Search the support database", supportSearchIntro: "Waffles checks the live resource database and ranks each match with the same transparent scoring system used in the Education buildings.", supportContactTab: "Contact", supportFindTab: "Find resources", communityPrivateTab: "Private chat", communityGroupsTab: "Groups", communityMomentsTab: "Moments", communityRequestsTab: "Requests",
    voiceTools: "Voice assistant", voiceAssistant: "Narrate clicks and places", voiceControl: "Microphone commands", voiceListen: "Listen for a command", voiceListening: "Listening…", voiceHint: "Try natural phrases like “research 504 plans,” “open Waffles,” or “find school support.” Waffles may ask a follow-up question. Voice recognition captures your words in the browser; Waffles uses the AI API for spoken audio and smarter command routing.",
    recordTitle: "My personal record", recordIntro: "This record helps Waffles choose more relevant entries from the resource database.", recentSearches: "Recent resource searches", noSearches: "No searches yet.", feedbackLabel: "Feedback for the project team", feedbackSave: "Save feedback", logout: "Log out",
    sheetConnected: "Google Sheet sync connected", sheetMissing: "Google Sheet sync is not connected yet",
    environmentFinding: "Finding your local sky…", environmentUnavailable: "Local weather unavailable", approximateIp: "Approx. by IP · Open-Meteo",
    spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter",
    weatherClear: "Clear", weatherCloudy: "Cloudy", weatherFog: "Foggy", weatherRain: "Rain", weatherSnow: "Snow", weatherStorm: "Thunderstorm", weatherRefresh: "Refresh local weather"
  },
  zh: {
    begin: "你想从哪里开始？", explore: "按自己的节奏探索。没有走错的门——Waffles 会帮你把每个主题都变得更容易理解。", choosePath: "选择你自己的路径",
    village: "村庄", myRecord: "我的记录", lowStimulation: "低刺激模式", viewBoth: "← 查看两座岛", selectIsland: "点岛进入，再选择建筑", chooseBuilding: "选择一栋建筑",
    quietGardens: "安静花园", momentumTrails: "活力小径", autismIsland: "自闭症岛", adhdIsland: "ADHD 岛",
    resourcesLoading: "正在加载资源…", resourcesChecking: "正在检查实时数据库", personalReady: "你的个人记录已准备好", personalMatch: "Waffles 只用它来改善资源匹配", guestReady: "临时访客模式", guestMatch: "搜索与个人记录不会被保存", account: "账户", view: "查看", refresh: "刷新",
    jaGuide: "Waffles · 网站向导", jaReady: "我可以介绍这个网站。",
    guideTitle: "Waffles · 村庄向导", guideEyebrow: "这个项目的温柔导览", guideIntro: "这个网站帮助用户按照自己的节奏探索神经多样性相关资源。你可以进入一座岛，选择一栋建筑，然后让 Waffles 结合你的个人记录与村庄数据库来比较资源。", guideStoryTitle: "背景故事", guideStory: "在 2D 地图里，村庄呈现为两座相邻但分开的岛，每座岛都有自己的节奏、建筑和支持路径。3D 视图会让空间感觉更连贯，但 Waffles 仍会把每座岛当作独立的资源探索路径。", guideBuiltByTitle: "制作团队", guideBuiltBy: "由 SNP- Group D，2026，cohort3 创建。", guideUseTitle: "Waffles 可以做什么", guideUse: "Waffles 可以介绍建筑、解释资源为什么匹配、收藏或标记不喜欢的资源，并在开启麦克风控制后理解自然语音指令。", guideScoringTitle: "资源分数", guideScoring: "在网站向导里，分数最高的资源代表 Waffles 认为它们与用户搜索最相关，因为它们在主题、标签、描述和个人记录匹配上重合最多。", guideQuestion: "向 Waffles 询问网站", guidePlaceholder: "例如：这个网站是谁做的，法院建筑有什么用，或我需要法律帮助该去哪？", guideAsk: "询问向导", guideSpeak: "朗读", guideListen: "语音提问", guideListening: "正在听你的向导问题…", guideThinking: "Waffles 正在思考…", guideActionPrefix: "建议的下一步", guideError: "Waffles 现在还无法回答。",
    settingsTitle: "设置中心", settingsEyebrow: "让村庄更适合你", settingsIntro: "这些偏好会保存在本设备，并立即生效。",
    textSize: "文字大小", smaller: "较小", standard: "标准", larger: "较大", extraLarge: "超大", colorPalette: "颜色主题", calmSage: "宁静绿色", softBlue: "柔和蓝色", warmPlum: "温暖紫色", highContrast: "高对比度",
    language: "语言", motion: "动画与视觉细节", useLow: "使用低刺激模式", useStandard: "使用标准模式", settingsSaved: "设置已保存并生效。", previewTitle: "实时预览", previewText: "这段文字会跟随字体、颜色和语言设置变化。", sceneStyle: "环境样式", scene2d: "插画 2D", scene3d: "沉浸式 3D", sceneHint: "3D 模式加入透视光照、动态反光水面、森林景深和视差。", sound: "村庄声音", soundOff: "声音已关闭", soundOn: "声音已开启", enableSound: "开启声音", muteSound: "静音", masterVolume: "总音量", environmentVolume: "天气与环境", musicVolume: "背景音乐", animalVolume: "动物", soundHint: "天气与环境声较明显，音乐和各类动物声保持轻柔。", customMusic: "你的本地音乐", dayTrack: "白天配乐", nightTrack: "夜晚配乐", dayScoreName: "花园足迹 · 原创", nightScoreName: "星河回声 · 原创", chooseAudio: "选择音频", removeTrack: "恢复原创", musicLocalOnly: "支持 MP3、OGG、WAV、M4A、AAC、WebM，最大 30 MB。仅保存在本浏览器，绝不会上传。", trackSaved: "本地配乐已保存。", trackRemoved: "已恢复原创配乐。", trackInvalid: "无法使用这个音频文件。",
    support: "支持", settings: "设置", education: "教育", legal: "法律", recreation: "休闲活动", activities: "活动",
    supportTitle: "支持与联系", supportEyebrow: "找到更稳妥的下一步", prepare: "可以先做的小准备",
    communityTitle: "村庄社区", communityIntro: "加入不同群聊，或与自愿参与且经历相似的用户私聊。", communityOpen: "打开社区聊天", communityPrivacy: "不会展示你的邮箱或问卷私人备注。Waffles 只比较共同关注领域、年龄组和经历阶段；你可以随时退出。", communityEnable: "加入社区", communityDisable: "退出社区匹配", communityDisplayName: "社区显示名称", communityGroups: "群聊", communitySuggestions: "Waffles 推荐认识的人", communityIncoming: "好友申请", communityDirect: "私聊", communityJoin: "加入群聊", communityOpenRoom: "打开聊天", communityConnect: "打个招呼", communityPending: "已发送申请", communityAccept: "接受", communityDecline: "拒绝", communitySend: "发送", communityMessagePlaceholder: "写一条友善的消息……", communityEmpty: "还没有消息，可以轻轻地开始。", communityLoading: "正在打开社区……", communitySafety: "社区消息会安全保存，但不是端到端加密。这里属于用户互助，不是专业或紧急服务；请勿发送密码、住址或紧急医疗隐私。",
    activityTitle: "志愿者与活动", activityEyebrow: "一起参与的事情", activityIntro: "即将开始的社区活动。只有项目管理员可以修改内容。",
    aiEyebrow: "Waffles · 个性化资源匹配", aiHello: "你好，我是 Waffles。", aiExplain: "我会先匹配标签，再检查描述与冲突项，并结合你的个人记录和建筑主题透明评分。", aiQuestion: "你正在寻找什么？", aiFind: "查找合适资源", aiChecking: "Waffles 正在查找村庄资源…", aiDisclaimer: "Waffles 提供资源导航，不构成医疗或法律建议。请向服务机构确认资格、费用与当前名额。", resultCount: "显示资源数量", scoreWhy: "匹配原因", expandedTerms: "使用的相关词", resourceExplain: "让 Waffles 解释", resourceLike: "收藏", resourceLiked: "已收藏", resourceDislike: "不喜欢", resourceDisliked: "已不喜欢", resourceVisit: "打开资源 ↗", resourceSaved: "资源已收藏到你的记录。", resourceUnsaved: "已从收藏资源中移除。", resourceDislikeSaved: "已加入不喜欢资源列表。", resourceDislikeRemoved: "已从不喜欢资源中移除。", savedResourcesTitle: "收藏的资源", dislikedResourcesTitle: "不喜欢的资源", noSavedResources: "还没有收藏资源。", noDislikedResources: "还没有不喜欢的资源。", clarificationTitle: "补充一个小细节，匹配会更准确", clarificationNone: "以上都不是", clarificationContinue: "继续搜索", clarificationRequired: "请选择一个相关选项，或选择“以上都不是”。", sourceLabel: "数据库来源", scoringLabel: "评分版本", aiExpandedKeywords: "AI 扩展关键词", localExpandedKeywords: "本地同义词扩展", supportSearchTitle: "搜索支持资源数据库", supportSearchIntro: "Waffles 会检查实时资源数据库，并用与教育建筑相同的透明评分系统排序。", supportContactTab: "联系", supportFindTab: "找资源", communityPrivateTab: "私聊", communityGroupsTab: "群组", communityMomentsTab: "动态", communityRequestsTab: "请求",
    voiceTools: "语音助手", voiceAssistant: "点击时自动讲解", voiceControl: "麦克风语音操作", voiceListen: "听取指令", voiceListening: "正在听…", voiceHint: "可以自然地说：“research 504 plans”、“open Waffles” 或“find school support”。如果不清楚，Waffles 会追问。浏览器负责听写你的话；Waffles 会使用 AI API 生成语音并更聪明地理解指令。",
    recordTitle: "我的个人记录", recordIntro: "这份记录帮助 Waffles 从数据库中选择更相关的资源。", recentSearches: "最近的资源搜索", noSearches: "还没有搜索记录。", feedbackLabel: "给项目团队的反馈", feedbackSave: "保存反馈", logout: "退出登录",
    sheetConnected: "Google Sheet 自动同步已连接", sheetMissing: "Google Sheet 自动同步尚未连接",
    environmentFinding: "正在寻找你当地的天空…", environmentUnavailable: "暂时无法获取当地天气", approximateIp: "IP 大致位置 · Open-Meteo",
    spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季",
    weatherClear: "晴朗", weatherCloudy: "多云", weatherFog: "有雾", weatherRain: "下雨", weatherSnow: "下雪", weatherStorm: "雷雨", weatherRefresh: "刷新当地天气"
  },
  es: {
    begin: "¿Por dónde te gustaría empezar?", explore: "Explora a tu propio ritmo. No hay una puerta equivocada; Waffles puede hacer que cada tema sea más manejable.", choosePath: "Elige tu propio camino",
    village: "Aldea", myRecord: "Mi registro", lowStimulation: "Baja estimulación", viewBoth: "← Ver ambas islas", selectIsland: "Toca una isla y luego un edificio", chooseBuilding: "Elige un edificio",
    quietGardens: "Jardines tranquilos", momentumTrails: "Senderos activos", autismIsland: "Isla Autismo", adhdIsland: "Isla TDAH",
    resourcesLoading: "Cargando recursos…", resourcesChecking: "Consultando la base de datos", personalReady: "Tu registro personal está listo", personalMatch: "Waffles lo usa solo para mejorar las coincidencias", guestReady: "Visita temporal", guestMatch: "Las búsquedas y registros no se guardan", account: "Cuenta", view: "Ver", refresh: "Actualizar",
    jaGuide: "Waffles · Guía del sitio", jaReady: "Puedo explicar cómo funciona.",
    guideTitle: "Waffles · Guía de la aldea", guideEyebrow: "Un recorrido amable del proyecto", guideIntro: "Este sitio ayuda a explorar recursos de neurodiversidad a tu propio ritmo. Puedes entrar en una isla, elegir un edificio y dejar que Waffles compare recursos de la base de datos con tu registro personal.", guideStoryTitle: "La historia", guideStory: "En el mapa 2D, la aldea aparece como dos islas vecinas y separadas, cada una con su propio ritmo, edificios y formas de apoyo. La vista 3D puede sentirse más conectada, pero Waffles sigue tratando cada isla como un camino propio por los recursos.", guideBuiltByTitle: "Creado por", guideBuiltBy: "Creado por SNP- Group D, 2026, cohort3.", guideUseTitle: "Cómo ayuda Waffles", guideUse: "Waffles puede presentar edificios, explicar por qué coincide un recurso, guardar o marcar recursos, y escuchar comandos naturales cuando activas el micrófono.", guideScoringTitle: "Puntos de recursos", guideScoring: "En la guía del sitio, los recursos con más puntos son los que Waffles considera más relevantes para la búsqueda porque coinciden mejor en tema, etiquetas, descripción y registro personal.", guideQuestion: "Pregunta a Waffles sobre el sitio", guidePlaceholder: "Por ejemplo: quién creó este sitio, qué hace el juzgado o adónde voy para apoyo legal.", guideAsk: "Preguntar", guideSpeak: "Leer en voz alta", guideListen: "Pregunta por voz", guideListening: "Escuchando una pregunta para la guía…", guideThinking: "Waffles está pensando…", guideActionPrefix: "Siguientes pasos sugeridos", guideError: "Waffles aún no pudo responder eso.",
    settingsTitle: "Centro de ajustes", settingsEyebrow: "Haz que la aldea se adapte a ti", settingsIntro: "Estas preferencias se guardan en este dispositivo y se aplican inmediatamente.",
    textSize: "Tamaño del texto", smaller: "Pequeño", standard: "Estándar", larger: "Grande", extraLarge: "Muy grande", colorPalette: "Paleta de colores", calmSage: "Verde salvia", softBlue: "Azul suave", warmPlum: "Ciruela cálida", highContrast: "Alto contraste",
    language: "Idioma", motion: "Movimiento y detalle visual", useLow: "Usar vista de baja estimulación", useStandard: "Usar vista estándar", settingsSaved: "Ajustes guardados y aplicados.", previewTitle: "Vista previa", previewText: "Este texto cambia con el tamaño, color e idioma elegidos.", sceneStyle: "Estilo del entorno", scene2d: "2D ilustrado", scene3d: "3D inmersivo", sceneHint: "El modo 3D añade perspectiva, agua reflectante, profundidad de bosque y paralaje.", sound: "Sonido de la aldea", soundOff: "Sonido apagado", soundOn: "Sonido activado", enableSound: "Activar sonido", muteSound: "Silenciar", masterVolume: "Volumen general", environmentVolume: "Clima y ambiente", musicVolume: "Música de fondo", animalVolume: "Animales", soundHint: "El clima queda presente; la música y los animales se mantienen suaves.", customMusic: "Tu música local", dayTrack: "Música diurna", nightTrack: "Música nocturna", dayScoreName: "Pasos del jardín · original", nightScoreName: "Corriente estelar · original", chooseAudio: "Elegir audio", removeTrack: "Usar original", musicLocalOnly: "MP3, OGG, WAV, M4A, AAC o WebM · máximo 30 MB. Se guarda solo en este navegador y nunca se sube.", trackSaved: "Música local guardada.", trackRemoved: "Música original restaurada.", trackInvalid: "No se puede usar ese archivo de audio.",
    support: "Apoyo", settings: "Ajustes", education: "Educación", legal: "Legal", recreation: "Recreación", activities: "Actividades",
    supportTitle: "Apoyo y contacto", supportEyebrow: "Un próximo paso más tranquilo", prepare: "Pequeñas formas de prepararse",
    communityTitle: "Comunidad de la aldea", communityIntro: "Únete a grupos o conecta en privado con personas que aceptaron participar.", communityOpen: "Abrir chats", communityPrivacy: "Tu correo y tus notas privadas nunca se muestran. Waffles compara solo intereses, edad y etapa del recorrido.", communityEnable: "Unirme a la comunidad", communityDisable: "Salir de la comunidad", communityDisplayName: "Nombre visible", communityGroups: "Chats grupales", communitySuggestions: "Personas sugeridas por Waffles", communityIncoming: "Solicitudes", communityDirect: "Chats privados", communityJoin: "Unirme", communityOpenRoom: "Abrir chat", communityConnect: "Saludar", communityPending: "Solicitud enviada", communityAccept: "Aceptar", communityDecline: "Rechazar", communitySend: "Enviar", communityMessagePlaceholder: "Escribe un mensaje amable…", communityEmpty: "Aún no hay mensajes.", communityLoading: "Abriendo la comunidad…", communitySafety: "Los mensajes se guardan de forma segura, pero no tienen cifrado de extremo a extremo. Son apoyo entre pares, no atención profesional ni de emergencia. No compartas contraseñas, direcciones ni datos médicos urgentes.",
    activityTitle: "Voluntariado y actividades", activityEyebrow: "Cosas que podemos hacer juntos", activityIntro: "Próximas actividades comunitarias. Solo los editores del proyecto pueden cambiarlas.",
    aiEyebrow: "Waffles · Recursos personalizados", aiHello: "Hola, soy Waffles.", aiExplain: "Puntuaré primero las etiquetas y después la descripción y los posibles conflictos.", aiQuestion: "¿Qué estás buscando?", aiFind: "Buscar recursos", aiChecking: "Waffles está buscando recursos…", aiDisclaimer: "Waffles orienta sobre recursos; no ofrece consejo médico ni legal. Confirma requisitos, costo y disponibilidad.", resultCount: "Cantidad de recursos", scoreWhy: "Por qué coincide", expandedTerms: "Términos relacionados usados", resourceExplain: "Waffles explica", resourceLike: "Guardar", resourceLiked: "Guardado", resourceDislike: "No me sirve", resourceDisliked: "Marcado", resourceVisit: "Visitar recurso ↗", resourceSaved: "Recurso guardado en tu registro.", resourceUnsaved: "Recurso eliminado de guardados.", resourceDislikeSaved: "Recurso marcado como no útil.", resourceDislikeRemoved: "Recurso quitado de no útiles.", savedResourcesTitle: "Recursos guardados", dislikedResourcesTitle: "Recursos no útiles", noSavedResources: "Aún no hay recursos guardados.", noDislikedResources: "Aún no hay recursos marcados.", clarificationTitle: "Un detalle rápido mejorará estas coincidencias", clarificationNone: "Ninguna de estas", clarificationContinue: "Continuar búsqueda", clarificationRequired: "Elige una opción relevante o selecciona “Ninguna de estas”.", sourceLabel: "Fuente de datos", scoringLabel: "puntuación", aiExpandedKeywords: "palabras ampliadas por IA", localExpandedKeywords: "expansión local de sinónimos", supportSearchTitle: "Buscar en la base de apoyo", supportSearchIntro: "Waffles revisa la base de recursos en vivo y ordena cada resultado con el mismo sistema de puntuación transparente usado en Educación.", supportContactTab: "Contacto", supportFindTab: "Buscar recursos", communityPrivateTab: "Chat privado", communityGroupsTab: "Grupos", communityMomentsTab: "Momentos", communityRequestsTab: "Solicitudes",
    voiceTools: "Asistente de voz", voiceAssistant: "Narrar clics y lugares", voiceControl: "Comandos por micrófono", voiceListen: "Escuchar comando", voiceListening: "Escuchando…", voiceHint: "Prueba frases naturales como “research 504 plans”, “open Waffles” o “find school support”. Waffles puede hacer una pregunta de seguimiento. El navegador transcribe tu voz; Waffles usa la API de IA para el audio hablado y el enrutamiento inteligente.",
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
    this.sceneMode = "2d";
    this.season = "summer";
    this.currentMinutes = 720;
    this.sunrise = 360;
    this.activeAmbienceKey = "";
    this.buffers = new Map();
    this.bufferPromise = null;
    this.customTrackRecords = new Map();
    this.customTrackGeneration = { day: 0, night: 0 };
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

  ensureContext() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain();
      this.environmentGain = this.context.createGain();
      this.musicGain = this.context.createGain();
      this.animalGain = this.context.createGain();
      this.master.gain.value = 0;
      this.environmentGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.animalGain.connect(this.master);
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
  }

  async enable() {
    this.ensureContext();
    await this.context.resume();
    await this.loadBuffers();
    await this.decodeCustomTracks();
    this.restartEnvironment();
    this.restartMusic();
    this.scheduleAnimal();
    this.applySettings();
  }

  async loadBuffers() {
    if (this.bufferPromise) return this.bufferPromise;
    const sampleEntries = Object.entries(config.ecosystem?.audio?.samples || {}).map(([key, item]) => [key, item.src]);
    const musicEntries = Object.entries(config.ecosystem?.audio?.music || {}).filter(([, url]) => url).map(([key, url]) => [`music-${key}`, url]);
    const ambienceEntries = Object.entries(config.ecosystem?.audio?.ambience || {}).filter(([, item]) => item?.src).map(([key, item]) => [`ambience-${key}`, item.src]);
    this.bufferPromise = Promise.allSettled([...sampleEntries, ...musicEntries, ...ambienceEntries].map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Audio ${key} returned ${response.status}`);
      this.buffers.set(key, await this.context.decodeAudioData(await response.arrayBuffer()));
    }));
    return this.bufferPromise;
  }

  async decodeCustomTracks() {
    await Promise.allSettled(["day", "night"].map((slot) => this.decodeCustomTrack(slot, this.customTrackRecords.get(slot) || null)));
  }

  async decodeCustomTrack(slot, record) {
    const generation = ++this.customTrackGeneration[slot];
    const key = `custom-music-${slot}`;
    this.buffers.delete(key);
    if (!record || !this.context) return;
    const blob = record.blob instanceof Blob ? record.blob : new Blob([record.bytes], { type: record.type || "audio/mpeg" });
    const decoded = await this.context.decodeAudioData(await blob.arrayBuffer());
    if (generation === this.customTrackGeneration[slot]) this.buffers.set(key, decoded);
  }

  async decodeCandidate(file) {
    this.ensureContext();
    return this.context.decodeAudioData(await file.arrayBuffer());
  }

  async setCustomTrack(slot, record, decodedBuffer = null) {
    if (record) this.customTrackRecords.set(slot, record);
    else this.customTrackRecords.delete(slot);
    if (decodedBuffer) {
      this.customTrackGeneration[slot] += 1;
      this.buffers.set(`custom-music-${slot}`, decodedBuffer);
    } else {
      if (record) this.ensureContext();
      if (this.context) await this.decodeCustomTrack(slot, record);
    }
    if (state.settings.soundEnabled && (slot === "day") === this.isDay) this.restartMusic();
  }

  rememberCustomTrack(slot, record) {
    if (record) this.customTrackRecords.set(slot, record);
    else this.customTrackRecords.delete(slot);
  }

  stopEnvironment() {
    this.environmentNodes.forEach((node) => { try { node.stop?.(); } catch {} try { node.disconnect?.(); } catch {} });
    this.environmentNodes = [];
  }

  addEnvironmentNoise({ type = "lowpass", frequency = 500, q = .7, level = .04, rate = 1, pulse = 0 } = {}) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = rate;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(this.environmentGain);
    source.start();
    this.environmentNodes.push(source, filter, gain);
    if (pulse > 0) {
      const lfo = this.context.createOscillator();
      const depth = this.context.createGain();
      lfo.type = "sine";
      lfo.frequency.value = pulse;
      depth.gain.value = level * .28;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      this.environmentNodes.push(lfo, depth);
    }
  }

  addEnvironmentTone({ frequency = 90, level = .01, type = "sine", pulse = .06 } = {}) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = level;
    oscillator.connect(gain).connect(this.environmentGain);
    oscillator.start();
    this.environmentNodes.push(oscillator, gain);
    if (pulse > 0) {
      const lfo = this.context.createOscillator();
      const depth = this.context.createGain();
      lfo.frequency.value = pulse;
      depth.gain.value = level * .38;
      lfo.connect(depth).connect(gain.gain);
      lfo.start();
      this.environmentNodes.push(lfo, depth);
    }
  }

  restartEnvironment() {
    if (!this.context || this.context.state !== "running") return;
    this.stopEnvironment();
    const scenes = {
      clear: [
        { type: "lowpass", frequency: 520, level: .028, rate: .82, pulse: .055 },
        { type: "bandpass", frequency: 1180, q: .5, level: .009, rate: 1.08, pulse: .11 }
      ],
      cloudy: [
        { type: "lowpass", frequency: 390, level: .052, rate: .74, pulse: .075 },
        { type: "bandpass", frequency: 760, q: .65, level: .018, rate: .9, pulse: .13 }
      ],
      fog: [
        { type: "lowpass", frequency: 235, level: .068, rate: .58, pulse: .035 },
        { type: "bandpass", frequency: 480, q: 1.4, level: .012, rate: .7, pulse: .05 }
      ],
      rain: [
        { type: "highpass", frequency: 1050, level: .145, rate: 1.18, pulse: .17 },
        { type: "bandpass", frequency: 3300, q: .75, level: .045, rate: 1.5, pulse: .29 },
        { type: "lowpass", frequency: 330, level: .025, rate: .72, pulse: .08 }
      ],
      snow: [
        { type: "lowpass", frequency: 300, level: .026, rate: .62, pulse: .045 },
        { type: "bandpass", frequency: 1450, q: 2.1, level: .006, rate: .84, pulse: .09 }
      ],
      storm: [
        { type: "highpass", frequency: 820, level: .17, rate: 1.35, pulse: .2 },
        { type: "bandpass", frequency: 420, q: .5, level: .13, rate: .66, pulse: .055 },
        { type: "bandpass", frequency: 2800, q: .7, level: .055, rate: 1.55, pulse: .31 }
      ]
    };
    (scenes[this.weather] || scenes.clear).forEach((layer) => this.addEnvironmentNoise(layer));

    // A close, softly pulsing water edge is added in immersive mode. It is
    // intentionally quieter in 2D so the visual choice also has an audible depth cue.
    this.addEnvironmentNoise({ type: "bandpass", frequency: 680, q: 1.15, level: this.sceneMode === "3d" ? .027 : .008, rate: .48, pulse: .12 });
    if (!this.isDay) {
      this.addEnvironmentNoise({ type: "highpass", frequency: 3550, q: 2.4, level: .006, rate: 1.6, pulse: 2.7 });
      this.addEnvironmentTone({ frequency: 118, level: .0035, pulse: .045 });
    }
    if (this.season === "spring") this.addEnvironmentNoise({ type: "highpass", frequency: 2400, q: 1.4, level: .004, rate: 1.25, pulse: .18 });
    if (this.season === "autumn") this.addEnvironmentNoise({ type: "bandpass", frequency: 920, q: .8, level: .014, rate: .82, pulse: .16 });
    if (this.season === "winter") this.addEnvironmentNoise({ type: "bandpass", frequency: 410, q: 1.6, level: .009, rate: .55, pulse: .04 });
    if (this.weather === "storm") this.addEnvironmentTone({ frequency: 42, level: .032, pulse: .07 });
    if (this.weather === "fog") this.addEnvironmentTone({ frequency: 74, level: .008, pulse: .035 });
    this.startScheduledAmbience();
  }

  scheduledAmbience() {
    return activeAmbientScenes(config.ecosystem?.audio?.ambience, { season: this.season, currentMinutes: this.currentMinutes, sunrise: this.sunrise });
  }

  startScheduledAmbience() {
    this.scheduledAmbience().forEach((key) => {
      const scene = config.ecosystem?.audio?.ambience?.[key];
      const buffer = this.buffers.get(`ambience-${key}`);
      if (!scene || !buffer) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const now = this.context.currentTime;
      source.buffer = buffer;
      source.loop = true;
      gain.gain.setValueAtTime(.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, Number(scene.volume || .1)), now + 1.8);
      source.connect(gain).connect(this.environmentGain);
      source.start();
      this.environmentNodes.push(source, gain);
    });
  }

  playBuffer(buffer, destination, volume = .3, maximumDuration = null) {
    if (!buffer) return false;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    const playDuration = Math.min(maximumDuration || buffer.duration, buffer.duration);
    const attack = Math.min(.18, playDuration * .2);
    const release = Math.min(.28, playDuration * .3);
    const releaseStart = Math.max(now + attack + .01, now + playDuration - release);
    source.buffer = buffer;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + attack);
    gain.gain.setValueAtTime(Math.max(.0002, volume), releaseStart);
    gain.gain.exponentialRampToValueAtTime(.0001, now + playDuration);
    source.connect(gain).connect(destination);
    source.start(now, 0, playDuration);
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

  airyBird(species = "bird") {
    const now = this.context.currentTime;
    const isGull = species === "gull";
    const frequencies = isGull ? [690, 610] : [1040, 1280, 980];
    const filter = this.context.createBiquadFilter();
    const dry = this.context.createGain();
    const delay = this.context.createDelay(1);
    const echo = this.context.createGain();
    const pan = this.context.createStereoPanner?.();
    filter.type = "lowpass";
    filter.frequency.value = isGull ? 1750 : 2350;
    filter.Q.value = .7;
    dry.gain.value = .54;
    delay.delayTime.value = isGull ? .31 : .24;
    echo.gain.value = .14;
    filter.connect(dry);
    filter.connect(delay);
    delay.connect(echo).connect(delay);
    if (pan) {
      pan.pan.value = (Math.random() - .5) * .9;
      dry.connect(pan);
      delay.connect(pan);
      pan.connect(this.animalGain);
    } else {
      dry.connect(this.animalGain);
      delay.connect(this.animalGain);
    }

    frequencies.forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      const breath = this.context.createGain();
      const start = now + index * (isGull ? .34 : .27);
      const duration = isGull ? 1.05 : .82;
      const peak = isGull ? .0042 : .0034;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * .96, start);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.04, start + duration * .42);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .88, start + duration);
      breath.gain.setValueAtTime(.0001, start);
      breath.gain.exponentialRampToValueAtTime(peak, start + .16);
      breath.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(breath).connect(filter);
      oscillator.start(start);
      oscillator.stop(start + duration + .03);
    });

    const cleanupAfter = (frequencies.length * (isGull ? .34 : .27) + 2.2) * 1000;
    setTimeout(() => [filter, dry, delay, echo, pan].filter(Boolean).forEach((node) => { try { node.disconnect(); } catch {} }), cleanupAfter);
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
      bird: () => this.airyBird("bird"),
      villager: () => this.chirp([92, 82], { type: "sine", level: .012, duration: .12, gap: .24 }),
      dragon: () => this.noiseGesture({ frequency: 1800, level: .11, duration: 1.8, type: "highpass" }),
      capybara: () => this.chirp([420, 560, 470], { type: "triangle", level: .026, duration: .2, gap: .14 }),
      cow: () => this.chirp([105, 92], { type: "sawtooth", level: .012, duration: .6, gap: .22 }),
      sheep: () => this.chirp([390, 330], { type: "triangle", level: .018, duration: .34, gap: .17 }),
      deer: () => this.chirp([220, 180], { type: "sine", level: .016, duration: .42, gap: .18 }),
      gull: () => this.airyBird("gull")
    };
    (profiles[species] || profiles.bird)();
  }

  playAnimal(species) {
    if (!this.context || this.context.state !== "running" || !state.settings.soundEnabled) return;
    const samples = config.ecosystem?.audio?.samples || {};
    const sampleKey = species === "gull" && !samples.gull ? "bird" : species;
    const sample = samples[sampleKey];
    const volume = Number(sample?.volume || .3) * (species === "gull" ? .76 : 1);
    if (sample && this.playBuffer(this.buffers.get(sampleKey), this.animalGain, volume, Number(sample.maximumDuration || 0) || null)) return;
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
    }, 14_000 + Math.random() * 12_000);
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

  rememberMusicNodes(nodes, source) {
    this.musicNodes.push(...nodes);
    source.addEventListener("ended", () => {
      nodes.forEach((node) => {
        const index = this.musicNodes.indexOf(node);
        if (index >= 0) this.musicNodes.splice(index, 1);
        try { node.disconnect?.(); } catch {}
      });
    }, { once: true });
  }

  musicTone(frequency, start, duration, { type = "sine", level = .018, attack = .08, release = .7, cutoff = 1800, detune = 0 } = {}) {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    oscillator.detune.value = detune;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, start + Math.max(attack + .03, duration - release));
    oscillator.connect(filter).connect(gain).connect(this.musicGain);
    oscillator.start(start);
    oscillator.stop(start + duration);
    this.rememberMusicNodes([oscillator, filter, gain], oscillator);
  }

  woodenPulse(start, level = .006) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = 820;
    filter.Q.value = 5.5;
    gain.gain.setValueAtTime(level, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .11);
    source.connect(filter).connect(gain).connect(this.musicGain);
    source.start(start, 0, .13);
    source.stop(start + .14);
    this.rememberMusicNodes([source, filter, gain], source);
  }

  proceduralMusicPhrase() {
    if (!this.context || this.context.state !== "running" || !state.settings.soundEnabled) return;
    const now = this.context.currentTime;
    if (this.isDay) {
      // "Garden Footsteps": an original bright pentatonic melody with soft
      // wooden pulses. It shares only a broad gentle daytime mood with the
      // user's references and does not copy their melody or arrangement.
      const scale = [261.63, 293.66, 329.63, 392, 440, 523.25];
      const melody = [0, 2, null, 4, 3, 2, 1, null, 0, 3, 4, 5, 4, 2, 1, null];
      const step = 60 / Number(config.ecosystem?.audio?.proceduralMusic?.day?.tempo || 82) / 2;
      melody.forEach((degree, index) => {
        const start = now + .08 + index * step;
        if (degree != null) this.musicTone(scale[degree], start, step * 1.7, { type: "triangle", level: .015, attack: .018, release: .32, cutoff: 1500 });
        if (index % 2 === 0) this.woodenPulse(start, .0045);
      });
      [[130.81, 0], [196, 4], [220, 8], [196, 12]].forEach(([frequency, index]) => this.musicTone(frequency, now + index * step, step * 4.1, { level: .006, attack: .35, release: 1.1, cutoff: 720 }));
      this.musicTimer = setTimeout(() => this.proceduralMusicPhrase(), melody.length * step * 1000);
      return;
    }

    // "Starlit Current": an original slow night score built from airy pads,
    // low drones, and sparse bell-like notes.
    const nightScale = [220, 261.63, 293.66, 329.63, 392, 440];
    const nightMelody = [0, null, 2, 1, null, 4, 3, null, 2, 5, null, 1];
    const nightStep = 60 / Number(config.ecosystem?.audio?.proceduralMusic?.night?.tempo || 56);
    nightMelody.forEach((degree, index) => {
      if (degree == null) return;
      const start = now + .12 + index * nightStep;
      this.musicTone(nightScale[degree], start, nightStep * 2.2, { type: "sine", level: .011, attack: .28, release: 1.25, cutoff: 2100 });
      this.musicTone(nightScale[degree] * 2, start + .06, nightStep * 1.4, { type: "sine", level: .0035, attack: .08, release: .9, cutoff: 3100, detune: 4 });
    });
    this.musicTone(110, now, nightMelody.length * nightStep, { type: "sine", level: .0045, attack: 1.5, release: 2.6, cutoff: 420 });
    this.musicTone(164.81, now, nightMelody.length * nightStep, { type: "sine", level: .003, attack: 2.1, release: 2.6, cutoff: 520, detune: -3 });
    this.musicTimer = setTimeout(() => this.proceduralMusicPhrase(), nightMelody.length * nightStep * 1000);
  }

  restartMusic() {
    if (!this.context || this.context.state !== "running") return;
    this.stopMusic();
    const slot = this.isDay ? "day" : "night";
    const buffer = this.buffers.get(`custom-music-${slot}`) || this.buffers.get(`music-${slot}`);
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
    this.restartEnvironment();
    this.restartMusic();
  }

  setSceneMode(mode) {
    const next = mode === "3d" ? "3d" : "2d";
    if (next === this.sceneMode) return;
    this.sceneMode = next;
    this.restartEnvironment();
  }

  setSeason(season) {
    const next = ["spring", "summer", "autumn", "winter"].includes(season) ? season : "summer";
    if (next === this.season) return;
    this.season = next;
    this.restartEnvironment();
  }

  setClock({ currentMinutes, sunrise }) {
    const before = this.scheduledAmbience().join("|");
    this.currentMinutes = Number(currentMinutes);
    this.sunrise = Number(sunrise);
    const after = this.scheduledAmbience().join("|");
    this.activeAmbienceKey = after;
    if (before !== after) this.restartEnvironment();
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
state.immersive = new ImmersiveScene({
  canvas: $("#immersive-scene"),
  stage: $("#map-stage"),
  buildings: config.buildings
});
state.surfaceMotion = new SurfaceMotion({ canvas: $("#surface-motion"), stage: $("#map-stage") });

function t(key) {
  const language = state.settings.language || "en";
  return i18n[language]?.[key] || i18n.en[key] || key;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(state.user?.guest ? { "X-Village-Guest": "1" } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

const CLARIFICATION_TEXT = {
  en: {
    legal_issue: "Which legal issue is most important for this search?",
    format: "Do you prefer small-group, 1-on-1, sensory-friendly, online, or in-person support?",
    life_stage: "Which age or life stage should Waffles prioritize?",
    priority: "Which detail should Waffles prioritize for this search?",
    "Disability rights": "Disability rights", Medicaid: "Medicaid", Conservatorship: "Conservatorship", Guardianship: "Guardianship", "Regional Center support": "Regional Center support",
    "Small group": "Small group", "1-on-1": "1-on-1", "Sensory-friendly": "Sensory-friendly", Online: "Online", "In person": "In person", Adult: "Adult", "All ages": "All ages",
    "Most relevant match": "Most relevant match", "Low cost": "Low cost", "Available soon": "Available soon", "Local/in-person": "Local/in-person"
  },
  zh: {
    legal_issue: "这次搜索最重要的法律议题是什么？",
    format: "你更偏好小组、1 对 1、低感官刺激、线上，还是线下支持？",
    life_stage: "Waffles 应该优先考虑哪个年龄或人生阶段？",
    priority: "这次搜索最应该优先考虑哪一项？",
    "Disability rights": "残障权益", Medicaid: "Medicaid / 医疗补助", Conservatorship: "监护/保佐相关", Guardianship: "监护权相关", "Regional Center support": "区域中心支持",
    "Small group": "小组", "1-on-1": "1 对 1", "Sensory-friendly": "低感官刺激", Online: "线上", "In person": "线下", Adult: "成人", "All ages": "所有年龄",
    "Most relevant match": "最相关", "Low cost": "低费用", "Available soon": "近期可用", "Local/in-person": "本地/线下"
  },
  es: {
    legal_issue: "¿Qué tema legal es más importante para esta búsqueda?",
    format: "¿Prefieres apoyo en grupo pequeño, 1 a 1, sensorialmente amable, en línea o presencial?",
    life_stage: "¿Qué edad o etapa debe priorizar Waffles?",
    priority: "¿Qué detalle debe priorizar Waffles en esta búsqueda?",
    "Disability rights": "Derechos de discapacidad", Medicaid: "Medicaid", Conservatorship: "Curatela", Guardianship: "Tutela", "Regional Center support": "Apoyo del Regional Center",
    "Small group": "Grupo pequeño", "1-on-1": "1 a 1", "Sensory-friendly": "Sensorialmente amable", Online: "En línea", "In person": "Presencial", Adult: "Adulto", "All ages": "Todas las edades",
    "Most relevant match": "Coincidencia más relevante", "Low cost": "Bajo costo", "Available soon": "Disponible pronto", "Local/in-person": "Local/presencial"
  }
};

function translatedClarification(value, id = "") {
  const language = state.settings.language || "en";
  return CLARIFICATION_TEXT[language]?.[id] || CLARIFICATION_TEXT[language]?.[value] || CLARIFICATION_TEXT.en[id] || value;
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
  $("#forgot-password-button").classList.toggle("hidden", mode !== "login");
  $("#auth-error").classList.remove("form-success");
  $("#auth-error").textContent = "";
}

function openPasswordReset() {
  const email = $("#auth-form [name='email']").value;
  $("#password-request-form [name='email']").value = email;
  $("#auth-tabs").classList.add("hidden");
  $("#auth-form").classList.add("hidden");
  $("#auth-guest-entry").classList.add("hidden");
  $("#auth-privacy").classList.add("hidden");
  $("#password-reset-card").classList.remove("hidden");
  $("#password-request-form").classList.remove("hidden");
  $("#password-confirm-form").classList.add("hidden");
  $("#password-request-status").textContent = "";
  $("#password-confirm-status").textContent = "";
}

function closePasswordReset() {
  $("#password-reset-card").classList.add("hidden");
  $("#auth-tabs").classList.remove("hidden");
  $("#auth-form").classList.remove("hidden");
  $("#auth-guest-entry").classList.remove("hidden");
  $("#auth-privacy").classList.remove("hidden");
  setAuthMode("login");
}

async function submitPasswordRequest(event) {
  event.preventDefault();
  const form = event.target;
  const button = form.querySelector("button[type='submit']");
  const status = $("#password-request-status");
  const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
  button.disabled = true;
  status.classList.remove("form-success");
  status.textContent = "Sending a secure code…";
  try {
    const response = await api("/api/auth/password/request", { method: "POST", body: JSON.stringify({ email }) });
    if (!response.deliveryAvailable) {
      status.textContent = "Email delivery is not configured yet. Please ask the site administrator for help.";
      return;
    }
    $("#password-email-sender").textContent = response.senderAddress
      ? `The verification email will come from ${response.senderAddress}. If it does not appear, check Spam or Junk.`
      : "The verification email will come from the It Takes a Village Gmail account. If it does not appear, check Spam or Junk.";
    state.passwordResetEmail = email;
    $("#password-reset-email").textContent = email;
    $("#password-request-form").classList.add("hidden");
    $("#password-confirm-form").classList.remove("hidden");
    $("#password-confirm-form [name='code']").focus();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

async function submitPasswordConfirm(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  const status = $("#password-confirm-status");
  if (password !== String(data.get("passwordConfirm") || "")) {
    status.textContent = "The two passwords do not match.";
    return;
  }
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  status.textContent = "Checking the code…";
  try {
    await api("/api/auth/password/confirm", { method: "POST", body: JSON.stringify({ email: state.passwordResetEmail, code: data.get("code"), password }) });
    const email = state.passwordResetEmail;
    closePasswordReset();
    $("#auth-form [name='email']").value = email;
    $("#auth-error").classList.add("form-success");
    $("#auth-error").textContent = "Password reset complete. Log in with your new password.";
    form.reset();
  } catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
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

async function continueAsGuest() {
  try {
    const { user } = await api("/api/auth/guest", { method: "POST", body: "{}" });
    state.user = user;
    routeForUser();
    toast("Guest visit started. Community chat stays locked until you create an account.");
  } catch (error) { $("#auth-error").textContent = error.message; }
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

function renderAccountStatus() {
  const guest = Boolean(state.user?.guest);
  $("#record-status-title").textContent = t(guest ? "guestReady" : "personalReady");
  $("#record-status-detail").textContent = t(guest ? "guestMatch" : "personalMatch");
  $("#record-status-action").textContent = t(guest ? "account" : "view");
}

function renderBuildings() {
  const layer = $("#building-layer");
  const buildingLabel = (building) => building.type === "ai" ? t(String(building.topic || "Education").toLowerCase()) : t(building.type === "activity" ? "activities" : building.type);
  const hitPolygon = (building) => Array.isArray(building.hitPolygon)
    ? `polygon(${building.hitPolygon.map(([x, y]) => `${Number(x)}% ${Number(y)}%`).join(", ")})`
    : "polygon(0 0, 100% 0, 100% 100%, 0 100%)";
  const outlinePoints = (building) => Array.isArray(building.hitPolygon)
    ? building.hitPolygon.map(([x, y]) => `${Number(x)},${Number(y)}`).join(" ")
    : "0,0 100,0 100,100 0,100";
  layer.innerHTML = config.buildings.map((building) => `
    <button class="building map-hotspot" type="button" style="--building-x:${building.x}%;--building-y:${building.y}%;--building-x-3d:${building.x3d ?? building.x}%;--building-y-3d:${building.y3d ?? building.y}%;--hotspot-width:${building.hitWidth || 14}%;--hotspot-height:${building.hitHeight || 18}%;--hit-polygon:${hitPolygon(building)}" data-building="${escapeHtml(building.id)}" data-island="${building.island}" data-type="${building.type}" data-topic="${escapeHtml(String(building.topic || "").toLowerCase())}" data-map-label="${escapeHtml(building.mapLabel || building.short)}" data-label="${escapeHtml(`${building.mapLabel || building.short} · ${buildingLabel(building)}`)}" aria-label="${escapeHtml(`${building.mapLabel || building.short}, ${buildingLabel(building)}`)} · ${building.island === "autism" ? t("autismIsland") : t("adhdIsland")}">
      <svg class="hotspot-outline" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><polygon points="${escapeHtml(outlinePoints(building))}"></polygon></svg>
      <span class="building-ground" aria-hidden="true"></span>
      <span class="building-icon" aria-hidden="true">${escapeHtml(building.icon)}</span>
    </button>`).join("");
}

function applyIslandFocus(island) {
  state.selectedIsland = island;
  const stage = $("#map-stage");
  stage.classList.remove("focus-autism", "focus-adhd");
  stage.classList.add(`focus-${island}`);
  $("#reset-map").classList.remove("hidden");
  $(".map-hint").textContent = `${t("chooseBuilding")} · ${island === "autism" ? t("autismIsland") : t("adhdIsland")}`;
  $("#map-image").alt = `${island === "autism" ? t("autismIsland") : t("adhdIsland")} illustrated village map`;
  state.audio?.scheduleAnimal();
  speakVillage(island === "autism"
    ? "This is Autism Island, a quieter garden for support, education, rights, recreation, and community activities."
    : "This is ADHD Island, a momentum trail with places for learning support, legal advocacy, recreation, contact help, and activities.");
}

function selectIsland(island) {
  if (!['autism', 'adhd'].includes(island)) return;
  const overlay = $("#island-transition");
  const islandName = island === "autism" ? t("autismIsland") : t("adhdIsland");
  if (!overlay || state.settings.calm) return applyIslandFocus(island);
  $("#transition-island-name").textContent = `Entering ${islandName}`;
  overlay.classList.remove("hidden", "disperse");
  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
  window.setTimeout(() => applyIslandFocus(island), 620);
  window.setTimeout(() => overlay.classList.add("disperse"), 820);
  window.setTimeout(() => { overlay.classList.add("hidden"); overlay.classList.remove("active", "disperse"); overlay.setAttribute("aria-hidden", "true"); }, 1550);
}

function resetMap() {
  state.selectedIsland = null;
  $("#map-stage").classList.remove("focus-autism", "focus-adhd");
  $("#reset-map").classList.add("hidden");
  $("#map-image").alt = "Two illustrated green islands connected by a wooden bridge";
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
  clearInterval(state.communityTimer);
  state.communityTimer = null;
  state.communityRoom = null;
  $("#panel").classList.remove("open");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#panel-scrim").classList.remove("open");
}

function supportIcon(name) {
  if (name === "phone") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 4.6 4.8c-.8.4-1.2 1.3-1 2.2 1.4 6.7 6.7 12 13.4 13.4.9.2 1.8-.2 2.2-1l1.3-2.6-4.2-2-1.4 2c-3.4-1.2-6.5-4.3-7.7-7.7l2-1.4-2-4.2Z"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`;
}

function resourceSearchForm(topic = "Support") {
  const examples = topic === "Support" ? "For example: I need affordable family support, respite care, or a local parent group…" : "Describe what kind of resource would help…";
  return `<div class="ai-shell support-search-shell"><div class="support-search-intro"><h3>${escapeHtml(t("supportSearchTitle"))}</h3><p>${escapeHtml(t("supportSearchIntro"))}</p></div><form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}"></textarea></label><label class="result-count">${escapeHtml(t("resultCount"))}<select name="count">${[3,4,5,6,7,8,9,10].map((value) => `<option value="${value}" ${value === Number(state.settings.resourceCount || 5) ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form><div id="ai-results"></div><p class="privacy-note">${escapeHtml(t("aiDisclaimer"))}</p></div>`;
}

function supportPanel(tab = state.supportTab, island = state.supportIsland || state.selectedIsland) {
  state.supportTab = tab;
  state.supportIsland = island;
  state.currentTopic = "Caregiver Support";
  state.currentDiagnosis = island === "autism" ? "Autism" : island === "adhd" ? "ADHD" : "";
  const phoneContent = `<p class="panel-intro">${escapeHtml(config.support.intro)}</p>
      <article class="community-launch"><div><small>${escapeHtml(t("communityTitle"))}</small><h3>${escapeHtml(t("communityIntro"))}</h3><p>${escapeHtml(t("communityPrivacy"))}</p></div><button type="button" class="primary-button" data-action="open-community">${escapeHtml(t("communityOpen"))} →</button></article>
      <div class="card-list">${config.support.contacts.map((contact) => `<article class="info-card"><div><h3>${escapeHtml(contact.title)}</h3><p>${escapeHtml(contact.detail)}</p></div><a href="${escapeHtml(contact.href)}" target="${contact.href.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">${escapeHtml(contact.action)} →</a></article>`).join("")}</div>
      <h3>${escapeHtml(t("prepare"))}</h3><ul class="gentle-list">${config.support.options.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>`;
  openPanel({
    title: t("supportTitle"),
    eyebrow: t("supportEyebrow"),
    html: `<div class="support-shell">${tab === "search" ? resourceSearchForm("Support") : phoneContent}<nav class="support-dock" aria-label="Support options"><button type="button" class="${tab === "phone" ? "active" : ""}" data-action="support-tab" data-support-tab="phone">${supportIcon("phone")}<span>${escapeHtml(t("supportContactTab"))}</span></button><button type="button" class="${tab === "search" ? "active" : ""}" data-action="support-tab" data-support-tab="search">${supportIcon("search")}<span>${escapeHtml(t("supportFindTab"))}</span></button></nav></div>`
  });
}

function communityFriendChoices(data, field) {
  return (data.directRooms || []).map((friend) => `<label class="friend-choice"><input type="checkbox" name="${field}" value="${escapeHtml(friend.user_id)}"> ${escapeHtml(friend.name)}</label>`).join("") || `<small>Add a friend before choosing specific people.</small>`;
}

function communityPostsHtml(posts = []) {
  return posts.map((post) => `<article class="community-post"><header><strong>${escapeHtml(post.author)}</strong><time>${escapeHtml(new Date(post.createdAt).toLocaleString())}</time></header>${post.body ? `<p>${escapeHtml(post.body)}</p>` : ""}${post.imageDataUrl ? `<img src="${escapeHtml(post.imageDataUrl)}" alt="Image shared by ${escapeHtml(post.author)}">` : ""}${post.mine ? `<button type="button" class="text-button" data-action="delete-community-post" data-post-id="${escapeHtml(post.id)}">Delete post</button>` : ""}</article>`).join("") || `<p class="community-empty">No friend posts yet.</p>`;
}

function communityNavIcon(tab) {
  if (tab === "direct") return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="10" r="4"/><circle cx="22" cy="10" r="4"/><path d="M3.5 24c.8-5 3.2-7.5 6.5-7.5s5.7 2.5 6.5 7.5M15.5 24c.8-5 3.2-7.5 6.5-7.5s5.7 2.5 6.5 7.5"/><path d="M12 7h8"/></svg>`;
  if (tab === "groups") return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="5" r="3"/><circle cx="27" cy="16" r="3"/><circle cx="16" cy="27" r="3"/><circle cx="5" cy="16" r="3"/><circle cx="16" cy="16" r="8"/></svg>`;
  if (tab === "moments") return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10h6l2-3h8l2 3h6v16H4Z"/><circle cx="16" cy="18" r="5"/></svg>`;
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="24" height="19" rx="2"/><path d="m5 9 11 9L27 9"/></svg>`;
}

function communityOverviewHtml(data, posts = state.communityPosts, activeTab = state.communityTab) {
  if (!data.enabled) return `<div class="community-opt-in"><p>${escapeHtml(t("communityIntro"))}</p><p class="privacy-note">${escapeHtml(t("communityPrivacy"))}</p><form id="community-settings-form" class="stack-form"><label>${escapeHtml(t("communityDisplayName"))}<input name="displayName" maxlength="40" value="${escapeHtml(data.displayName || state.user?.name || "")}" required /></label><input type="hidden" name="enabled" value="true" /><button class="primary-button" type="submit">${escapeHtml(t("communityEnable"))}</button><p class="form-error" role="alert"></p></form></div>`;
  state.communityOverview = data;
  state.communityPosts = posts;
  state.communityTab = activeTab;
  const outgoingIds = new Set((data.outgoing || []).map((item) => item.user_id));
  const groupCards = (data.groups || []).map((group) => `<article class="community-room-card"><div><h4>${group.pinned ? "📌 " : ""}${escapeHtml(group.name)}</h4><p>${escapeHtml(group.description)}</p><small>${Number(group.member_count || 0)} members · ${group.system_managed ? "system group · cleans every 12 hours" : "friend group"}</small></div><div class="community-actions"><button type="button" class="secondary-button" data-action="${group.joined ? "open-community-room" : "join-community-room"}" data-room-id="${escapeHtml(group.id)}" data-room-name="${escapeHtml(group.name)}">${escapeHtml(group.joined ? t("communityOpenRoom") : t("communityJoin"))}</button>${group.joined ? `<button type="button" class="text-button" data-action="pin-community-room" data-room-id="${escapeHtml(group.id)}" data-pinned="${String(!group.pinned)}">${group.pinned ? "Unpin" : "Pin"}</button><button type="button" class="text-button" data-action="leave-community-room" data-room-id="${escapeHtml(group.id)}">Leave</button>` : ""}</div></article>`).join("") || `<p class="community-empty">No groups yet.</p>`;
  const suggestions = (data.recommendations || []).map((person) => `<article class="community-person-card"><div><strong>${escapeHtml(person.displayName)}</strong><ul>${(person.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><button type="button" class="secondary-button" ${outgoingIds.has(person.userId) ? "disabled" : `data-action="connect-community" data-user-id="${escapeHtml(person.userId)}"`}>${escapeHtml(outgoingIds.has(person.userId) ? t("communityPending") : t("communityConnect"))}</button></article>`).join("") || `<p class="community-empty">No suggestions yet.</p>`;
  const incoming = (data.incoming || []).map((request) => `<article class="community-person-card"><strong>${escapeHtml(request.display_name)}</strong><div class="community-actions"><button type="button" class="secondary-button" data-action="accept-connection" data-connection-id="${escapeHtml(request.id)}">${escapeHtml(t("communityAccept"))}</button><button type="button" class="text-button" data-action="decline-connection" data-connection-id="${escapeHtml(request.id)}">${escapeHtml(t("communityDecline"))}</button></div></article>`).join("");
  const directRooms = (data.directRooms || []).map((room) => `<article class="community-direct-room"><span class="community-avatar">${escapeHtml(String(room.name || "V").charAt(0).toUpperCase())}</span><button type="button" class="community-room-open" data-action="open-community-room" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}"><strong>${room.pinned ? "📌 " : ""}${escapeHtml(room.name)}</strong><small>${escapeHtml(room.email || t("communityOpenRoom"))}</small></button><div class="community-actions"><button type="button" class="text-button" data-action="pin-community-room" data-room-id="${escapeHtml(room.id)}" data-pinned="${String(!room.pinned)}">${room.pinned ? "Unpin" : "Pin"}</button><button type="button" class="text-button danger" data-action="remove-community-friend" data-user-id="${escapeHtml(room.user_id)}">Remove</button><button type="button" class="text-button danger" data-action="block-community-user" data-user-id="${escapeHtml(room.user_id)}">Block</button></div></article>`).join("");
  const blocks = (data.blocks || []).map((person) => `<article class="community-person-card"><strong>${escapeHtml(person.display_name)}</strong><button type="button" class="text-button" data-action="unblock-community-user" data-user-id="${escapeHtml(person.user_id)}">Unblock</button></article>`).join("");
  const groupInvites = (data.groupInvites || []).map((invite) => `<article class="community-person-card"><div><strong>${escapeHtml(invite.room_name)}</strong><small>Invited by ${escapeHtml(invite.inviter_name)}</small><p>${escapeHtml(invite.description || "")}</p></div><div class="community-actions"><button type="button" class="secondary-button" data-action="accept-group-invite" data-invitation-id="${escapeHtml(invite.id)}">Accept</button><button type="button" class="text-button" data-action="decline-group-invite" data-invitation-id="${escapeHtml(invite.id)}">Decline</button></div></article>`).join("");
  const moments = `<section><h3>Friend moments</h3><form id="community-post-form" class="stack-form"><label>Share text<textarea name="text" maxlength="2000" rows="3" placeholder="Share something with friends…"></textarea></label><label>Optional image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-image></label><div id="community-image-preview" class="community-image-preview" aria-live="polite"></div><details><summary>Who can see this? Friends only</summary><strong>Only these friends (leave empty for all)</strong><div class="friend-choices">${communityFriendChoices(data, "allowedUserIds")}</div><strong>Hide from these friends</strong><div class="friend-choices">${communityFriendChoices(data, "deniedUserIds")}</div></details><button class="primary-button" type="submit">Post to friends</button><p class="form-error" role="alert"></p></form><div class="community-post-list">${communityPostsHtml(posts)}</div></section>`;
  const groups = `<section><div class="community-section-heading"><div><h3>${escapeHtml(t("communityGroups"))}</h3><p>Create a group and invite friends to join.</p></div></div><form id="community-group-form" class="stack-form community-create-group"><label>Group name<input name="name" maxlength="40" required></label><label>Description<textarea name="description" maxlength="240"></textarea></label><strong>Invite friends</strong><div class="friend-choices">${communityFriendChoices(data, "memberIds")}</div><button class="primary-button">Create group</button><p class="form-error" role="alert"></p></form><div class="community-grid">${groupCards}</div></section>`;
  const direct = `<section><h3>${escapeHtml(t("communityDirect"))}</h3><div class="community-direct-list">${directRooms || `<p class="community-empty">Search for a person above to add your first friend.</p>`}</div></section><section><h3>${escapeHtml(t("communitySuggestions"))}</h3><div class="community-grid">${suggestions}</div></section>`;
  const inbox = `<section><h3>Friend requests</h3><div class="community-grid">${incoming || `<p class="community-empty">No new friend requests.</p>`}</div></section><section><h3>Group invitations</h3><div class="community-grid">${groupInvites || `<p class="community-empty">No new group invitations.</p>`}</div></section>${blocks ? `<section><h3>Blocked users</h3><div class="community-grid">${blocks}</div></section>` : ""}`;
  const tabContent = activeTab === "groups" ? groups : activeTab === "moments" ? moments : activeTab === "inbox" ? inbox : direct;
  const navItems = [["direct", t("communityPrivateTab")], ["groups", t("communityGroupsTab")], ["moments", t("communityMomentsTab")], ["inbox", t("communityRequestsTab")]];
  return `<div class="community-shell"><div class="community-search-fixed"><form id="community-search-form" class="inline-form"><label class="sr-only" for="community-query">Search people</label><input id="community-query" name="query" minlength="2" placeholder="Search name or email to add friends" required><button class="secondary-button">Search</button></form><div id="community-search-results"></div></div><div class="community-account"><div><small>${escapeHtml(t("communityDisplayName"))}</small><strong>${escapeHtml(data.displayName)}</strong></div><button type="button" class="text-button" data-action="disable-community">${escapeHtml(t("communityDisable"))}</button></div><main class="community-tab-content">${tabContent}</main><p class="privacy-note">${escapeHtml(t("communitySafety"))}</p><nav class="community-dock" aria-label="Community sections">${navItems.map(([tab, label]) => `<button type="button" class="${activeTab === tab ? "active" : ""}" data-action="community-tab" data-community-tab="${tab}" aria-current="${activeTab === tab ? "page" : "false"}">${communityNavIcon(tab)}<span>${label}</span>${tab === "inbox" && ((data.incoming || []).length + (data.groupInvites || []).length) ? `<b>${(data.incoming || []).length + (data.groupInvites || []).length}</b>` : ""}</button>`).join("")}</nav></div>`;
}

async function communityPanel() {
  if (state.user?.guest) return toast("Village Community is for registered members. Create an account to join conversations.");
  clearInterval(state.communityTimer); state.communityRoom = null; state.communityPostImage = null;
  openPanel({ title: t("communityTitle"), eyebrow: t("supportEyebrow"), html: `<p class="panel-intro">${escapeHtml(t("communityLoading"))}</p>` });
  try { const [data, feed] = await Promise.all([api("/api/community"), api("/api/community/posts")]); state.communityPosts = feed.posts || []; $("#panel-content").innerHTML = communityOverviewHtml(data, state.communityPosts); }
  catch (error) { $("#panel-content").innerHTML = `<p class="form-error" role="alert">${escapeHtml(error.message)}</p>`; }
}

function communityMessagesHtml(messages = []) {
  if (!messages.length) return `<p class="community-empty">${escapeHtml(t("communityEmpty"))}</p>`;
  const stickers = { wave: "👋", love: "🫶", laugh: "😂", celebrate: "🎉", hug: "🤗", yes: "👍", cry: "😭", paws: "🐾" };
  return messages.map((message) => {
    const sticker = String(message.body || "").match(/^\[\[sticker:([a-z]+)\]\]$/)?.[1];
    return `<article class="community-message ${message.mine ? "mine" : ""} ${sticker ? "sticker-message" : ""}"><header><strong>${escapeHtml(message.author)}</strong><time>${escapeHtml(new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time></header>${sticker && stickers[sticker] ? `<div class="chat-sticker" role="img" aria-label="${escapeHtml(sticker)} sticker">${stickers[sticker]}</div>` : `<p>${escapeHtml(message.body)}</p>`}</article>`;
  }).join("");
}

function groupMemberControls(data) {
  if (data.room.kind !== "group") return "";
  const members = data.members || [];
  const memberIds = new Set(members.map((member) => member.userId));
  const memberButtons = members.map((member) => {
    const mention = String(member.displayName || "member").trim().replace(/\s+/g, "_");
    return `<button type="button" class="member-chip" data-action="mention-member" data-mention="@${escapeHtml(mention)}"><span>${escapeHtml(member.displayName)}</span>${member.role === "moderator" ? `<small>admin</small>` : ""}</button>`;
  }).join("");
  const eligibleFriends = (state.communityOverview?.directRooms || []).filter((friend) => !memberIds.has(friend.user_id));
  const invitationChoices = eligibleFriends.map((friend) => `<label class="friend-choice"><input type="checkbox" name="memberIds" value="${escapeHtml(friend.user_id)}"> ${escapeHtml(friend.name)}</label>`).join("");
  return `<section class="group-members"><div class="community-section-heading"><h3>Members (${members.length})</h3><p>Click a name to mention them in your message.</p></div><div class="member-chips"><button type="button" class="member-chip everyone" data-action="mention-member" data-mention="@everyone"><span>@everyone</span></button>${memberButtons}</div><details class="group-invite"><summary>Invite more friends</summary>${invitationChoices ? `<form id="community-room-invite-form" class="stack-form"><div class="friend-choices">${invitationChoices}</div><button type="submit" class="secondary-button">Send group invitation</button><p class="form-error" role="alert"></p></form>` : `<p class="community-empty">All of your current friends are already members.</p>`}</details></section>`;
}

async function refreshCommunityRoom() {
  if (!state.communityRoom) return;
  try {
    const data = await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`);
    const list = $("#community-message-list");
    if (list && state.communityRoom?.id === data.room.id) list.innerHTML = communityMessagesHtml(data.messages);
  } catch {}
}

async function openCommunityRoom(roomId, roomName) {
  clearInterval(state.communityTimer);
  const data = await api(`/api/community/rooms/${encodeURIComponent(roomId)}/messages`);
  state.communityRoom = { ...data.room, id: roomId, name: roomName || data.room.name };
  const roomActions = `<div class="community-room-toolbar"><button type="button" class="text-button" data-action="pin-community-room" data-room-id="${escapeHtml(roomId)}" data-pinned="${String(!data.room.pinned)}">${data.room.pinned ? "Unpin" : "Pin"}</button><button type="button" class="text-button" data-action="clear-community-history" data-room-id="${escapeHtml(roomId)}">Clear my history</button>${data.room.kind === "group" ? `<button type="button" class="text-button danger" data-action="leave-community-room" data-room-id="${escapeHtml(roomId)}">Leave group</button>` : `<button type="button" class="text-button danger" data-action="remove-community-friend" data-user-id="${escapeHtml(data.room.otherUserId || "")}">Remove friend</button><button type="button" class="text-button danger" data-action="block-community-user" data-user-id="${escapeHtml(data.room.otherUserId || "")}">Block</button>`}</div>`;
  const stickerButtons = [["wave","👋"],["love","🫶"],["laugh","😂"],["celebrate","🎉"],["hug","🤗"],["yes","👍"],["cry","😭"],["paws","🐾"]].map(([key, emoji]) => `<button type="button" data-action="send-sticker" data-sticker="${key}" aria-label="Send ${key} sticker">${emoji}</button>`).join("");
  openPanel({ title: roomName || data.room.name, eyebrow: t("communityTitle"), html: `<div class="community-chat"><button type="button" class="text-button" data-action="open-community">← ${escapeHtml(t("communityTitle"))}</button>${roomActions}${data.room.systemManaged ? `<p class="privacy-note">This system group automatically deletes shared messages older than 12 hours.</p>` : `<p class="privacy-note">Clearing history hides earlier messages only for you.</p>`}${groupMemberControls(data)}<div id="community-message-list" class="community-message-list" aria-live="polite">${communityMessagesHtml(data.messages)}</div><div class="sticker-picker" aria-label="Stickers">${stickerButtons}</div><form id="community-message-form" class="community-message-form"><input type="hidden" name="roomId" value="${escapeHtml(roomId)}"/><label><span class="sr-only">${escapeHtml(t("communityMessagePlaceholder"))}</span><textarea name="message" maxlength="1000" rows="2" placeholder="${escapeHtml(t("communityMessagePlaceholder"))}" required></textarea></label><button type="submit" class="primary-button">${escapeHtml(t("communitySend"))}</button><p class="form-error" role="alert"></p></form><p class="privacy-note">${escapeHtml(t("communitySafety"))}</p></div>` });
  state.communityTimer = setInterval(refreshCommunityRoom, 5000);
}

async function submitCommunitySettings(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);
  try {
    await api("/api/community/settings", { method: "POST", body: JSON.stringify({ enabled: formData.get("enabled") === "true", displayName: formData.get("displayName") }) });
    await communityPanel();
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityMessage(event) {
  event.preventDefault();
  const form = event.target;
  const message = new FormData(form).get("message");
  try {
    await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ message }) });
    form.reset();
    await refreshCommunityRoom();
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunitySearch(event) {
  event.preventDefault();
  const query = new FormData(event.target).get("query");
  try {
    const data = await api(`/api/community/search?q=${encodeURIComponent(query)}`);
    $("#community-search-results").innerHTML = (data.people || []).map((person) => {
      const action = person.relationship === "friend" ? `<button type="button" class="secondary-button" data-action="open-friend-chat" data-user-id="${escapeHtml(person.user_id)}">Open chat</button>` : person.relationship === "outgoing" ? `<button type="button" class="secondary-button" disabled>Request sent</button>` : person.relationship === "incoming" ? `<button type="button" class="secondary-button" data-action="accept-connection" data-connection-id="${escapeHtml(person.connection_id || "")}">Accept request</button>` : `<button type="button" class="secondary-button" data-action="connect-community" data-user-id="${escapeHtml(person.user_id)}">Add friend</button>`;
      return `<article class="community-person-card"><div><strong>${escapeHtml(person.display_name)}</strong><small>${escapeHtml(person.email)}</small></div>${action}</article>`;
    }).join("") || `<p class="community-empty">No community member matched that name or email.</p>`;
  } catch (error) { $("#community-search-results").innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function submitCommunityGroup(event) {
  event.preventDefault();
  const form = event.target; const data = new FormData(form);
  try { await api("/api/community/groups", { method: "POST", body: JSON.stringify({ name: data.get("name"), description: data.get("description"), memberIds: data.getAll("memberIds") }) }); state.communityTab = "groups"; toast("Group created. Invitations were sent to selected friends."); await communityPanel(); }
  catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityRoomInvite(event) {
  event.preventDefault();
  const form = event.target;
  const memberIds = new FormData(form).getAll("memberIds");
  try {
    const result = await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/invite`, { method: "POST", body: JSON.stringify({ memberIds }) });
    form.reset();
    toast(result.invited ? `Sent ${result.invited} group invitation${result.invited === 1 ? "" : "s"}.` : "Those friends are already members or invited.");
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityPost(event) {
  event.preventDefault();
  const form = event.target; const data = new FormData(form);
  try { if (state.communityPostImagePromise) await state.communityPostImagePromise; await api("/api/community/posts", { method: "POST", body: JSON.stringify({ text: data.get("text"), imageDataUrl: state.communityPostImage, allowedUserIds: data.getAll("allowedUserIds"), deniedUserIds: data.getAll("deniedUserIds") }) }); state.communityPostImage = null; state.communityPostImagePromise = null; state.communityTab = "moments"; await communityPanel(); }
  catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

function handleCommunityImage(input) {
  const file = input.files?.[0]; state.communityPostImage = null;
  if (!file) return;
  if (file.size > 550000 || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) { input.value = ""; return toast("Choose a PNG, JPEG, WebP, or GIF under 550 KB."); }
  state.communityPostImagePromise = new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { state.communityPostImage = String(reader.result || ""); const preview = $("#community-image-preview"); if (preview) preview.innerHTML = `<img src="${escapeHtml(state.communityPostImage)}" alt="Photo ready to post"><small>Photo ready — it will be visible to the friends you choose.</small>`; toast("Image ready to post."); resolve(); };
    reader.onerror = () => { input.value = ""; const error = new Error("That image could not be read. Please choose it again."); reject(error); };
    reader.readAsDataURL(file);
  });
}

async function communityAction(element, action) {
  try {
    if (action === "open-community") return communityPanel();
    if (action === "community-tab") { state.communityTab = element.dataset.communityTab || "direct"; $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, state.communityTab); return; }
    if (action === "support-tab") return supportPanel(element.dataset.supportTab, state.supportIsland);
    if (action === "send-sticker") { await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ message: `[[sticker:${element.dataset.sticker}]]` }) }); return refreshCommunityRoom(); }
    if (action === "mention-member") { const textarea = $("#community-message-form textarea[name='message']"); if (!textarea) return; const mention = element.dataset.mention || ""; const spacer = textarea.value && !textarea.value.endsWith(" ") ? " " : ""; textarea.value += `${spacer}${mention} `; textarea.focus(); return; }
    if (action === "open-friend-chat") {
      const room = state.communityOverview?.directRooms?.find((item) => item.user_id === element.dataset.userId);
      if (room) return openCommunityRoom(room.id, room.name);
    }
    if (action === "join-community-room") {
      await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/join`, { method: "POST", body: "{}" });
      return openCommunityRoom(element.dataset.roomId, element.dataset.roomName);
    }
    if (action === "open-community-room") return openCommunityRoom(element.dataset.roomId, element.dataset.roomName);
    if (action === "connect-community") {
      await api("/api/community/connect", { method: "POST", body: JSON.stringify({ targetUserId: element.dataset.userId }) });
      toast(t("communityPending"));
      return communityPanel();
    }
    if (action === "accept-connection" || action === "decline-connection") {
      const decision = action === "accept-connection" ? "accept" : "decline";
      const result = await api(`/api/community/connections/${encodeURIComponent(element.dataset.connectionId)}/${decision}`, { method: "POST", body: "{}" });
      if (result.roomId) return openCommunityRoom(result.roomId, t("communityDirect"));
      return communityPanel();
    }
    if (action === "accept-group-invite" || action === "decline-group-invite") {
      const decision = action === "accept-group-invite" ? "accept" : "decline";
      const result = await api(`/api/community/group-invitations/${encodeURIComponent(element.dataset.invitationId)}/${decision}`, { method: "POST", body: "{}" });
      if (result.roomId) { toast("Group invitation accepted."); state.communityTab = "groups"; }
      return communityPanel();
    }
    if (action === "disable-community") {
      await api("/api/community/settings", { method: "POST", body: JSON.stringify({ enabled: false, displayName: state.user?.name || "Village member" }) });
      return communityPanel();
    }
    if (action === "pin-community-room") {
      await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/pin`, { method: "POST", body: JSON.stringify({ pinned: element.dataset.pinned === "true" }) });
      return state.communityRoom?.id === element.dataset.roomId ? openCommunityRoom(element.dataset.roomId, state.communityRoom.name) : communityPanel();
    }
    if (action === "clear-community-history") {
      if (!confirm("Clear this chat history only from your own view?")) return;
      await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/history`, { method: "DELETE" });
      return openCommunityRoom(element.dataset.roomId, state.communityRoom?.name);
    }
    if (action === "leave-community-room") {
      if (!confirm("Leave this group?")) return;
      await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/leave`, { method: "POST", body: "{}" });
      return communityPanel();
    }
    if (action === "remove-community-friend") {
      if (!confirm("Remove this friend and close the chat from your side?")) return;
      await api(`/api/community/friends/${encodeURIComponent(element.dataset.userId)}`, { method: "DELETE" });
      return communityPanel();
    }
    if (action === "block-community-user") {
      if (!confirm("Block this user? This also removes the friendship.")) return;
      await api(`/api/community/blocks/${encodeURIComponent(element.dataset.userId)}`, { method: "POST", body: "{}" });
      return communityPanel();
    }
    if (action === "unblock-community-user") { await api(`/api/community/blocks/${encodeURIComponent(element.dataset.userId)}`, { method: "DELETE" }); return communityPanel(); }
    if (action === "delete-community-post") { if (confirm("Delete this post?")) { await api(`/api/community/posts/${encodeURIComponent(element.dataset.postId)}`, { method: "DELETE" }); return communityPanel(); } }
  } catch (error) { toast(error.message); }
}

function settingsPanel() {
  const current = state.settings;
  const musicRows = [["day", t("dayTrack"), t("dayScoreName")], ["night", t("nightTrack"), t("nightScoreName")]].map(([slot, label, originalName]) => {
    const record = state.localMusic[slot];
    return `<div class="local-music-row"><div class="local-music-copy"><strong>${escapeHtml(label)}</strong><small title="${escapeHtml(record?.name || originalName)}">${escapeHtml(record?.name || originalName)}</small></div>
      <label class="secondary-button local-music-picker">${escapeHtml(t("chooseAudio"))}<input type="file" accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.webm" data-local-music="${slot}" /></label>
      ${record ? `<button type="button" class="text-button local-music-reset" data-action="clear-local-music" data-music-slot="${slot}">${escapeHtml(t("removeTrack"))}</button>` : ""}</div>`;
  }).join("");
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
      <div class="setting-group scene-mode-settings"><strong>${escapeHtml(t("sceneStyle"))}</strong><div class="setting-options">
        ${[["2d",t("scene2d")],["3d",t("scene3d")]].map(([value,label]) => `<button type="button" aria-pressed="${String((current.sceneMode || "2d") === value)}" class="setting-option ${(current.sceneMode || "2d") === value ? "active" : ""}" data-setting="sceneMode" data-value="${value}">${escapeHtml(label)}</button>`).join("")}
      </div><small>${escapeHtml(t("sceneHint"))}</small></div>
      <div class="setting-group"><strong>${escapeHtml(t("motion"))}</strong><button type="button" class="secondary-button" data-action="toggle-calm">${escapeHtml(document.body.classList.contains("low-stimulation") ? t("useStandard") : t("useLow"))}</button></div>
      <div class="setting-group sound-settings"><div class="sound-heading"><strong>${escapeHtml(t("sound"))}</strong><span class="sound-status">${escapeHtml(current.soundEnabled ? t("soundOn") : t("soundOff"))}</span></div>
        <button type="button" class="secondary-button sound-toggle" data-action="toggle-sound">${escapeHtml(current.soundEnabled ? t("muteSound") : t("enableSound"))}</button>
        ${[["masterVolume",t("masterVolume"),current.masterVolume ?? .35],["environmentVolume",t("environmentVolume"),current.environmentVolume ?? .65],["musicVolume",t("musicVolume"),current.musicVolume ?? .26],["animalVolume",t("animalVolume"),current.animalVolume ?? .22]].map(([key,label,value]) => `<label class="volume-control"><span>${escapeHtml(label)}</span><output>${Math.round(Number(value) * 100)}%</output><input type="range" min="0" max="1" step="0.01" value="${Number(value)}" data-volume="${key}" aria-label="${escapeHtml(label)}" /></label>`).join("")}
        <small>${escapeHtml(t("soundHint"))}</small>
        <div class="local-music-settings"><strong>${escapeHtml(t("customMusic"))}</strong>${musicRows}<small>${escapeHtml(t("musicLocalOnly"))}</small></div>
      </div>
      <div class="setting-group voice-settings"><strong>${escapeHtml(t("voiceTools"))}</strong>
        <div class="voice-toggle-grid">
          ${[["voiceAssistant",t("voiceAssistant")],["voiceControl",t("voiceControl")]].map(([key,label]) => `<button type="button" aria-pressed="${String(Boolean(current[key]))}" class="setting-option ${current[key] ? "active" : ""}" data-action="toggle-voice-setting" data-voice-setting="${key}">${escapeHtml(label)}</button>`).join("")}
        </div>
        <button type="button" class="secondary-button voice-listen" data-action="start-voice-command" ${current.voiceControl ? "" : "disabled"}>${escapeHtml(state.voiceListening ? t("voiceListening") : t("voiceListen"))}</button>
        <small>${escapeHtml(t("voiceHint"))}</small>
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

function guidePanel() {
  const guideCards = [
    [t("guideStoryTitle"), t("guideStory")],
    [t("guideBuiltByTitle"), t("guideBuiltBy")],
    [t("guideUseTitle"), t("guideUse")],
    [t("guideScoringTitle"), t("guideScoring")]
  ];
  state.lastGuideAnswer = state.lastGuideAnswer || t("guideIntro");
  openPanel({
    title: t("guideTitle"),
    eyebrow: t("guideEyebrow"),
    html: `<div class="guide-shell">
      <div class="mori-stage guide-stage"><div class="mori-character" aria-hidden="true"><span class="capy-ear left"></span><span class="capy-ear right"></span><span class="capy-eye left"></span><span class="capy-eye right"></span><span class="capy-nose"></span></div><p>${escapeHtml(t("guideIntro"))}</p></div>
      <section class="guide-chat" aria-live="polite">
        <div class="guide-message guide-message-waffles" id="guide-answer">${escapeHtml(state.lastGuideAnswer)}</div>
        <div class="guide-actions" id="guide-actions"></div>
        <form id="guide-form" class="guide-form">
          <label>${escapeHtml(t("guideQuestion"))}<textarea name="message" rows="3" minlength="2" placeholder="${escapeHtml(t("guidePlaceholder"))}"></textarea></label>
          <div class="guide-voice-row">
            <button class="primary-button" type="submit">${escapeHtml(t("guideAsk"))} <span aria-hidden="true">→</span></button>
            <button type="button" class="secondary-button" data-action="speak-guide">${escapeHtml(t("guideSpeak"))}</button>
            <button type="button" class="secondary-button" data-action="listen-guide">${escapeHtml(state.guideListening ? t("guideListening") : t("guideListen"))}</button>
          </div>
          <p id="guide-error" class="form-error" role="alert"></p>
        </form>
      </section>
      <div class="guide-card-list">${guideCards.map(([title, detail]) => `<article class="guide-card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></article>`).join("")}</div>
    </div>`
  });
  renderGuideActions([]);
  speakVillage(t("guideIntro"));
}

function renderGuideActions(actions = []) {
  const target = $("#guide-actions");
  if (!target) return;
  const valid = actions.filter((item) => item?.label && item.action !== "none").slice(0, 3);
  target.innerHTML = valid.length ? `<small>${escapeHtml(t("guideActionPrefix"))}</small>${valid.map((item) => `<button type="button" class="secondary-button guide-action-button" data-action="guide-suggestion" data-guide-suggestion="${escapeHtml(JSON.stringify(item))}">${escapeHtml(item.label)}</button>`).join("")}` : "";
}

function findGuideBuilding(action = {}) {
  const island = action.island || state.selectedIsland || "autism";
  return config.buildings.find((item) => item.id === action.buildingId)
    || config.buildings.find((item) => item.island === island && action.buildingType && item.type === action.buildingType && (!action.topic || String(item.topic || "Caregiver Support") === action.topic))
    || config.buildings.find((item) => item.island === island && action.topic && String(item.topic || "").toLowerCase() === String(action.topic).toLowerCase())
    || config.buildings.find((item) => item.island === island && action.buildingType && item.type === action.buildingType);
}

function followGuideAction(action = {}) {
  if (action.action === "open_settings") return settingsPanel();
  if (action.action === "open_record") return profilePanel();
  if (action.action === "select_island") return selectIsland(action.island || state.selectedIsland || "autism");
  if (action.action === "open_building") {
    const building = findGuideBuilding(action);
    if (!building) return toast(t("guideError"));
    return handleBuilding(building.id);
  }
}

async function askGuide(message) {
  const answer = $("#guide-answer");
  const error = $("#guide-error");
  if (error) error.textContent = "";
  if (answer) answer.textContent = t("guideThinking");
  try {
    const data = await api("/api/guide/chat", {
      method: "POST",
      body: JSON.stringify({ message, language: state.settings.language || "en", context: voiceContext() })
    });
    state.lastGuideAnswer = data.answer || t("guideIntro");
    if (answer) answer.textContent = state.lastGuideAnswer;
    renderGuideActions(data.suggestedActions || []);
    speakVillage(state.lastGuideAnswer, { force: true });
  } catch (err) {
    if (answer) answer.textContent = state.lastGuideAnswer || t("guideIntro");
    if (error) error.textContent = err.message || t("guideError");
  }
}

function submitGuide(event) {
  event.preventDefault();
  const form = event.target;
  const message = String(new FormData(form).get("message") || "").trim();
  if (!message) return;
  askGuide(message);
}

function aiPanel(topic = "Education", island = state.selectedIsland, initialDescription = "", options = {}) {
  state.currentTopic = topic;
  state.currentDiagnosis = island === "autism" ? "Autism" : island === "adhd" ? "ADHD" : "";
  const examples = topic === "Legal" ? "For example: I need help understanding a 504 plan for an 11-year-old…" : topic === "Recreation" ? "For example: I’m looking for a calm, inclusive weekend activity nearby…" : "For example: I’m looking for executive-function support for a middle-school student…";
  const descriptionValue = String(initialDescription || "").trim();
  openPanel({
    title: `${t(String(topic || "Education").toLowerCase())} · Waffles`,
    eyebrow: t("aiEyebrow"),
    html: `<div class="ai-shell">
      <div class="mori-stage"><div class="mori-character" id="mori-character"><span class="capy-ear left"></span><span class="capy-ear right"></span><span class="capy-eye left"></span><span class="capy-eye right"></span><span class="capy-nose"></span></div><div><h3>${escapeHtml(t("aiHello"))}</h3><p>${escapeHtml(t("aiExplain"))}</p></div></div>
      <form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}">${escapeHtml(descriptionValue)}</textarea></label><label class="result-count">${escapeHtml(t("resultCount"))}<select name="count">${[3,4,5,6,7,8,9,10].map((value) => `<option value="${value}" ${value === Number(state.settings.resourceCount || 5) ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form>
      <div id="ai-results"></div>
      <p class="privacy-note">${escapeHtml(t("aiDisclaimer"))}</p>
    </div>`
  });
  if (options.autoSubmit && descriptionValue.length >= 8) {
    setTimeout(() => $("#ai-form")?.requestSubmit?.(), 0);
  }
}

function resourceKey(resource) {
  return `${String(resource?.name || "").trim().toLowerCase()}|${String(resource?.url || "").trim().toLowerCase()}`;
}

function isResourceLiked(resource) {
  const key = resourceKey(resource);
  return Boolean(key.trim()) && (state.user?.likedResources || []).some((item) => resourceKey(item) === key);
}

function isResourceDisliked(resource) {
  const key = resourceKey(resource);
  return Boolean(key.trim()) && (state.user?.dislikedResources || []).some((item) => resourceKey(item) === key);
}

function translateReasonLabel(label = "") {
  const language = state.settings.language || "en";
  if (language === "en") return label;
  const text = String(label);
  const replacements = language === "zh"
    ? [["primary", "主要"], ["secondary", "补充"], ["predicted", "预测"], ["exact", "精确"], ["similar", "相似"], ["related", "相关"], ["keyword", "关键词"], ["partial", "部分"], ["tag match", "标签匹配"], ["description match", "描述匹配"], ["major issue", "主要冲突"], ["minor issue", "轻微冲突"]]
    : [["primary", "principal"], ["secondary", "secundario"], ["predicted", "predicho"], ["exact", "exacto"], ["similar", "similar"], ["related", "relacionado"], ["keyword", "palabra clave"], ["partial", "parcial"], ["tag match", "coincidencia de etiqueta"], ["description match", "coincidencia de descripción"], ["major issue", "conflicto importante"], ["minor issue", "conflicto menor"]];
  return replacements.reduce((output, [from, to]) => output.replaceAll(from, to), text);
}

function translateFilterBadge(label = "") {
  const language = state.settings.language || "en";
  if (language === "en") return label;
  const text = String(label);
  const replacements = language === "zh"
    ? [["Diagnosis", "诊断"], ["Category", "类别"], ["Life stage", "年龄阶段"], ["Description gate", "描述门槛"], ["Autism", "自闭症"], ["ADHD", "ADHD"], ["Education", "教育"], ["Legal", "法律"], ["Recreation", "休闲活动"], ["Support", "支持"]]
    : [["Diagnosis", "Diagnóstico"], ["Category", "Categoría"], ["Life stage", "Etapa"], ["Description gate", "Filtro de descripción"], ["Autism", "Autismo"], ["ADHD", "TDAH"], ["Education", "Educación"], ["Legal", "Legal"], ["Recreation", "Recreación"], ["Support", "Apoyo"]];
  return replacements.reduce((output, [from, to]) => output.replaceAll(from, to), text);
}

function gateEvidenceLabel(gate) {
  if (!gate) return "";
  const authority = gate.authority && gate.authority !== "none" ? gate.authority.replace("-", " ") : "";
  if (state.settings.language === "zh") return authority ? `${authority} 证据 · 置信度 ${gate.confidence}` : "描述证据";
  if (state.settings.language === "es") return authority ? `evidencia ${authority} · confianza ${gate.confidence}` : "evidencia de descripción";
  return authority ? `${authority} evidence · confidence ${gate.confidence}` : "description evidence";
}

function explainResource(resource) {
  const reasons = (resource.explanation || []).filter((reason) => Number(reason.points) > 0).slice(0, 3);
  const fallbackReason = state.settings.language === "zh" ? "它的描述和标签与你的搜索有重合" : state.settings.language === "es" ? "su descripción y etiquetas se relacionan con tu búsqueda" : "its description and tags overlap with your search";
  const reasonText = reasons.length
    ? reasons.map((reason) => `${translateReasonLabel(reason.label)} (${reason.keyword})`).join("; ")
    : fallbackReason;
  const language = state.settings.language || "en";
  if (language === "zh") {
    const cost = resource.price ? ` 费用提示：${resource.price}。` : "";
    const age = resource.age ? ` 这个资源标注适合 ${resource.age}。` : "";
    return `Waffles 认为 ${resource.name} 可能合适，因为 ${reasonText}。${age}${cost} 请直接向服务机构确认资格、可用性和实际匹配度。`;
  }
  if (language === "es") {
    const cost = resource.price ? ` Nota de costo: ${resource.price}.` : "";
    const age = resource.age ? ` Está listado para ${resource.age}.` : "";
    return `Waffles cree que ${resource.name} puede encajar porque ${reasonText}.${age}${cost} Confirma requisitos, disponibilidad y ajuste directamente con el proveedor.`;
  }
  const cost = resource.price ? ` Cost note: ${resource.price}.` : "";
  const age = resource.age ? ` It is listed for ${resource.age}.` : "";
  return `Waffles thinks ${resource.name} may fit because ${reasonText}.${age}${cost} Please verify eligibility, availability, and fit directly with the provider.`;
}

function parseResourcePayload(element) {
  try { return JSON.parse(element.dataset.resourceJson || "{}"); } catch { return {}; }
}

function renderSourceFooter(data, fallbackVersion = "1.0") {
  const expandedBy = data.keywordExpansion?.ai ? t("aiExpandedKeywords") : t("localExpandedKeywords");
  return `<p class="privacy-note">${escapeHtml(t("sourceLabel"))}: ${escapeHtml(data.source)} · ${escapeHtml(t("scoringLabel"))} v${escapeHtml(data.scoring?.version || fallbackVersion)} · ${escapeHtml(expandedBy)}</p>`;
}

function renderClarificationForm(questions) {
  const options = questions.flatMap((question) => question.options || []);
  const questionHtml = questions.map((question) => {
    const legend = translatedClarification(question.question, question.id);
    const optionHtml = (question.options || []).map((option) => `<label class="clarification-option"><input type="checkbox" name="confirmedKeyword" value="${escapeHtml(option)}"><span>${escapeHtml(translatedClarification(option))}</span></label>`).join("");
    return `<fieldset class="clarification-fieldset"><legend>${escapeHtml(legend)}</legend>${optionHtml}</fieldset>`;
  }).join("");
  return `<form id="clarification-form" class="ai-form clarification-form"><h3>${escapeHtml(t("clarificationTitle"))}</h3>${questionHtml}<label class="clarification-option clarification-none"><input type="checkbox" name="rejectAll" value="1"><span>${escapeHtml(t("clarificationNone"))}</span></label><input type="hidden" name="allOptions" value="${escapeHtml(JSON.stringify(options))}"><button class="primary-button" type="submit">${escapeHtml(t("clarificationContinue"))} <span aria-hidden="true">→</span></button><p class="form-error" role="alert"></p></form>`;
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
    const payload = { topic: state.currentTopic, diagnosis: state.currentDiagnosis, description, count, language: state.settings.language || "en" };
    state.pendingSearch = payload;
    const data = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify(payload) });
    if (data.needsClarification) {
      $("#ai-results").innerHTML = renderClarificationForm(data.questions || []);
      return;
    }
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    character?.classList.remove("thinking");
    character?.classList.add("celebrate");
    state.audio?.playAnimal("capybara");
    setTimeout(() => character?.classList.remove("celebrate"), 1500);
    const expanded = data.keywordExpansion?.suggested || [];
    $("#ai-results").innerHTML = `<div class="ai-response">${escapeHtml(data.answer)}</div>${expanded.length ? `<p class="keyword-expansion"><strong>${escapeHtml(t("expandedTerms"))}:</strong> ${expanded.map(escapeHtml).join(" · ")}</p>` : ""}<div class="card-list">${data.resources.map(resourceCard).join("")}</div>${renderSourceFooter(data, "1.0")}`;
  } catch (error) {
    $("#ai-error").textContent = error.message;
    character?.classList.remove("thinking");
  } finally {
    button.disabled = false;
    button.innerHTML = `${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span>`;
  }
}

async function submitClarification(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const confirmedSecondaryKeywords = data.getAll("confirmedKeyword");
  const rejectAll = data.get("rejectAll") === "1";
  if (!confirmedSecondaryKeywords.length && !rejectAll) {
    form.querySelector(".form-error").textContent = t("clarificationRequired");
    return;
  }
  const allOptions = JSON.parse(data.get("allOptions") || "[]");
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try {
    const payload = { ...state.pendingSearch, language: state.settings.language || "en", clarificationHandled: true, confirmedSecondaryKeywords, rejectedKeywords: rejectAll ? allOptions : [] };
    const response = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify(payload) });
    const expanded = response.keywordExpansion?.suggested || [];
    $("#ai-results").innerHTML = `<div class="ai-response">${escapeHtml(response.answer)}</div>${expanded.length ? `<p class="keyword-expansion"><strong>${escapeHtml(t("expandedTerms"))}:</strong> ${expanded.map(escapeHtml).join(" · ")}</p>` : ""}<div class="card-list">${response.resources.map(resourceCard).join("")}</div>${renderSourceFooter(response, "2.1")}`;
  } catch (error) {
    form.querySelector(".form-error").textContent = error.message;
    button.disabled = false;
  }
}

function resourceCard(resource) {
  const categories = [...(resource.categories || []), ...(resource.tags || [])].slice(0, 5);
  const reasons = resource.explanation || [];
  const passedFilters = resource.passedFilters || [];
  const gate = resource.gateEvidence;
  const gateLabel = gateEvidenceLabel(gate);
  const saved = isResourceLiked(resource);
  const disliked = isResourceDisliked(resource);
  const resourceJson = escapeHtml(JSON.stringify({ ...resource, topic: state.currentTopic }));
  return `<article class="resource-card ${saved ? "liked" : ""} ${disliked ? "disliked" : ""}" data-resource-card data-resource-key="${escapeHtml(resourceKey(resource))}">
    <div class="resource-heading"><div><small>${escapeHtml(resource.location || "See website")}</small><h3>${escapeHtml(resource.name)}</h3></div><span class="score-badge">${escapeHtml(String(resource.score ?? 0))} pts</span></div>
    <p>${escapeHtml(resource.description)}</p>
    <div class="resource-meta"><span>${escapeHtml(resource.age || "All ages")}</span><span>${escapeHtml(resource.price || "See website")}</span>${categories.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    ${passedFilters.length ? `<div class="filter-badges" aria-label="Passed recommendation filters">${passedFilters.map((item) => `<span>✓ ${escapeHtml(translateFilterBadge(item))}</span>`).join("")}${gate ? `<span class="gate-evidence">${escapeHtml(gateLabel)}</span>` : ""}</div>` : ""}
    <div class="resource-actions">
      <button type="button" class="secondary-button resource-explain-button" data-action="explain-resource" data-resource-json='${resourceJson}'>${escapeHtml(t("resourceExplain"))}</button>
      <button type="button" class="secondary-button resource-like-button ${saved ? "active" : ""}" data-action="like-resource" data-liked="${String(saved)}" data-resource-json='${resourceJson}'>${escapeHtml(saved ? t("resourceLiked") : t("resourceLike"))}</button>
      <button type="button" class="secondary-button resource-dislike-button ${disliked ? "active" : ""}" data-action="dislike-resource" data-disliked="${String(disliked)}" data-resource-json='${resourceJson}'>${escapeHtml(disliked ? t("resourceDisliked") : t("resourceDislike"))}</button>
      <a href="${escapeHtml(resource.url)}" target="_blank" rel="noreferrer">${escapeHtml(t("resourceVisit"))}</a>
    </div>
    <div class="resource-explanation" hidden></div>
    ${reasons.length ? `<details class="score-details"><summary>${escapeHtml(t("scoreWhy"))}</summary><ul>${reasons.map((reason) => `<li><b class="${reason.points < 0 ? "negative" : "positive"}">${reason.points > 0 ? "+" : ""}${escapeHtml(String(reason.points))}</b> ${escapeHtml(reason.label)} · “${escapeHtml(reason.keyword)}”</li>`).join("")}</ul></details>` : ""}
  </article>`;
}

function syncResourceCardState(card, resource) {
  if (!card) return;
  const saved = isResourceLiked(resource);
  const disliked = isResourceDisliked(resource);
  card.classList.toggle("liked", saved);
  card.classList.toggle("disliked", disliked);
  const likeButton = card.querySelector('[data-action="like-resource"]');
  if (likeButton) {
    likeButton.dataset.liked = String(saved);
    likeButton.classList.toggle("active", saved);
    likeButton.textContent = saved ? t("resourceLiked") : t("resourceLike");
  }
  const dislikeButton = card.querySelector('[data-action="dislike-resource"]');
  if (dislikeButton) {
    dislikeButton.dataset.disliked = String(disliked);
    dislikeButton.classList.toggle("active", disliked);
    dislikeButton.textContent = disliked ? t("resourceDisliked") : t("resourceDislike");
  }
}

function showResourceExplanation(element) {
  const resource = parseResourcePayload(element);
  const card = element.closest("[data-resource-card]");
  const target = card?.querySelector(".resource-explanation");
  if (!target) return;
  const explanation = explainResource(resource);
  target.hidden = false;
  target.textContent = explanation;
  speakVillage(explanation);
}

async function toggleResourceLike(element) {
  const resource = parseResourcePayload(element);
  const liked = element.dataset.liked !== "true";
  try {
    const data = await api("/api/resources/like", { method: "POST", body: JSON.stringify({ resource, liked }) });
    if (state.user) state.user.likedResources = data.likedResources || [];
    if (state.user) state.user.dislikedResources = data.dislikedResources || [];
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    const card = element.closest("[data-resource-card]");
    syncResourceCardState(card, resource);
    const message = liked ? t("resourceSaved") : t("resourceUnsaved");
    toast(message);
    speakVillage(message);
  } catch (error) {
    toast(error.message);
  }
}

async function toggleResourceDislike(element) {
  const resource = parseResourcePayload(element);
  const disliked = element.dataset.disliked !== "true";
  try {
    const data = await api("/api/resources/dislike", { method: "POST", body: JSON.stringify({ resource, disliked }) });
    if (state.user) state.user.likedResources = data.likedResources || [];
    if (state.user) state.user.dislikedResources = data.dislikedResources || [];
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    const card = element.closest("[data-resource-card]");
    syncResourceCardState(card, resource);
    const message = disliked ? t("resourceDislikeSaved") : t("resourceDislikeRemoved");
    toast(message);
    speakVillage(message);
  } catch (error) {
    toast(error.message);
  }
}

function recordResourceList(resources, emptyKey) {
  const list = Array.isArray(resources) ? resources : [];
  if (!list.length) return `<p class="record-empty">${escapeHtml(t(emptyKey))}</p>`;
  return `<div class="record-resource-list">${list.map((resource) => `<article class="record-resource-item">
    <div><small>${escapeHtml(resource.topic || resource.location || "Resource")}</small><strong>${escapeHtml(resource.name || "Untitled resource")}</strong><p>${escapeHtml(resource.description || resource.url || "")}</p></div>
    <a href="${escapeHtml(resource.url || "#")}" target="_blank" rel="noreferrer">${escapeHtml(t("resourceVisit"))}</a>
  </article>`).join("")}</div>`;
}

function profilePanel() {
  if (state.user?.guest) return openPanel({ title: "Guest visit", eyebrow: "Temporary access", html: `<p class="panel-intro">You can explore both islands and use resource search during this visit.</p><article class="record-card"><strong>Community is locked for guests</strong><p>Create an account to save a personal record, post Moments, join group chats, or message friends.</p></article><button type="button" class="primary-button" data-action="logout">Create or log in to an account</button>` });
  const profile = state.user?.profile;
  const history = state.user?.history || [];
  const likedResources = state.user?.likedResources || [];
  const dislikedResources = state.user?.dislikedResources || [];
  openPanel({
    title: t("recordTitle"),
    eyebrow: state.user?.name || "Village visitor",
    html: `<p class="panel-intro">${escapeHtml(t("recordIntro"))}</p>
      <div class="sync-badge ${state.sheetSync.configured ? "connected" : "missing"}">${escapeHtml(state.sheetSync.configured ? t("sheetConnected") : t("sheetMissing"))}</div>
      <div class="record-summary">${escapeHtml(profile?.summary || "Complete the Community Compass to create your record.")}</div>
      <div class="card-list"><article class="record-card"><strong>${escapeHtml(t("recentSearches"))}</strong><ul class="gentle-list">${history.length ? history.slice(-5).reverse().map((item) => `<li><strong>${escapeHtml(item.topic)}</strong> · ${escapeHtml(item.description)}</li>`).join("") : `<li>${escapeHtml(t("noSearches"))}</li>`}</ul></article>
      <article class="record-card resource-record-card"><strong>${escapeHtml(t("savedResourcesTitle"))}</strong>${recordResourceList(likedResources, "noSavedResources")}</article>
      <article class="record-card resource-record-card"><strong>${escapeHtml(t("dislikedResourcesTitle"))}</strong>${recordResourceList(dislikedResources, "noDislikedResources")}</article></div>
      <form id="feedback-form" class="feedback-form"><label>${escapeHtml(t("feedbackLabel"))}<textarea name="feedback" rows="4" placeholder="What felt helpful or confusing?">${escapeHtml(state.user?.feedback || "")}</textarea></label><button class="secondary-button" type="submit">${escapeHtml(t("feedbackSave"))}</button><p id="feedback-status" role="status"></p></form>
      <button class="text-button" data-action="logout">${escapeHtml(t("logout"))}</button>`
  });
}

function handleBuilding(id) {
  const building = config.buildings.find((item) => item.id === id);
  if (!building) return;
  if (state.selectedIsland !== building.island) {
    selectIsland(building.island);
    return;
  }
  clearInterval(state.communityTimer);
  state.communityTimer = null;
  state.communityRoom = null;
  const buildingSpeech = `${building.mapLabel || building.short}. ${building.label}. ${building.type === "support" ? "This opens contact options, community conversations, and support resources." : building.type === "activity" ? "This opens upcoming village activities and volunteer opportunities." : "This opens Waffles resource search for this topic."}`;
  speakVillage(buildingSpeech);
  if (building.type === "support") supportPanel("phone", building.island);
  if (building.type === "activity") activitiesPanel();
  if (building.type === "ai") aiPanel(building.topic, building.island);
}

function applySettings() {
  state.settings = { fontSize: "normal", theme: "sage", language: "en", sceneMode: "2d", calm: false, soundEnabled: false, voiceAssistant: false, voiceControl: false, masterVolume: .35, environmentVolume: .65, musicVolume: .26, animalVolume: .22, resourceCount: 5, ...state.settings };
  const { fontSize, theme, language, sceneMode, calm } = state.settings;
  const scales = { small: ".9", normal: "1", large: "1.12", xlarge: "1.25" };
  document.documentElement.style.setProperty("--font-scale", scales[fontSize] || "1");
  document.body.classList.remove("theme-sage", "theme-blue", "theme-plum", "theme-high");
  document.body.classList.add(`theme-${theme}`);
  document.body.dataset.fontSize = fontSize;
  document.body.classList.toggle("low-stimulation", Boolean(calm));
  document.body.classList.toggle("scene-3d", sceneMode === "3d");
  document.body.classList.toggle("scene-2d", sceneMode !== "3d");
  $("#calm-toggle")?.setAttribute("aria-pressed", String(Boolean(calm)));
  const dictionary = i18n[language] || i18n.en;
  $$('[data-i18n]').forEach((element) => { element.textContent = dictionary[element.dataset.i18n] || i18n.en[element.dataset.i18n]; });
  document.documentElement.lang = language;
  if ($("#building-layer")) renderBuildings();
  if ($(".map-hint") && !state.selectedIsland) $(".map-hint").innerHTML = `<span aria-hidden="true">↖</span> ${escapeHtml(t("selectIsland"))}`;
  renderEnvironmentStatus();
  state.ecosystem?.setCalm(calm);
  state.ecosystem?.setSceneMode(sceneMode);
  state.immersive?.setReducedMotion(calm);
  state.immersive?.setEnabled(sceneMode === "3d");
  state.surfaceMotion?.setReducedMotion(calm);
  state.surfaceMotion?.setEnabled(sceneMode !== "3d");
  state.audio?.setSceneMode?.(sceneMode);
  state.audio?.applySettings();
  if (state.user) renderAccountStatus();
  localStorage.setItem("capy-settings", JSON.stringify(state.settings));
}

function updateSetting(key, value) {
  state.settings[key] = value;
  applySettings();
  settingsPanel();
  toast(t("settingsSaved"));
}

function toggleVoiceSetting(key) {
  state.settings[key] = !state.settings[key];
  if (key === "voiceControl" && !state.settings[key]) stopVoiceCommand();
  applySettings();
  settingsPanel();
  toast(t("settingsSaved"));
  if (key === "voiceControl" && state.settings.voiceControl) startVoiceCommand({ continuous: true });
  if (key === "voiceAssistant" && state.settings.voiceAssistant) speakVillage("Voice assistant is on. I will narrate islands, buildings, and saved resources.");
}

function speakVillage(text, { force = false } = {}) {
  if (!force && !state.settings.voiceAssistant) return;
  const phrase = String(text || "").trim().slice(0, 500);
  if (!phrase) return;
  playGeneratedSpeech(phrase).catch(() => fallbackSpeech(phrase));
}

function fallbackSpeech(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).slice(0, 420));
  utterance.rate = .76;
  utterance.pitch = .88;
  utterance.volume = .82;
  utterance.lang = state.settings.language === "zh" ? "zh-CN" : state.settings.language === "es" ? "es-US" : "en-US";
  window.speechSynthesis.speak(utterance);
}

async function playGeneratedSpeech(text) {
  const cacheKey = `${state.settings.language || "en"}:${text}`;
  let objectUrl = state.voiceCache.get(cacheKey);
  if (!objectUrl) {
    const response = await fetch("/api/voice/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: state.settings.language || "en" })
    });
    if (!response.ok) throw new Error("Waffles voice is unavailable.");
    objectUrl = URL.createObjectURL(await response.blob());
    state.voiceCache.set(cacheKey, objectUrl);
    if (state.voiceCache.size > 18) {
      const [oldKey, oldUrl] = state.voiceCache.entries().next().value;
      state.voiceCache.delete(oldKey);
      URL.revokeObjectURL(oldUrl);
    }
  }
  if (state.voiceAudio) {
    state.voiceAudio.pause();
    state.voiceAudio.currentTime = 0;
  }
  const audio = new Audio(objectUrl);
  audio.volume = .84;
  state.voiceAudio = audio;
  await audio.play();
}

function stopVoiceCommand() {
  state.voiceListening = false;
  clearTimeout(state.voiceRestartTimer);
  state.voiceRestartTimer = null;
  try {
    if (state.voiceRecognition) state.voiceRecognition.onend = null;
    state.voiceRecognition?.stop?.();
  } catch {}
  state.voiceRecognition = null;
}

function startVoiceCommand({ continuous = true, announce = true } = {}) {
  if (!state.settings.voiceControl) return toast("Turn on microphone commands first.");
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("Voice commands are not available in this browser.");
  stopVoiceCommand();
  const recognition = new Recognition();
  state.voiceRecognition = recognition;
  state.voiceListening = true;
  settingsPanel();
  recognition.lang = state.settings.language === "zh" ? "zh-CN" : state.settings.language === "es" ? "es-US" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript || "";
    state.voiceListening = false;
    handleVoiceCommand(transcript);
    if ($("#panel").classList.contains("open") && $("#panel-content .voice-settings")) settingsPanel();
  };
  recognition.onerror = (event) => {
    state.voiceListening = false;
    if (!["no-speech", "aborted"].includes(event.error)) toast("I could not hear that command clearly.");
    if ($("#panel").classList.contains("open") && $("#panel-content .voice-settings")) settingsPanel();
  };
  recognition.onend = () => {
    state.voiceListening = false;
    if ($("#panel").classList.contains("open") && $("#panel-content .voice-settings")) settingsPanel();
    if (continuous && state.settings.voiceControl) {
      clearTimeout(state.voiceRestartTimer);
      state.voiceRestartTimer = setTimeout(() => startVoiceCommand({ continuous: true, announce: false }), 650);
    }
  };
  try {
    recognition.start();
    if (announce) speakVillage("I am listening for natural village commands. You can ask in your own words.", { force: true });
  } catch {
    state.voiceListening = false;
  }
}

function startGuideVoiceInput() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return toast("Voice questions are not available in this browser.");
  const recognition = new Recognition();
  state.guideListening = true;
  const button = $('[data-action="listen-guide"]');
  if (button) button.textContent = t("guideListening");
  recognition.lang = state.settings.language === "zh" ? "zh-CN" : state.settings.language === "es" ? "es-US" : "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (event) => {
    const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
    const input = $('#guide-form textarea[name="message"]');
    if (input) input.value = transcript;
    if (transcript) askGuide(transcript);
  };
  recognition.onerror = () => toast("I could not hear that guide question clearly.");
  recognition.onend = () => {
    state.guideListening = false;
    const nextButton = $('[data-action="listen-guide"]');
    if (nextButton) nextButton.textContent = t("guideListen");
  };
  try {
    recognition.start();
    speakVillage(t("guideListening"), { force: true });
  } catch {
    state.guideListening = false;
    toast("Voice questions are not available right now.");
  }
}

function voiceContext() {
  return {
    selectedIsland: state.selectedIsland,
    currentTopic: state.currentTopic,
    currentDiagnosis: state.currentDiagnosis,
    panelOpen: $("#panel")?.classList.contains("open") || false,
    panelTitle: $("#panel-title")?.textContent || "",
    introOpen: Boolean(state.introOpen),
    introStep: state.introStep,
    pendingClarification: state.voiceClarification,
    availableBuildings: config.buildings.map(({ id, island, type, topic, label, mapLabel }) => ({ id, island, type, topic: topic || "", label, mapLabel }))
  };
}

async function handleVoiceCommand(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return;
  let intent = null;
  try {
    intent = await api("/api/voice/command", { method: "POST", body: JSON.stringify({ transcript: text, context: voiceContext() }) });
  } catch {
    intent = localVoiceIntent(text);
  }
  executeVoiceIntent(intent || localVoiceIntent(text), text);
}

function localVoiceIntent(transcript) {
  const text = String(transcript || "").toLowerCase();
  const island = text.includes("autism") || text.includes("自闭") ? "autism" : text.includes("adhd") || text.includes("多动") ? "adhd" : state.selectedIsland || "autism";
  if (text.includes("next") || text.includes("continue") || text.includes("下一") || text.includes("继续")) return { action: "next", speech: "I’ll show the next part." };
  if (text.includes("back") || text.includes("previous") || text.includes("返回") || text.includes("上一个")) return { action: "back", speech: "I’ll go back one step." };
  if (text.includes("waffles") || text.includes("guide") || text.includes("向导") || text.includes("介绍") || text.includes("story") || text.includes("made")) return { action: "open_guide", speech: "Opening the Waffles guide." };
  if (text.includes("setting") || text.includes("设置")) return { action: "open_settings", speech: "Opening settings." };
  if (text.includes("record") || text.includes("profile") || text.includes("记录")) return { action: "open_record", speech: "Opening your record." };
  if (text.includes("research") || text.includes("find") || text.includes("search") || text.includes("compare") || text.includes("look up") || text.includes("resource") || text.includes("研究") || text.includes("查找") || text.includes("搜索") || text.includes("资源")) {
    const topic = text.includes("support") || text.includes("village") || text.includes("caregiver") || text.includes("联系") || text.includes("支持") ? "Caregiver Support" : text.includes("court") || text.includes("legal") || text.includes("law") || text.includes("法律") ? "Legal" : text.includes("park") || text.includes("recreation") || text.includes("activity") || text.includes("活动") || text.includes("休闲") ? "Recreation" : "Education";
    return { action: "search_resources", island, topic, searchQuery: transcript, speech: "I’ll research matching resources." };
  }
  if (text.includes("support") || text.includes("village") || text.includes("联系") || text.includes("支持")) return { action: "open_building", island, buildingType: "support", speech: "Opening support." };
  if (text.includes("school") || text.includes("education") || text.includes("学校") || text.includes("教育")) return { action: "open_building", island, topic: "Education", speech: "Opening education resources." };
  if (text.includes("court") || text.includes("legal") || text.includes("law") || text.includes("法律")) return { action: "open_building", island, topic: "Legal", speech: "Opening legal resources." };
  if (text.includes("park") || text.includes("recreation") || text.includes("activity") || text.includes("活动") || text.includes("休闲")) return { action: "open_building", island, topic: "Recreation", speech: "Opening recreation." };
  if (text.includes("autism") || text.includes("自闭")) return { action: "select_island", island: "autism", speech: "Opening Autism Island." };
  if (text.includes("adhd") || text.includes("多动") || text.includes("注意力")) return { action: "select_island", island: "adhd", speech: "Opening ADHD Island." };
  return { action: "ask_followup", followUpQuestion: "I heard you, but I’m not sure where to go. Do you want Waffles, an island, a building, or your record?" };
}

function executeVoiceIntent(intent, originalTranscript = "") {
  const action = intent?.action || "ask_followup";
  if (intent?.followUpQuestion) state.voiceClarification = { question: intent.followUpQuestion, originalTranscript };
  else state.voiceClarification = null;
  const say = (message) => speakVillage(message || intent?.speech || "Done.", { force: true });
  if (action === "ask_followup") return say(intent?.followUpQuestion || "Can you say that another way?");
  if (action === "select_island") { selectIsland(intent.island || state.selectedIsland || "autism"); return say(intent.speech); }
  if (action === "open_guide" || action === "open_waffles") { guidePanel(); return say(intent.speech || "Opening the Waffles guide."); }
  if (action === "search_resources") {
    const searchQuery = String(intent.searchQuery || originalTranscript || "").trim();
    const topic = intent.topic || state.currentTopic || "Education";
    const island = intent.island || state.selectedIsland;
    if (topic === "Caregiver Support" || intent.buildingType === "support") {
      supportPanel("search", island);
      const field = $('#ai-form textarea[name="description"]');
      if (field) field.value = searchQuery;
      if (searchQuery.length >= 8) setTimeout(() => $("#ai-form")?.requestSubmit?.(), 0);
      return say(intent.speech || "I’ll research matching support resources.");
    }
    aiPanel(["Education", "Legal", "Recreation"].includes(topic) ? topic : "Education", island, searchQuery, { autoSubmit: true });
    return say(intent.speech || "I’ll research matching resources.");
  }
  if (action === "open_settings") { settingsPanel(); return say(intent.speech || "Opening settings."); }
  if (action === "open_record") { profilePanel(); return say(intent.speech || "Opening your record."); }
  if (action === "close_panel") { closePanel(); return say(intent.speech || "Closing this panel."); }
  if (action === "home") { closePanel(); resetMap(); return say(intent.speech || "Back to both islands."); }
  if (action === "scroll") { ($("#panel").classList.contains("open") ? $("#panel") : window).scrollBy?.({ top: intent.direction === "up" ? -360 : 360, behavior: "smooth" }); return say(intent.speech || "Moving the page."); }
  if (action === "next") {
    if (state.introOpen) changeIntroStep(1);
    else ($("#panel").classList.contains("open") ? $("#panel") : window).scrollBy?.({ top: 360, behavior: "smooth" });
    return say(intent.speech || "Showing the next part.");
  }
  if (action === "back") {
    if (state.introOpen) changeIntroStep(-1);
    else if (state.selectedIsland) resetMap();
    else closePanel();
    return say(intent.speech || "Going back.");
  }
  if (action === "open_building") {
    const island = intent.island || state.selectedIsland || "autism";
    const building = config.buildings.find((item) => item.island === island && (item.id === intent.buildingId || item.type === intent.buildingType || String(item.topic || "").toLowerCase() === String(intent.topic || "").toLowerCase()));
    if (building) {
      handleBuilding(building.id);
      return;
    }
  }
  return say("I’m not fully sure which part to open. You can say things like open Waffles, go to School, or show the next part.");
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

async function hydrateLocalMusic() {
  await Promise.all(["day", "night"].map(async (slot) => {
    try {
      const record = await loadLocalTrack(slot);
      state.localMusic[slot] = record;
      state.audio?.rememberCustomTrack(slot, record);
    } catch {
      state.localMusic[slot] = null;
    }
  }));
}

async function handleLocalMusicUpload(input) {
  const slot = input.dataset.localMusic;
  const file = input.files?.[0];
  if (!file || !["day", "night"].includes(slot)) return;
  const validation = validateAudioFileMeta(file);
  if (!validation.ok) {
    toast(`${t("trackInvalid")} (${validation.code})`);
    input.value = "";
    return;
  }
  let decodedBuffer;
  try {
    decodedBuffer = await state.audio.decodeCandidate(file);
  } catch (error) {
    toast(`${t("trackInvalid")} (${error.code || "DECODE_FAILED"})`);
    input.value = "";
    return;
  }
  try {
    const record = await saveLocalTrack(slot, file);
    await state.audio.setCustomTrack(slot, record, decodedBuffer);
    state.localMusic[slot] = record;
    settingsPanel();
    toast(t("trackSaved"));
  } catch (error) {
    toast(`${t("trackInvalid")} (${error.code || "STORAGE_ERROR"})`);
  } finally {
    input.value = "";
  }
}

async function clearLocalMusic(slot) {
  if (!["day", "night"].includes(slot)) return;
  try {
    await removeLocalTrack(slot);
    state.localMusic[slot] = null;
    await state.audio?.setCustomTrack(slot, null);
    settingsPanel();
    toast(t("trackRemoved"));
  } catch (error) {
    toast(`${t("trackInvalid")} (${error.code || "STORAGE_ERROR"})`);
  }
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

function renderMoonPhase(environment) {
  const moon = $("#environment-moon");
  if (!moon) return;
  const { phase, illumination } = moonPhaseForDate(new Date());
  const hemisphereFlip = environment.hemisphere === "south" ? -1 : 1;
  const size = 112;
  const radius = size * .43;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(size, size);
  const sunX = Math.sin(phase * Math.PI * 2) * hemisphereFlip;
  const sunZ = -Math.cos(phase * Math.PI * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x - size / 2) / radius;
      const ny = (y - size / 2) / radius;
      const distance = nx * nx + ny * ny;
      if (distance > 1) continue;
      const nz = Math.sqrt(1 - distance);
      const sunlight = nx * sunX + nz * sunZ;
      const limb = .58 + nz * .42;
      const crater = Math.sin(x * .31 + y * .17) * Math.sin(x * .08 - y * .23) * 5;
      const lit = sunlight > 0;
      if (!lit) continue;
      const brightness = 178 + sunlight * 66;
      const index = (y * size + x) * 4;
      pixels.data[index] = Math.max(0, brightness * limb + crater + 18);
      pixels.data[index + 1] = Math.max(0, brightness * limb + crater + 19);
      pixels.data[index + 2] = Math.max(0, brightness * limb + crater + 14);
      const limbAlpha = Math.min(1, (1 - distance) * 14);
      const terminatorAlpha = Math.min(1, sunlight * 34);
      pixels.data[index + 3] = Math.round(255 * limbAlpha * terminatorAlpha);
    }
  }
  context.putImageData(pixels, 0, 0);
  moon.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
  moon.classList.add("has-phase");
  moon.dataset.phase = moonPhaseName(phase);
  moon.title = `${moonPhaseName(phase)} · ${Math.round(illumination * 100)}% illuminated · ${environment.location?.city || "local sky"}`;
}

function ensureStarField() {
  const field = $("#star-field");
  if (!field || field.childElementCount) return;
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 110; index += 1) {
    const star = document.createElement("span");
    star.className = "star-particle";
    const depth = index % 6;
    star.style.setProperty("--star-left", `${(index * 47.37 + index * index * 1.17) % 100}%`);
    star.style.setProperty("--star-top", `${(index * 29.71 + index * index * .43) % 100}%`);
    star.style.setProperty("--star-size", `${.55 + depth * .18}px`);
    star.style.setProperty("--star-depth", `${depth * 16}px`);
    star.style.setProperty("--star-alpha", String(.28 + depth * .115));
    star.style.setProperty("--star-delay", `${-(index % 13) * .37}s`);
    star.style.setProperty("--star-duration", `${2.8 + (index % 7) * .43}s`);
    fragment.append(star);
  }
  field.append(fragment);
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
  const orbitStart = celestialOrbit(0);
  let sunPosition = orbitStart;
  let moonPosition = orbitStart;

  if (isDay) {
    const progress = Math.max(0, Math.min(1, (currentMinutes - sunrise) / Math.max(1, sunset - sunrise)));
    sunPosition = celestialOrbit(progress);
  } else {
    const nightLength = 1440 - sunset + sunrise;
    const elapsed = currentMinutes >= sunset ? currentMinutes - sunset : 1440 - sunset + currentMinutes;
    const progress = Math.max(0, Math.min(1, elapsed / Math.max(1, nightLength)));
    moonPosition = celestialOrbit(progress);
  }

  stage.classList.toggle("time-day", isDay);
  stage.classList.toggle("time-night", !isDay);
  $("#environment-status")?.classList.toggle("night", !isDay);
  stage.style.setProperty("--celestial-x", `${sunPosition.x}%`);
  stage.style.setProperty("--celestial-y", `${sunPosition.y}%`);
  stage.style.setProperty("--moon-x", `${moonPosition.x}%`);
  stage.style.setProperty("--moon-y", `${moonPosition.y}%`);
  stage.style.setProperty("--sun-visible", isDay ? "1" : "0");
  stage.style.setProperty("--moon-visible", isDay ? "0" : ".9");
  stage.style.setProperty("--night-strength", isDay ? ".03" : ".72");
  stage.style.setProperty("--star-opacity", isDay ? "0" : ".92");
  const localDate = `${parts.year}-${parts.month}-${parts.day}`;
  const locationSeed = [environment.location?.city, environment.location?.region, environment.location?.country, environment.location?.timezone].filter(Boolean).join("|") || "village";
  state.ecosystem?.setClock({ isDay, currentMinutes, sunrise, sunset, localDate, locationSeed });
  state.audio?.setDay(isDay);
  state.audio?.setClock({ currentMinutes, sunrise });
  state.immersive?.setEnvironment({ isDay, currentMinutes, sunrise, sunset });
  state.surfaceMotion?.setEnvironment({ isDay });
  renderMoonPhase(environment);
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
  state.audio?.setSeason(season);
  state.ecosystem?.setWeather(kind);
  const atmosphere = { weather: kind, season, windSpeed: Number(environment.current?.windSpeed || 0), cloudCover: Number(environment.current?.cloudCover || 0) };
  state.immersive?.setEnvironment(atmosphere);
  state.surfaceMotion?.setEnvironment(atmosphere);
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
  ensureStarField();
  state.ecosystem?.init();
  applySettings();
  loadIntegrationStatus();
  loadResources();
  loadEnvironment();
  if (state.settings.voiceControl && !state.voiceListening) setTimeout(() => startVoiceCommand({ continuous: true, announce: false }), 900);
  if (!state.user?.guest && state.user?.onboardingCompleted === false && !state.introOpen) setTimeout(openWafflesIntro, 350);
}

function renderWafflesIntro() {
  const step = WAFFLES_INTRO_STEPS[state.introStep] || WAFFLES_INTRO_STEPS[0];
  $("#waffles-intro-eyebrow").textContent = step.eyebrow;
  $("#waffles-intro-title").textContent = step.title;
  $("#waffles-intro-text").textContent = step.text;
  $("#waffles-intro-count").textContent = `${state.introStep + 1} of ${WAFFLES_INTRO_STEPS.length}`;
  $("#waffles-intro-dots").innerHTML = WAFFLES_INTRO_STEPS.map((_, index) => `<span class="${index === state.introStep ? "active" : ""}"></span>`).join("");
  const badge = $("#waffles-intro-building");
  badge.classList.toggle("hidden", !step.building);
  badge.innerHTML = step.building ? `<b aria-hidden="true">${escapeHtml(step.symbol)}</b><span><small>Tap the illustration</small><strong>${escapeHtml(step.building)}</strong></span>` : "";
  $("#intro-back").classList.toggle("hidden", state.introStep === 0);
  $("#intro-next").textContent = state.introStep === WAFFLES_INTRO_STEPS.length - 1 ? "Enter the village →" : "Next →";
}

function openWafflesIntro() {
  if (!state.user || state.user.guest || state.user.onboardingCompleted !== false) return;
  state.introStep = 0;
  state.introOpen = true;
  $("#waffles-intro").classList.remove("hidden");
  renderWafflesIntro();
  $("#intro-next").focus();
}

async function finishWafflesIntro() {
  state.introOpen = false;
  $("#waffles-intro").classList.add("hidden");
  if (!state.user || state.user.guest || state.user.onboardingCompleted) return;
  state.user.onboardingCompleted = true;
  try {
    const { user } = await api("/api/onboarding/complete", { method: "POST", body: "{}" });
    state.user = user;
  } catch { toast("Introduction dismissed for this visit."); }
}

function changeIntroStep(direction) {
  const next = state.introStep + direction;
  if (next < 0) return;
  if (next >= WAFFLES_INTRO_STEPS.length) return finishWafflesIntro();
  state.introStep = next;
  renderWafflesIntro();
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
    if (state.user) state.user.feedback = String(feedback || "");
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    status.classList.toggle("form-success", Boolean(data.sync?.synced));
    status.textContent = data.sync?.synced
      ? "Feedback saved to your account and User data sheet. Thank you."
      : `Feedback saved to your account, but the User data sheet could not be updated${data.sync?.reason ? `: ${data.sync.reason}` : "."}`;
  } catch (error) {
    status.textContent = error.message;
  }
}

document.addEventListener("click", (event) => {
  const authButton = event.target.closest("[data-auth-mode]");
  if (authButton) return setAuthMode(authButton.dataset.authMode);
  const building = event.target.closest("[data-building]");
  if (building) return handleBuilding(building.dataset.building);
  const islandButton = event.target.closest("[data-island]:not(.building)");
  if (islandButton) return selectIsland(islandButton.dataset.island);
  const setting = event.target.closest("[data-setting]");
  if (setting) return updateSetting(setting.dataset.setting, setting.dataset.value);
  const actionElement = event.target.closest("[data-action]");
  const action = actionElement?.dataset.action;
  if (!action) return;
  if (action === "close-panel") closePanel();
  if (action === "reset-map" || action === "home") { closePanel(); resetMap(); }
  if (action === "open-profile") profilePanel();
  if (action === "open-settings") settingsPanel();
  if (action === "open-mori") guidePanel();
  if (action === "speak-guide") speakVillage(state.lastGuideAnswer || t("guideIntro"), { force: true });
  if (action === "listen-guide") startGuideVoiceInput();
  if (action === "guide-suggestion") {
    try { followGuideAction(JSON.parse(actionElement.dataset.guideSuggestion || "{}")); }
    catch { toast(t("guideError")); }
  }
  if (action === "continue-guest") continueAsGuest();
  if (action === "open-password-reset") openPasswordReset();
  if (action === "close-password-reset") closePasswordReset();
  if (action === "intro-next") changeIntroStep(1);
  if (action === "intro-back") changeIntroStep(-1);
  if (action === "intro-skip") finishWafflesIntro();
  if (action === "logout") logout();
  if (action === "toggle-calm") toggleCalm();
  if (action === "toggle-sound") toggleSound();
  if (action === "toggle-voice-setting") toggleVoiceSetting(actionElement.dataset.voiceSetting);
  if (action === "start-voice-command") startVoiceCommand();
  if (action === "explain-resource") showResourceExplanation(actionElement);
  if (action === "like-resource") toggleResourceLike(actionElement);
  if (action === "dislike-resource") toggleResourceDislike(actionElement);
  if (action === "refresh-resources") loadResources(true);
  if (action === "refresh-environment") loadEnvironment(true);
  if (action === "clear-local-music") clearLocalMusic(actionElement.dataset.musicSlot);
  if (["open-community", "community-tab", "support-tab", "send-sticker", "mention-member", "open-friend-chat", "join-community-room", "open-community-room", "connect-community", "accept-connection", "decline-connection", "accept-group-invite", "decline-group-invite", "disable-community", "pin-community-room", "clear-community-history", "leave-community-room", "remove-community-friend", "block-community-user", "unblock-community-user", "delete-community-post"].includes(action)) communityAction(actionElement, action);
});

document.addEventListener("input", (event) => {
  const volume = event.target.closest("[data-volume]");
  if (volume) updateVolume(volume);
});

document.addEventListener("change", (event) => {
  const localMusic = event.target.closest("[data-local-music]");
  if (localMusic) handleLocalMusicUpload(localMusic);
  const communityImage = event.target.closest("[data-community-image]");
  if (communityImage) handleCommunityImage(communityImage);
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") submitAuth(event);
  if (event.target.id === "password-request-form") submitPasswordRequest(event);
  if (event.target.id === "password-confirm-form") submitPasswordConfirm(event);
  if (event.target.id === "survey-form") submitSurvey(event);
  if (event.target.id === "ai-form") submitAi(event);
  if (event.target.id === "guide-form") submitGuide(event);
  if (event.target.id === "clarification-form") submitClarification(event);
  if (event.target.id === "feedback-form") submitFeedback(event);
  if (event.target.id === "community-settings-form") submitCommunitySettings(event);
  if (event.target.id === "community-message-form") submitCommunityMessage(event);
  if (event.target.id === "community-search-form") submitCommunitySearch(event);
  if (event.target.id === "community-group-form") submitCommunityGroup(event);
  if (event.target.id === "community-room-invite-form") submitCommunityRoomInvite(event);
  if (event.target.id === "community-post-form") submitCommunityPost(event);
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePanel(); });
$("#calm-toggle").addEventListener("click", toggleCalm);
$("#original-survey-link").href = config.survey.url.replace("?embedded=true", "");

(async function boot() {
  setAuthMode("register");
  await hydrateLocalMusic();
  applySettings();
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {}
  routeForUser();
})();
