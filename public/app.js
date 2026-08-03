import { EcosystemController } from "./ecosystem-runtime.mjs?v=activities-capy-20260710";
import { ImmersiveScene } from "./immersive-scene.mjs?v=low-stimulation-20260724";
import { LiveBuildingInterior } from "./interior-3d.mjs?v=cinematic-3d-admin-20260724d";
import { SurfaceMotion } from "./surface-motion.mjs?v=land-map-20260624";
import { celestialOrbit, moonPhaseForDate, moonPhaseName } from "./celestial-logic.mjs?v=village-guide-voice-20260625";
import { loadLocalTrack, removeLocalTrack, saveLocalTrack, validateAudioFileMeta } from "./local-music-store.mjs";
import { activeAmbientScenes } from "./ambient-schedule.mjs?v=grounded-audio-20260623";
import { VillageMeetingRuntime } from "./community-meeting.mjs?v=meeting-media-captions-20260728a";
import { VillageDocumentStudio } from "./community-documents.mjs?v=village-docs-20260727";

const config = window.CAPY_CONFIG;
const GUIDE_CHARACTERS = Object.freeze({
  Education: { name: "Muffins", src: "/assets/character-muffins-school.svg", alt: "Muffins, the School guide" },
  Legal: { name: "Bacon", src: "/assets/character-bacon-law.svg", alt: "Bacon, the Law guide" },
  Recreation: { name: "Granola", src: "/assets/character-granola-recreation.svg", alt: "Granola, the Recreation guide" },
  Activity: { name: "Mayor Crumpet", src: "/assets/character-mayor-crumpet.svg", alt: "Mayor Crumpet, the Activity guide" },
  Support: { name: "Eggy", src: "/assets/character-flower-support.svg", alt: "Eggy, the Support guide" },
  Waffles: { name: "Waffles", src: "/assets/character-waffles.svg", alt: "Waffles, the village guider" }
});
const WAFFLES_INTRO_STEPS = Object.freeze([
  { eyebrow: "Meet your village guide", title: "Hi, I’m Waffles.", text: "I’m a friendly AI resource guide. I can explain the village, compare the live resource database with your personal record, and show why a result matched. I do not diagnose or replace medical, legal, or professional advice." },
  { eyebrow: "Community Compass", title: "Your answers shape the route.", text: "The short survey records the topics, age group, journey stage, and priorities you choose. Waffles uses only that record to improve matching. You can update every answer later from My record." },
  { eyebrow: "Two islands, one village", title: "Choose the pace that fits.", text: "Autism Island offers a quieter garden path, while ADHD Island follows a more energetic trail. Both islands contain the same five destinations, so you can explore either without missing a kind of support." },
  { eyebrow: "Village · Support", title: "Start with support.", text: "The Village opens contact options, community conversations, friends and groups, plus a dedicated resource search. Community features stay private to registered members.", building: "Village", symbol: "⌂" },
  { eyebrow: "School · Education", title: "Find education resources.", text: "The School searches education programs, accommodations, IEP and 504 information, executive-function help, learning support, and nearby services. Open a result to see its score and matching reasons.", building: "School", symbol: "▤" },
  { eyebrow: "Courthouse · Legal", title: "Understand rights and advocacy.", text: "The Courthouse searches legal-rights and advocacy resources. Waffles can organize options, but eligibility and formal advice should always be confirmed with a qualified provider.", building: "Courthouse", symbol: "§" },
  { eyebrow: "Park · Recreation", title: "Explore the jungle grove.", text: "The Park helps find inclusive recreation, sensory-friendly activities, sports, camps, and community programs. Entering it opens a calm hand-painted jungle clearing.", building: "Park", symbol: "◇" },
  { eyebrow: "Woods · Activities", title: "See what the village is doing.", text: "The Activity House keeps upcoming events and volunteer opportunities together. Administrators can publish new activities, while everyone can browse what is coming next.", building: "Woods", symbol: "♧" },
  { eyebrow: "Settings and My record", title: "You stay in control.", text: "Turn on More precise research in Settings only when you want optional follow-up questions. My record lets you revisit this introduction, change survey answers, review searches, and reopen saved resources at any time." }
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
  currentResearch: null,
  dailyResearchContext: null,
  dailyResearchFeedbackPending: false,
  passwordResetEmail: "",
  introStep: 0,
  introOpen: false,
  introReplay: false,
  surveyEditing: false,
  activeBuilding: null,
  buildingTransitionTimer: null,
  resources: [],
  sheetSync: { configured: false },
  settings: loadSavedSettings(),
  environment: null,
  environmentTimer: null,
  environmentRefreshTimer: null,
  communityTimer: null,
  communityUpdatesTimer: null,
  communityUpdateCursor: "",
  communityNotificationCursor: "",
  communityUpdateBusy: false,
  communityUnreadCount: 0,
  communitySeenEventIds: new Set(),
  communityInfoOpen: false,
  communityDirectoryOpen: false,
  communityRoom: null,
  communityOverview: null,
  communityPosts: [],
  communityTab: "direct",
  communityPostImage: null,
  communityPostImagePromise: null,
  communityPostComposerOpen: false,
  communityPostsProfile: null,
  communityNotifications: [],
  communityDocuments: [],
  communityStickers: [],
  communitySavedMessages: [],
  communityAttachment: null,
  communityAttachmentPromise: null,
  communityCommentImages: new Map(),
  communityCommentImagePromises: new Map(),
  communityActiveProfileId: null,
  communityDocumentRoomId: null,
  meetingRuntime: null,
  documentRuntime: null,
  announcements: [],
  activities: [],
  selectedAnnouncementId: null,
  editingAnnouncementId: null,
  adminUsers: [],
  primaryKeywordBlocklist: [],
  communityBlocklist: [],
  communityReports: [],
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
  interior3d: null,
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
    language: "Language", motion: "Motion & visual detail", useLow: "Use low-stimulation view", useStandard: "Use standard view", settingsSaved: "Settings saved and applied.", previewTitle: "Live preview", previewText: "This text changes with your size, color, and language settings.", sceneStyle: "Environment style", scene2d: "Illustrated 2D", scene3d: "Immersive 3D", sceneHint: "3D adds perspective lighting, reflective animated water, forest depth and parallax.", visualQuality: "3D visual quality", qualityLow: "Low", qualityMedium: "Medium", qualityHigh: "High", qualityUltra: "Ultra", visualQualityHint: "Only affects live 3D interiors: resolution, shadows, atmospheric particles, and material detail.", precisionResearch: "More precise research", precisionResearchOn: "Follow-up questions enabled", precisionResearchOff: "Follow-up questions disabled", precisionResearchHint: "When enabled, a building guide may ask optional follow-up questions after research. When disabled, results appear without those questions.", sound: "Village sound", soundOff: "Sound is off", soundOn: "Sound is on", enableSound: "Enable sound", muteSound: "Mute sound", masterVolume: "Master volume", environmentVolume: "Weather & environment", musicVolume: "Background music", animalVolume: "Animals", soundHint: "Weather stays prominent; music and individual animal calls remain gentler.", customMusic: "Your local music", dayTrack: "Day soundtrack", nightTrack: "Night soundtrack", dayScoreName: "Garden Footsteps · original", nightScoreName: "Starlit Current · original", chooseAudio: "Choose audio", removeTrack: "Use original", musicLocalOnly: "MP3, OGG, WAV, M4A, AAC or WebM · up to 30 MB. Stored only in this browser and never uploaded.", trackSaved: "Local soundtrack saved.", trackRemoved: "Original soundtrack restored.", trackInvalid: "That audio file cannot be used.",
    support: "Support", settings: "Settings", education: "Education", legal: "Legal", recreation: "Recreation", activities: "Activities",
    supportTitle: "Support & Contact", supportEyebrow: "A steadier next step", prepare: "Small ways to prepare",
    communityTitle: "Village Community", communityIntro: "Join group conversations or connect privately with people who chose to participate.", communityOpen: "Open community chats", communityPrivacy: "Your email and private survey note are never shown. Waffles matches only shared interests, age group, and journey stage. You can leave at any time.", communityEnable: "Join the community", communityDisable: "Leave community matching", communityDisplayName: "Community display name", communityGroups: "Group chats", communitySuggestions: "People Waffles suggests", communityIncoming: "Connection requests", communityDirect: "Private chats", communityJoin: "Join group", communityOpenRoom: "Open chat", communityConnect: "Say hello", communityPending: "Request sent", communityAccept: "Accept", communityDecline: "Decline", communitySend: "Send", communityMessagePlaceholder: "Write a kind message…", communityEmpty: "No messages yet. You can start gently.", communityLoading: "Opening the community…", communitySafety: "Community messages are stored securely but are not end-to-end encrypted. They are peer conversation, not professional or emergency support. Do not share passwords, addresses, or urgent medical details.",
    activityTitle: "Volunteer & Activity", activityEyebrow: "Things we can do together", activityIntro: "Upcoming community activities. Only project editors can change these listings.", activityGuideIntro: "Mayor Crumpet keeps the village’s volunteer opportunities and upcoming activities in one place.", supportGuideIntro: "Eggy can help you find a steadier next step.",
    aiEyebrow: "Waffles · Personalized resource matching", aiHello: "Hi, I’m Waffles.", aiExplain: "I’ll score tags first, then descriptions and issue conflicts, using your record and this building’s topic.", aiQuestion: "What are you trying to find?", aiFind: "Find fitting resources", aiChecking: "Waffles is checking the village…", aiDisclaimer: "Waffles provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.", resultCount: "Number of resources", scoreWhy: "Why this matched", expandedTerms: "Related terms used", resourceExplain: "Waffles explain", resourceLike: "Save", resourceLiked: "Saved", resourceDislike: "Dislike", resourceDisliked: "Disliked", resourceVisit: "Visit resource ↗", resourceSaved: "Resource saved to your record.", resourceUnsaved: "Resource removed from saved list.", resourceDislikeSaved: "Resource added to disliked list.", resourceDislikeRemoved: "Resource removed from disliked list.", savedResourcesTitle: "Saved resources", dislikedResourcesTitle: "Disliked resources", noSavedResources: "No saved resources yet.", noDislikedResources: "No disliked resources yet.", clarificationTitle: "A quick detail will improve these matches", clarificationNone: "None of these", clarificationContinue: "Continue search", clarificationRequired: "Choose any relevant option, or select “None of these.”", clarificationOptional: "Optional: choose one to refine the search and run it again.", sourceLabel: "Database source", scoringLabel: "scoring", aiExpandedKeywords: "AI-expanded keywords", localExpandedKeywords: "local synonym expansion", supportSearchTitle: "Search the support database", supportSearchIntro: "Eggy checks the live resource database and ranks each match with the same transparent scoring system used in the Education buildings.", supportSearchDisclaimer: "Eggy provides resource navigation, not medical or legal advice. Verify eligibility, cost, and current availability with each provider.", supportContactTab: "Contact", supportFindTab: "Find resources", communityPrivateTab: "Private chat", communityGroupsTab: "Groups", communityMomentsTab: "Moments", communityRequestsTab: "Requests",
    voiceTools: "Voice assistant", voiceAssistant: "Narrate clicks and places", voiceControl: "Microphone commands", voiceListen: "Listen for a command", voiceListening: "Listening…", voiceHint: "Try natural phrases like “research 504 plans,” “open Waffles,” or “find school support.” Waffles may ask a follow-up question. Voice recognition captures your words in the browser; Waffles uses the AI API for spoken audio and smarter command routing.",
    recordTitle: "My personal record", recordIntro: "This record helps Waffles choose more relevant entries from the resource database.", restartIntro: "Restart introduction", updateSurvey: "Update survey answers", recentSearches: "Recent resource searches", noSearches: "No searches yet.", feedbackLabel: "Feedback for the project team", feedbackSave: "Save feedback", logout: "Log out",
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
    language: "语言", motion: "动画与视觉细节", useLow: "使用低刺激模式", useStandard: "使用标准模式", settingsSaved: "设置已保存并生效。", previewTitle: "实时预览", previewText: "这段文字会跟随字体、颜色和语言设置变化。", sceneStyle: "环境样式", scene2d: "插画 2D", scene3d: "沉浸式 3D", sceneHint: "3D 模式加入透视光照、动态反光水面、森林景深和视差。", visualQuality: "3D 画质", qualityLow: "低", qualityMedium: "中", qualityHigh: "高", qualityUltra: "超高", visualQualityHint: "仅影响实时 3D 内景：渲染分辨率、阴影、天气粒子与材质细节。", precisionResearch: "更精确的研究", precisionResearchOn: "已允许追问", precisionResearchOff: "已关闭追问", precisionResearchHint: "开启后，建筑向导可以在研究结果后提出可选追问；关闭时会直接显示结果。", sound: "村庄声音", soundOff: "声音已关闭", soundOn: "声音已开启", enableSound: "开启声音", muteSound: "静音", masterVolume: "总音量", environmentVolume: "天气与环境", musicVolume: "背景音乐", animalVolume: "动物", soundHint: "天气与环境声较明显，音乐和各类动物声保持轻柔。", customMusic: "你的本地音乐", dayTrack: "白天配乐", nightTrack: "夜晚配乐", dayScoreName: "花园足迹 · 原创", nightScoreName: "星河回声 · 原创", chooseAudio: "选择音频", removeTrack: "恢复原创", musicLocalOnly: "支持 MP3、OGG、WAV、M4A、AAC、WebM，最大 30 MB。仅保存在本浏览器，绝不会上传。", trackSaved: "本地配乐已保存。", trackRemoved: "已恢复原创配乐。", trackInvalid: "无法使用这个音频文件。",
    support: "支持", settings: "设置", education: "教育", legal: "法律", recreation: "休闲活动", activities: "活动",
    supportTitle: "支持与联系", supportEyebrow: "找到更稳妥的下一步", prepare: "可以先做的小准备",
    communityTitle: "村庄社区", communityIntro: "加入不同群聊，或与自愿参与且经历相似的用户私聊。", communityOpen: "打开社区聊天", communityPrivacy: "不会展示你的邮箱或问卷私人备注。Waffles 只比较共同关注领域、年龄组和经历阶段；你可以随时退出。", communityEnable: "加入社区", communityDisable: "退出社区匹配", communityDisplayName: "社区显示名称", communityGroups: "群聊", communitySuggestions: "Waffles 推荐认识的人", communityIncoming: "好友申请", communityDirect: "私聊", communityJoin: "加入群聊", communityOpenRoom: "打开聊天", communityConnect: "打个招呼", communityPending: "已发送申请", communityAccept: "接受", communityDecline: "拒绝", communitySend: "发送", communityMessagePlaceholder: "写一条友善的消息……", communityEmpty: "还没有消息，可以轻轻地开始。", communityLoading: "正在打开社区……", communitySafety: "社区消息会安全保存，但不是端到端加密。这里属于用户互助，不是专业或紧急服务；请勿发送密码、住址或紧急医疗隐私。",
    activityTitle: "志愿者与活动", activityEyebrow: "一起参与的事情", activityIntro: "即将开始的社区活动。只有项目管理员可以修改内容。", activityGuideIntro: "Mayor Crumpet 会把村庄里的志愿者机会和即将开始的活动整理在一起。", supportGuideIntro: "Eggy 会帮助你找到更稳妥的下一步。",
    aiEyebrow: "Waffles · 个性化资源匹配", aiHello: "你好，我是 Waffles。", aiExplain: "我会先匹配标签，再检查描述与冲突项，并结合你的个人记录和建筑主题透明评分。", aiQuestion: "你正在寻找什么？", aiFind: "查找合适资源", aiChecking: "Waffles 正在查找村庄资源…", aiDisclaimer: "Waffles 提供资源导航，不构成医疗或法律建议。请向服务机构确认资格、费用与当前名额。", resultCount: "显示资源数量", scoreWhy: "匹配原因", expandedTerms: "使用的相关词", resourceExplain: "让 Waffles 解释", resourceLike: "收藏", resourceLiked: "已收藏", resourceDislike: "不喜欢", resourceDisliked: "已不喜欢", resourceVisit: "打开资源 ↗", resourceSaved: "资源已收藏到你的记录。", resourceUnsaved: "已从收藏资源中移除。", resourceDislikeSaved: "已加入不喜欢资源列表。", resourceDislikeRemoved: "已从不喜欢资源中移除。", savedResourcesTitle: "收藏的资源", dislikedResourcesTitle: "不喜欢的资源", noSavedResources: "还没有收藏资源。", noDislikedResources: "还没有不喜欢的资源。", clarificationTitle: "补充一个小细节，匹配会更准确", clarificationNone: "以上都不是", clarificationContinue: "继续搜索", clarificationRequired: "请选择一个相关选项，或选择“以上都不是”。", clarificationOptional: "可选：点一个选项会补充到搜索里并重新查找。", sourceLabel: "数据库来源", scoringLabel: "评分版本", aiExpandedKeywords: "AI 扩展关键词", localExpandedKeywords: "本地同义词扩展", supportSearchTitle: "搜索支持资源数据库", supportSearchIntro: "Eggy 会检查实时资源数据库，并用与教育建筑相同的透明评分系统排序。", supportSearchDisclaimer: "Eggy 提供资源导航，不构成医疗或法律建议。请向服务机构确认资格、费用与当前名额。", supportContactTab: "联系", supportFindTab: "找资源", communityPrivateTab: "私聊", communityGroupsTab: "群组", communityMomentsTab: "动态", communityRequestsTab: "请求",
    voiceTools: "语音助手", voiceAssistant: "点击时自动讲解", voiceControl: "麦克风语音操作", voiceListen: "听取指令", voiceListening: "正在听…", voiceHint: "可以自然地说：“research 504 plans”、“open Waffles” 或“find school support”。如果不清楚，Waffles 会追问。浏览器负责听写你的话；Waffles 会使用 AI API 生成语音并更聪明地理解指令。",
    recordTitle: "我的个人记录", recordIntro: "这份记录帮助 Waffles 从数据库中选择更相关的资源。", restartIntro: "重新播放介绍", updateSurvey: "重新选择问卷答案", recentSearches: "最近的资源搜索", noSearches: "还没有搜索记录。", feedbackLabel: "给项目团队的反馈", feedbackSave: "保存反馈", logout: "退出登录",
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
    language: "Idioma", motion: "Movimiento y detalle visual", useLow: "Usar vista de baja estimulación", useStandard: "Usar vista estándar", settingsSaved: "Ajustes guardados y aplicados.", previewTitle: "Vista previa", previewText: "Este texto cambia con el tamaño, color e idioma elegidos.", sceneStyle: "Estilo del entorno", scene2d: "2D ilustrado", scene3d: "3D inmersivo", sceneHint: "El modo 3D añade perspectiva, agua reflectante, profundidad de bosque y paralaje.", visualQuality: "Calidad visual 3D", qualityLow: "Baja", qualityMedium: "Media", qualityHigh: "Alta", qualityUltra: "Ultra", visualQualityHint: "Solo afecta los interiores 3D en vivo: resolución, sombras, partículas atmosféricas y detalle de materiales.", precisionResearch: "Investigación más precisa", precisionResearchOn: "Preguntas adicionales activadas", precisionResearchOff: "Preguntas adicionales desactivadas", precisionResearchHint: "Al activarlo, la guía puede hacer preguntas opcionales después de investigar. Al desactivarlo, muestra los resultados directamente.", sound: "Sonido de la aldea", soundOff: "Sonido apagado", soundOn: "Sonido activado", enableSound: "Activar sonido", muteSound: "Silenciar", masterVolume: "Volumen general", environmentVolume: "Clima y ambiente", musicVolume: "Música de fondo", animalVolume: "Animales", soundHint: "El clima queda presente; la música y los animales se mantienen suaves.", customMusic: "Tu música local", dayTrack: "Música diurna", nightTrack: "Música nocturna", dayScoreName: "Pasos del jardín · original", nightScoreName: "Corriente estelar · original", chooseAudio: "Elegir audio", removeTrack: "Usar original", musicLocalOnly: "MP3, OGG, WAV, M4A, AAC o WebM · máximo 30 MB. Se guarda solo en este navegador y nunca se sube.", trackSaved: "Música local guardada.", trackRemoved: "Música original restaurada.", trackInvalid: "No se puede usar ese archivo de audio.",
    support: "Apoyo", settings: "Ajustes", education: "Educación", legal: "Legal", recreation: "Recreación", activities: "Actividades",
    supportTitle: "Apoyo y contacto", supportEyebrow: "Un próximo paso más tranquilo", prepare: "Pequeñas formas de prepararse",
    communityTitle: "Comunidad de la aldea", communityIntro: "Únete a grupos o conecta en privado con personas que aceptaron participar.", communityOpen: "Abrir chats", communityPrivacy: "Tu correo y tus notas privadas nunca se muestran. Waffles compara solo intereses, edad y etapa del recorrido.", communityEnable: "Unirme a la comunidad", communityDisable: "Salir de la comunidad", communityDisplayName: "Nombre visible", communityGroups: "Chats grupales", communitySuggestions: "Personas sugeridas por Waffles", communityIncoming: "Solicitudes", communityDirect: "Chats privados", communityJoin: "Unirme", communityOpenRoom: "Abrir chat", communityConnect: "Saludar", communityPending: "Solicitud enviada", communityAccept: "Aceptar", communityDecline: "Rechazar", communitySend: "Enviar", communityMessagePlaceholder: "Escribe un mensaje amable…", communityEmpty: "Aún no hay mensajes.", communityLoading: "Abriendo la comunidad…", communitySafety: "Los mensajes se guardan de forma segura, pero no tienen cifrado de extremo a extremo. Son apoyo entre pares, no atención profesional ni de emergencia. No compartas contraseñas, direcciones ni datos médicos urgentes.",
    activityTitle: "Voluntariado y actividades", activityEyebrow: "Cosas que podemos hacer juntos", activityIntro: "Próximas actividades comunitarias. Solo los editores del proyecto pueden cambiarlas.", activityGuideIntro: "Mayor Crumpet reúne las oportunidades de voluntariado y las próximas actividades de la aldea.", supportGuideIntro: "Eggy puede ayudarte a encontrar un siguiente paso más tranquilo.",
    aiEyebrow: "Waffles · Recursos personalizados", aiHello: "Hola, soy Waffles.", aiExplain: "Puntuaré primero las etiquetas y después la descripción y los posibles conflictos.", aiQuestion: "¿Qué estás buscando?", aiFind: "Buscar recursos", aiChecking: "Waffles está buscando recursos…", aiDisclaimer: "Waffles orienta sobre recursos; no ofrece consejo médico ni legal. Confirma requisitos, costo y disponibilidad.", resultCount: "Cantidad de recursos", scoreWhy: "Por qué coincide", expandedTerms: "Términos relacionados usados", resourceExplain: "Waffles explica", resourceLike: "Guardar", resourceLiked: "Guardado", resourceDislike: "No me sirve", resourceDisliked: "Marcado", resourceVisit: "Visitar recurso ↗", resourceSaved: "Recurso guardado en tu registro.", resourceUnsaved: "Recurso eliminado de guardados.", resourceDislikeSaved: "Recurso marcado como no útil.", resourceDislikeRemoved: "Recurso quitado de no útiles.", savedResourcesTitle: "Recursos guardados", dislikedResourcesTitle: "Recursos no útiles", noSavedResources: "Aún no hay recursos guardados.", noDislikedResources: "Aún no hay recursos marcados.", clarificationTitle: "Un detalle rápido mejorará estas coincidencias", clarificationNone: "Ninguna de estas", clarificationContinue: "Continuar búsqueda", clarificationRequired: "Elige una opción relevante o selecciona “Ninguna de estas”.", clarificationOptional: "Opcional: elige una para refinar y buscar de nuevo.", sourceLabel: "Fuente de datos", scoringLabel: "puntuación", aiExpandedKeywords: "palabras ampliadas por IA", localExpandedKeywords: "expansión local de sinónimos", supportSearchTitle: "Buscar en la base de apoyo", supportSearchIntro: "Eggy revisa la base de recursos en vivo y ordena cada resultado con el mismo sistema de puntuación transparente usado en Educación.", supportSearchDisclaimer: "Eggy orienta sobre recursos; no ofrece consejo médico ni legal. Confirma requisitos, costo y disponibilidad.", supportContactTab: "Contacto", supportFindTab: "Buscar recursos", communityPrivateTab: "Chat privado", communityGroupsTab: "Grupos", communityMomentsTab: "Momentos", communityRequestsTab: "Solicitudes",
    voiceTools: "Asistente de voz", voiceAssistant: "Narrar clics y lugares", voiceControl: "Comandos por micrófono", voiceListen: "Escuchar comando", voiceListening: "Escuchando…", voiceHint: "Prueba frases naturales como “research 504 plans”, “open Waffles” o “find school support”. Waffles puede hacer una pregunta de seguimiento. El navegador transcribe tu voz; Waffles usa la API de IA para el audio hablado y el enrutamiento inteligente.",
    recordTitle: "Mi registro personal", recordIntro: "Este registro ayuda a Waffles a elegir recursos más relevantes.", restartIntro: "Repetir introducción", updateSurvey: "Actualizar respuestas", recentSearches: "Búsquedas recientes", noSearches: "Aún no hay búsquedas.", feedbackLabel: "Comentarios para el equipo", feedbackSave: "Guardar comentarios", logout: "Cerrar sesión",
    sheetConnected: "Sincronización con Google Sheets conectada", sheetMissing: "La sincronización con Google Sheets aún no está conectada",
    environmentFinding: "Buscando tu cielo local…", environmentUnavailable: "Clima local no disponible", approximateIp: "Ubicación aproximada por IP · Open-Meteo",
    spring: "Primavera", summer: "Verano", autumn: "Otoño", winter: "Invierno",
    weatherClear: "Despejado", weatherCloudy: "Nublado", weatherFog: "Niebla", weatherRain: "Lluvia", weatherSnow: "Nieve", weatherStorm: "Tormenta", weatherRefresh: "Actualizar el clima local"
  }
};

const supplementalI18n = {
  en: {
    quickSearch: "Quick search",
    quickSearchEyebrow: "Search the whole village",
    quickSearchIntro: "Describe what you need, choose a topic, and Waffles will search the live resource database without making you enter a building first.",
    quickSearchTopic: "Topic",
    quickSearchPath: "Profile focus",
    quickSearchAnyPath: "Use my full record",
    quickSearchQuery: "What would you like to find?",
    quickSearchPlaceholder: "For example: a sensory-friendly weekend program near me for a 10-year-old…",
    quickSearchSubmit: "Search now",
    quickSearchHint: "You can still open My record from the status row below the island map.",
    changeProfilePhoto: "Change profile photo",
    profilePhotoUpdated: "Profile photo updated.",
    avatarAccountRequired: "Create or sign in to an account before adding a profile photo.",
    aiExampleEducation: "For example: I’m looking for executive-function support for a middle-school student…",
    aiExampleLegal: "For example: I need help understanding a 504 plan for an 11-year-old…",
    aiExampleRecreation: "For example: I’m looking for a calm, inclusive weekend activity nearby…",
    communitySelfTab: "Self",
    yourVillageProfile: "Your village profile",
    communitySelfIntro: "Manage the parts of Community that belong only to you.",
    changePhoto: "Change photo",
    savedFromChat: "Saved from chat",
    savedFromChatIntro: "Files, locations, notes, and messages you chose to keep.",
    savedFromChatEmpty: "Items you save from chat will appear here.",
    villageDocuments: "Village documents",
    villageDocumentsIntro: "Your docs, printable PDFs, and forms.",
    createDocument: "Create document",
    noVillageDocuments: "No Village documents saved yet.",
    yourStickers: "Your stickers",
    yourStickersIntro: "Upload an image, or save a sticker someone sends.",
    addSticker: "Add sticker",
    deleteSticker: "Delete sticker",
    noCustomStickers: "No custom stickers.",
    privacyNotifications: "Privacy & notifications",
    privacyNotificationsIntro: "These choices apply to your account across devices.",
    communityNotifications: "Community notifications",
    communityNotificationsHint: "Show unread dots for new chats, Moments, and requests.",
    appearSearch: "Appear in member search",
    appearSearchHint: "Friends can still open your profile when this is off.",
    acceptPrivateMessages: "Accept private messages",
    acceptPrivateMessagesHint: "Pause new messages without removing friends.",
    allowLocationSharing: "Allow location sharing",
    allowLocationSharingHint: "Required before this browser can send your current location.",
    allowStrangersAdd: "Allow strangers to add me",
    allowStrangersAddHint: "Turn off to stop receiving requests from people you do not know.",
    allowStrangersMoments: "Allow strangers to see Moments",
    allowStrangersMomentsHint: "Blocked people never see your Moments.",
    friendsMomentRange: "Friends can see Moments from",
    last7Days: "Last 7 days",
    last30Days: "Last 30 days",
    last6Months: "Last 6 months",
    lastYear: "Last year",
    allAvailable: "All available",
    momentAppearance: "Moment appearance",
    themeWhite: "White",
    themeBlack: "Black",
    momentsCoverImage: "Moments cover image",
    saveCommunitySettings: "Save Community settings",
    communitySearchPeople: "Search people",
    communitySearchPlaceholder: "Search name or email to add friends",
    search: "Search",
    communityCommons: "The Commons",
    yours: "Yours",
    sharedBy: "Shared by",
    aFriend: "a friend",
    shareToChat: "Share to a chat",
    supportIntroBody: "You do not have to figure everything out alone. Choose the kind of support that feels manageable today.",
    supportEmergencyTitle: "Immediate danger",
    supportEmergencyDetail: "Call 911 or your local emergency service.",
    supportEmergencyAction: "Call 911",
    supportLifelineTitle: "988 Lifeline",
    supportLifelineDetail: "24/7 call, text, or chat support in the United States.",
    supportLifelineAction: "Open 988",
    supportContactUsTitle: "Contact us",
    supportContactUsAction: "Email us",
    supportPrepareOne: "Make a short list of questions before calling a provider.",
    supportPrepareTwo: "Ask for written next steps or accommodations.",
    supportPrepareThree: "Invite a trusted person to join an appointment.",
    supportSearchPlaceholder: "For example: I need affordable family support, respite care, or a local parent group…",
    communityDirectIntro: "Private conversations with accepted friends.",
    communityDirectEmpty: "Search above to add your first friend.",
    communitySuggestionsIntro: "Suggestions use only shared survey categories.",
    communitySuggestionsEmpty: "No suggestions yet.",
    communityNotificationsTitle: "Notifications",
    communityNotificationsIntro: "New messages, Moments, invitations, and requests.",
    communityAllCaughtUp: "You are all caught up.",
    communityMarkAllRead: "Mark all as read",
    communityFriendRequests: "Friend requests",
    communityNoFriendRequests: "No new friend requests.",
    communityGroupInvitations: "Group invitations",
    communityNoGroupInvitations: "No new group invitations.",
    communityBlockedUsers: "Blocked users",
    communityGroupsIntro: "Create a group and invite friends to join.",
    communityGroupName: "Group name",
    communityDescription: "Description",
    communityInviteFriends: "Invite friends",
    communityCreateGroup: "Create group",
    communityNoGroups: "No groups yet.",
    communityAddFriendFirst: "Add a friend before choosing specific people.",
    backIsland: "Back to island",
    resourcesReadyCount: "{count} resources ready",
    resourcesLive: "Live from Google Sheets · auto-refreshes",
    resourcesCache: "Google Sheets · recently refreshed",
    resourcesFallback: "Bundled fallback · check sheet access"
  },
  zh: {
    quickSearch: "快速检索",
    quickSearchEyebrow: "检索整个村庄",
    quickSearchIntro: "描述你的需求并选择主题，Waffles 会直接检索实时资源数据库，无需先进入某栋建筑。",
    quickSearchTopic: "主题",
    quickSearchPath: "个人记录范围",
    quickSearchAnyPath: "使用完整个人记录",
    quickSearchQuery: "你想查找什么？",
    quickSearchPlaceholder: "例如：适合 10 岁孩子、离我较近的感官友好型周末活动……",
    quickSearchSubmit: "立即检索",
    quickSearchHint: "岛屿地图下方的状态栏仍然可以打开“我的记录”。",
    changeProfilePhoto: "更换头像",
    profilePhotoUpdated: "头像已更新。",
    avatarAccountRequired: "请先注册或登录账户，再上传头像。",
    aiExampleEducation: "例如：我想为一名初中生寻找执行功能方面的支持……",
    aiExampleLegal: "例如：我需要帮助理解一名 11 岁学生的 504 计划……",
    aiExampleRecreation: "例如：我想寻找附近安静、包容的周末活动……",
    communitySelfTab: "我的",
    yourVillageProfile: "你的村庄资料",
    communitySelfIntro: "管理社区中只属于你的资料与内容。",
    changePhoto: "更换头像",
    savedFromChat: "从聊天中收藏",
    savedFromChatIntro: "你选择保留的文件、位置、笔记和消息。",
    savedFromChatEmpty: "你从聊天中收藏的内容会显示在这里。",
    villageDocuments: "村庄文档",
    villageDocumentsIntro: "你的文档、可打印 PDF 和表单。",
    createDocument: "创建文档",
    noVillageDocuments: "还没有保存村庄文档。",
    yourStickers: "你的表情包",
    yourStickersIntro: "上传图片，或保存其他人发送的表情包。",
    addSticker: "添加表情包",
    deleteSticker: "删除表情包",
    noCustomStickers: "还没有自定义表情包。",
    privacyNotifications: "隐私与通知",
    privacyNotificationsIntro: "这些设置会应用到你在所有设备上的账户。",
    communityNotifications: "社区通知",
    communityNotificationsHint: "新聊天、动态和请求会显示未读红点。",
    appearSearch: "允许出现在成员搜索中",
    appearSearchHint: "关闭后，好友仍然可以打开你的资料。",
    acceptPrivateMessages: "接收私聊消息",
    acceptPrivateMessagesHint: "暂停新消息时不会删除好友。",
    allowLocationSharing: "允许分享位置",
    allowLocationSharingHint: "开启后，本浏览器才可以发送你的当前位置。",
    allowStrangersAdd: "允许陌生人添加我",
    allowStrangersAddHint: "关闭后将不再接收陌生人的好友申请。",
    allowStrangersMoments: "允许陌生人查看动态",
    allowStrangersMomentsHint: "被屏蔽的用户永远无法查看你的动态。",
    friendsMomentRange: "好友可查看的动态范围",
    last7Days: "最近 7 天",
    last30Days: "最近 30 天",
    last6Months: "最近 6 个月",
    lastYear: "最近一年",
    allAvailable: "全部动态",
    momentAppearance: "动态外观",
    themeWhite: "白色",
    themeBlack: "黑色",
    momentsCoverImage: "动态封面图片",
    saveCommunitySettings: "保存社区设置",
    communitySearchPeople: "搜索成员",
    communitySearchPlaceholder: "输入姓名或邮箱添加好友",
    search: "搜索",
    communityCommons: "村庄广场",
    yours: "我的",
    sharedBy: "分享者",
    aFriend: "一位好友",
    shareToChat: "分享到聊天",
    supportIntroBody: "你不必独自解决所有问题。请选择今天最容易开始的一种支持方式。",
    supportEmergencyTitle: "紧急危险",
    supportEmergencyDetail: "请拨打 911 或当地紧急服务电话。",
    supportEmergencyAction: "拨打 911",
    supportLifelineTitle: "988 危机援助热线",
    supportLifelineDetail: "美国境内全天候提供电话、短信和在线聊天支持。",
    supportLifelineAction: "打开 988",
    supportContactUsTitle: "联系我们",
    supportContactUsAction: "发送邮件",
    supportPrepareOne: "联系服务机构前，先列出几个最重要的问题。",
    supportPrepareTwo: "请对方提供书面的后续步骤或便利安排。",
    supportPrepareThree: "邀请一位信任的人陪同参加预约。",
    supportSearchPlaceholder: "例如：我需要费用可负担的家庭支持、喘息服务或本地家长小组……",
    communityDirectIntro: "与已接受的好友进行私人对话。",
    communityDirectEmpty: "请使用上方搜索添加第一位好友。",
    communitySuggestionsIntro: "推荐只使用双方共有的问卷类别。",
    communitySuggestionsEmpty: "目前还没有推荐。",
    communityNotificationsTitle: "通知",
    communityNotificationsIntro: "查看新消息、动态、邀请和请求。",
    communityAllCaughtUp: "所有通知都已查看。",
    communityMarkAllRead: "全部标为已读",
    communityFriendRequests: "好友请求",
    communityNoFriendRequests: "没有新的好友请求。",
    communityGroupInvitations: "群组邀请",
    communityNoGroupInvitations: "没有新的群组邀请。",
    communityBlockedUsers: "已屏蔽的用户",
    communityGroupsIntro: "创建群组并邀请好友加入。",
    communityGroupName: "群组名称",
    communityDescription: "描述",
    communityInviteFriends: "邀请好友",
    communityCreateGroup: "创建群组",
    communityNoGroups: "目前还没有群组。",
    communityAddFriendFirst: "请先添加好友，再选择特定成员。",
    backIsland: "返回岛屿",
    resourcesReadyCount: "已准备 {count} 条资源",
    resourcesLive: "来自 Google Sheets · 自动刷新",
    resourcesCache: "Google Sheets · 最近已刷新",
    resourcesFallback: "正在使用内置备份 · 请检查表格访问权限"
  },
  es: {
    quickSearch: "Búsqueda rápida",
    quickSearchEyebrow: "Busca en toda la aldea",
    quickSearchIntro: "Describe lo que necesitas, elige un tema y Waffles buscará en la base de datos sin que tengas que entrar primero en un edificio.",
    quickSearchTopic: "Tema",
    quickSearchPath: "Enfoque del perfil",
    quickSearchAnyPath: "Usar mi registro completo",
    quickSearchQuery: "¿Qué te gustaría encontrar?",
    quickSearchPlaceholder: "Por ejemplo: un programa de fin de semana sensorialmente accesible para una persona de 10 años…",
    quickSearchSubmit: "Buscar ahora",
    quickSearchHint: "Aún puedes abrir Mi registro desde la fila de estado bajo el mapa.",
    changeProfilePhoto: "Cambiar foto de perfil",
    profilePhotoUpdated: "Foto de perfil actualizada.",
    avatarAccountRequired: "Crea una cuenta o inicia sesión antes de añadir una foto.",
    aiExampleEducation: "Por ejemplo: busco apoyo para funciones ejecutivas de un estudiante de secundaria…",
    aiExampleLegal: "Por ejemplo: necesito entender un plan 504 para una persona de 11 años…",
    aiExampleRecreation: "Por ejemplo: busco una actividad tranquila e inclusiva cerca de mí…",
    communitySelfTab: "Yo",
    yourVillageProfile: "Tu perfil de la aldea",
    communitySelfIntro: "Administra las partes de la Comunidad que solo te pertenecen a ti.",
    changePhoto: "Cambiar foto",
    savedFromChat: "Guardado del chat",
    savedFromChatIntro: "Archivos, ubicaciones, notas y mensajes que elegiste conservar.",
    savedFromChatEmpty: "Lo que guardes del chat aparecerá aquí.",
    villageDocuments: "Documentos de la aldea",
    villageDocumentsIntro: "Tus documentos, PDF imprimibles y formularios.",
    createDocument: "Crear documento",
    noVillageDocuments: "Aún no hay documentos guardados.",
    yourStickers: "Tus stickers",
    yourStickersIntro: "Sube una imagen o guarda un sticker que te envíen.",
    addSticker: "Añadir sticker",
    deleteSticker: "Eliminar sticker",
    noCustomStickers: "Aún no hay stickers personalizados.",
    privacyNotifications: "Privacidad y notificaciones",
    privacyNotificationsIntro: "Estas opciones se aplican a tu cuenta en todos los dispositivos.",
    communityNotifications: "Notificaciones de la comunidad",
    communityNotificationsHint: "Muestra puntos sin leer en chats, Momentos y solicitudes.",
    appearSearch: "Aparecer en la búsqueda",
    appearSearchHint: "Tus amistades aún pueden abrir tu perfil al desactivarlo.",
    acceptPrivateMessages: "Aceptar mensajes privados",
    acceptPrivateMessagesHint: "Pausa mensajes nuevos sin eliminar amistades.",
    allowLocationSharing: "Permitir compartir ubicación",
    allowLocationSharingHint: "Se requiere antes de que el navegador envíe tu ubicación.",
    allowStrangersAdd: "Permitir solicitudes de desconocidos",
    allowStrangersAddHint: "Desactívalo para dejar de recibir solicitudes de desconocidos.",
    allowStrangersMoments: "Permitir que desconocidos vean Momentos",
    allowStrangersMomentsHint: "Las personas bloqueadas nunca ven tus Momentos.",
    friendsMomentRange: "Tus amistades pueden ver Momentos de",
    last7Days: "Últimos 7 días",
    last30Days: "Últimos 30 días",
    last6Months: "Últimos 6 meses",
    lastYear: "Último año",
    allAvailable: "Todo lo disponible",
    momentAppearance: "Apariencia de Momentos",
    themeWhite: "Blanco",
    themeBlack: "Negro",
    momentsCoverImage: "Imagen de portada de Momentos",
    saveCommunitySettings: "Guardar ajustes de la comunidad",
    communitySearchPeople: "Buscar personas",
    communitySearchPlaceholder: "Busca por nombre o correo para añadir amistades",
    search: "Buscar",
    communityCommons: "La plaza",
    yours: "Tuyo",
    sharedBy: "Compartido por",
    aFriend: "una amistad",
    shareToChat: "Compartir en un chat",
    supportIntroBody: "No tienes que resolverlo todo a solas. Elige el tipo de apoyo que te resulte manejable hoy.",
    supportEmergencyTitle: "Peligro inmediato",
    supportEmergencyDetail: "Llama al 911 o al servicio de emergencias local.",
    supportEmergencyAction: "Llamar al 911",
    supportLifelineTitle: "Línea 988",
    supportLifelineDetail: "Apoyo por llamada, mensaje o chat las 24 horas en Estados Unidos.",
    supportLifelineAction: "Abrir 988",
    supportContactUsTitle: "Contáctanos",
    supportContactUsAction: "Enviar correo",
    supportPrepareOne: "Haz una lista breve de preguntas antes de llamar a un proveedor.",
    supportPrepareTwo: "Pide los próximos pasos o adaptaciones por escrito.",
    supportPrepareThree: "Invita a una persona de confianza a acompañarte a una cita.",
    supportSearchPlaceholder: "Por ejemplo: necesito apoyo familiar asequible, cuidado de relevo o un grupo local de familias…",
    communityDirectIntro: "Conversaciones privadas con amistades aceptadas.",
    communityDirectEmpty: "Busca arriba para añadir tu primera amistad.",
    communitySuggestionsIntro: "Las sugerencias usan solo categorías compartidas de la encuesta.",
    communitySuggestionsEmpty: "Aún no hay sugerencias.",
    communityNotificationsTitle: "Notificaciones",
    communityNotificationsIntro: "Mensajes, Momentos, invitaciones y solicitudes nuevas.",
    communityAllCaughtUp: "No tienes notificaciones pendientes.",
    communityMarkAllRead: "Marcar todo como leído",
    communityFriendRequests: "Solicitudes de amistad",
    communityNoFriendRequests: "No hay nuevas solicitudes.",
    communityGroupInvitations: "Invitaciones a grupos",
    communityNoGroupInvitations: "No hay nuevas invitaciones.",
    communityBlockedUsers: "Personas bloqueadas",
    communityGroupsIntro: "Crea un grupo e invita a tus amistades.",
    communityGroupName: "Nombre del grupo",
    communityDescription: "Descripción",
    communityInviteFriends: "Invitar amistades",
    communityCreateGroup: "Crear grupo",
    communityNoGroups: "Aún no hay grupos.",
    communityAddFriendFirst: "Añade una amistad antes de elegir personas específicas.",
    backIsland: "Volver a la isla",
    resourcesReadyCount: "{count} recursos listos",
    resourcesLive: "En vivo desde Google Sheets · actualización automática",
    resourcesCache: "Google Sheets · actualizado recientemente",
    resourcesFallback: "Copia incluida · revisa el acceso a la hoja"
  }
};

Object.entries(supplementalI18n).forEach(([language, values]) => Object.assign(i18n[language], values));

class VillageAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.environmentGain = null;
    this.musicGain = null;
    this.animalGain = null;
    this.notificationGain = null;
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
      this.notificationGain = this.context.createGain();
      this.master.gain.value = 0;
      this.notificationGain.gain.value = .16;
      this.environmentGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.animalGain.connect(this.master);
      this.notificationGain.connect(this.context.destination);
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.createNoiseBuffer();
    }
  }

  async unlockNotifications() {
    this.ensureContext();
    if (this.context.state !== "running") await this.context.resume();
  }

  playChatDing() {
    this.ensureContext();
    if (this.context.state !== "running") return;
    const now = this.context.currentTime;
    [[740, 0], [988, .085]].forEach(([frequency, delay]) => {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + delay);
      gain.gain.setValueAtTime(.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(.55, now + delay + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .16);
      oscillator.connect(gain);
      gain.connect(this.notificationGain);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + .18);
    });
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
    if (state.settings.calm) return;
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
      deer: () => this.chirp([220, 180], { type: "sine", level: .016, duration: .42, gap: .18 }),
      gull: () => this.airyBird("gull"),
      owl: () => this.chirp([330, 250, 330], { type: "sine", level: .018, duration: .38, gap: .22 }),
      cricket: () => this.chirp([2280, 2510, 2340, 2620], { type: "sine", level: .006, duration: .055, gap: .07 }),
      frog: () => this.chirp([145, 178], { type: "triangle", level: .012, duration: .18, gap: .13 })
    };
    (profiles[species] || profiles.bird)();
  }

  playAnimal(species) {
    if (!this.context || this.context.state !== "running" || !state.settings.soundEnabled || state.settings.calm) return;
    const samples = config.ecosystem?.audio?.samples || {};
    const sampleKey = species === "gull" && !samples.gull ? "bird" : species;
    const sample = samples[sampleKey];
    const volume = Number(sample?.volume || .3) * (species === "gull" ? .76 : 1);
    if (sample && this.playBuffer(this.buffers.get(sampleKey), this.animalGain, volume, Number(sample.maximumDuration || 0) || null)) return;
    this.synthesizeSpecies(species);
  }

  animalCall() {
    const present = (state.ecosystem?.audibleSpecies(state.selectedIsland) || ["bird"]).filter((species) => !["rabbit", "cow", "sheep"].includes(species));
    const seasonalVisitors = { spring: ["bird", "frog"], summer: ["bird", "cricket", "frog"], autumn: ["bird", "owl", "fox"], winter: ["owl", "deer"] }[this.season] || ["bird"];
    const species = [...present, ...seasonalVisitors, ...seasonalVisitors];
    if (!species.length) return;
    this.playAnimal(species[Math.floor(Math.random() * species.length)]);
  }

  scheduleAnimal() {
    clearTimeout(this.animalTimer);
    if (!state.settings.soundEnabled || state.settings.calm) return;
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
    if (state.settings.calm) return;
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
    const ambientScale = state.settings.calm ? 0 : 1;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(enabled ? Number(state.settings.masterVolume ?? .35) : 0, now, .08);
    this.environmentGain.gain.setTargetAtTime(Number(state.settings.environmentVolume ?? .65) * ambientScale, now, .08);
    this.musicGain.gain.setTargetAtTime(Number(state.settings.musicVolume ?? .26) * ambientScale, now, .08);
    this.animalGain.gain.setTargetAtTime(Number(state.settings.animalVolume ?? .22) * ambientScale, now, .08);
    if (!enabled || state.settings.calm) { clearTimeout(this.animalTimer); this.stopEnvironment(); this.stopMusic(); }
    else {
      if (!this.environmentNodes.length) this.restartEnvironment();
      this.scheduleAnimal();
      if (!this.musicTimer && !this.musicNodes.length) this.restartMusic();
    }
  }
}

state.audio = new VillageAudio();
state.ecosystem = new EcosystemController({
  config: config.ecosystem,
  stage: $("#map-stage"),
  creatureLayer: $("#creature-layer"),
  skyLayer: $("#sky-creature-layer"),
  onSound: (species) => state.audio?.playAnimal(species),
  onBuilding: (buildingId) => handleBuilding(buildingId)
});
state.immersive = new ImmersiveScene({
  canvas: $("#immersive-scene"),
  stage: $("#map-stage"),
  buildings: config.buildings
});
state.interior3d = new LiveBuildingInterior({
  canvas: $("#building-interior-3d"),
  container: $("#building-interior")
});
state.surfaceMotion = new SurfaceMotion({ canvas: $("#surface-motion"), stage: $("#map-stage") });

function t(key) {
  const language = state.settings.language || "en";
  return i18n[language]?.[key] || i18n.en[key] || key;
}

function effectiveVisualQuality() {
  return state.settings.calm ? "low" : state.settings.visualQuality || "high";
}

function effectiveEnvironment(environment = state.environment || {}) {
  if (!state.settings.calm) return environment;
  return {
    ...environment,
    isDay: true,
    currentMinutes: 720,
    sunrise: 360,
    sunset: 1080,
    weather: "clear",
    weatherKind: "clear",
    season: "summer",
    windSpeed: 0,
    cloudCover: 0
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(state.user?.guest ? { "X-Village-Guest": "1" } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    error.code = data.code || "";
    error.data = data;
    error.moderation = data.moderation || null;
    throw error;
  }
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
    refreshAnnouncementBadge();
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

function prepareSurveyForm(editing = false) {
  const form = $("#survey-form");
  if (!form) return;
  form.reset();
  state.surveyEditing = Boolean(editing);
  const responses = editing ? state.user?.profile?.responses || {} : {};
  const selectedInterests = new Set(Array.isArray(responses.interests) ? responses.interests : []);
  const selectedSituations = new Set(Array.isArray(responses.situation) ? responses.situation : []);
  $$('input[name="interests"]', form).forEach((input) => { input.checked = selectedInterests.has(input.value); });
  $$('input[name="situation"]', form).forEach((input) => { input.checked = selectedSituations.has(input.value); });
  $$('input[name="age"]', form).forEach((input) => { input.checked = input.value === responses.age; });
  form.elements.journey.value = responses.journey || "";
  form.elements.note.value = responses.note || "";
  $("#survey-title").textContent = editing ? "Update your Community Compass" : "What would make the village more useful to you?";
  $("#survey-lede").textContent = editing
    ? "Change any answer below. Saving will immediately replace the matching details in your personal record."
    : "These answers create a personal record for resource matching. They are not used to diagnose anyone.";
  $("#survey-edit-controls").classList.toggle("hidden", !editing);
  const submit = form.querySelector("button[type='submit']");
  submit.innerHTML = editing ? "Update my personal record <span aria-hidden='true'>→</span>" : "Create my personal record <span aria-hidden='true'>→</span>";
  $("#survey-error").textContent = "";
}

function startSurveyEdit() {
  if (!state.user || state.user.guest) return;
  closePanel();
  prepareSurveyForm(true);
  showScreen("survey");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelSurveyEdit() {
  state.surveyEditing = false;
  showScreen("app");
  profilePanel();
}

async function submitSurvey(event) {
  event.preventDefault();
  const formElement = event.target;
  const editing = state.surveyEditing;
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
  button.textContent = editing ? "Updating your record…" : "Creating your record…";
  try {
    const { user, sync } = await api("/api/profile", { method: "POST", body: JSON.stringify({ responses }) });
    state.user = user;
    state.sheetSync = { configured: sync.synced || state.sheetSync.configured, ...sync };
    state.surveyEditing = false;
    showScreen("app");
    hydrateApp();
    if (editing) setTimeout(profilePanel, 0);
    toast(sync.synced ? "Personal record saved and synced." : "Personal record saved. Sheet sync is queued when available.");
  } catch (error) {
    $("#survey-error").textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = editing ? "Update my personal record <span aria-hidden='true'>→</span>" : "Create my personal record <span aria-hidden='true'>→</span>";
  }
}

function routeForUser() {
  if (!state.user) {
    stopCommunityUpdates();
    return showScreen("auth");
  }
  if (!state.user.surveyCompleted) {
    stopCommunityUpdates();
    prepareSurveyForm(false);
    return showScreen("survey");
  }
  showScreen("app");
  hydrateApp();
  if (state.user.guest) stopCommunityUpdates();
  else startCommunityUpdates();
}

function renderAccountStatus() {
  const guest = Boolean(state.user?.guest);
  $("#record-status-title").textContent = t(guest ? "guestReady" : "personalReady");
  $("#record-status-detail").textContent = t(guest ? "guestMatch" : "personalMatch");
  $("#record-status-action").textContent = t(guest ? "account" : "view");
  $("#admin-functions-button")?.classList.toggle("hidden", !state.user?.isAdmin);
  renderHeaderAvatar();
}

function renderHeaderAvatar() {
  const button = $(".avatar-button");
  if (!button) return;
  button.setAttribute("aria-label", t("recordTitle"));
  button.title = t("recordTitle");
  const imageDataUrl = String(state.user?.avatarDataUrl || "");
  if (imageDataUrl) {
    const image = document.createElement("img");
    image.src = imageDataUrl;
    image.alt = "";
    button.replaceChildren(image);
    return;
  }
  const initial = document.createElement("span");
  initial.id = "avatar-initial";
  initial.textContent = (state.user?.name || "C").charAt(0).toUpperCase();
  button.replaceChildren(initial);
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
      ${building.type === "support" ? `<span class="community-hotspot-badge hidden" data-community-unread-badge aria-label="Unread Village messages"></span>` : ""}
    </button>`).join("");
  renderCommunityBadges();
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

function openPanel({ title, eyebrow = "Village building", html, className = "" }) {
  $("#panel-title").textContent = title;
  $("#panel-eyebrow").textContent = eyebrow;
  $("#panel-content").innerHTML = html;
  $("#panel").classList.toggle("community-workspace-panel", className === "community-workspace-panel");
  $("#panel").scrollTop = 0;
  $("#panel").classList.add("open");
  $("#panel").setAttribute("aria-hidden", "false");
  $("#panel-scrim").classList.add("open");
  $("#panel .icon-button").focus();
}

function closePanel({ keepInterior = false } = {}) {
  clearInterval(state.communityTimer);
  state.communityTimer = null;
  state.communityRoom = null;
  $("#panel").classList.remove("open", "community-workspace-panel");
  $("#panel").setAttribute("aria-hidden", "true");
  $("#panel-scrim").classList.remove("open");
  if (!keepInterior) hideBuildingInterior();
}

function hideBuildingInterior() {
  clearTimeout(state.buildingTransitionTimer);
  state.buildingTransitionTimer = null;
  $("#building-loading")?.classList.add("hidden");
  $("#building-loading")?.classList.remove("active");
  $("#building-loading")?.setAttribute("aria-hidden", "true");
  $("#building-interior")?.classList.add("hidden");
  $("#building-interior")?.setAttribute("aria-hidden", "true");
  state.interior3d?.close();
  document.body.classList.remove("building-mode", "building-transitioning");
  state.activeBuilding = null;
}

function exitBuilding() {
  closePanel({ keepInterior: true });
  hideBuildingInterior();
}

function supportIcon(name) {
  if (name === "phone") return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.5 4.6 4.8c-.8.4-1.2 1.3-1 2.2 1.4 6.7 6.7 12 13.4 13.4.9.2 1.8-.2 2.2-1l1.3-2.6-4.2-2-1.4 2c-3.4-1.2-6.5-4.3-7.7-7.7l2-1.4-2-4.2Z"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>`;
}

function guideCharacter(topic = "Waffles", { id = "", className = "", decorative = false } = {}) {
  const character = GUIDE_CHARACTERS[topic] || GUIDE_CHARACTERS.Waffles;
  return `<img${id ? ` id="${id}"` : ""} class="village-character panel-character${className ? ` ${className}` : ""}" src="${character.src}" alt="${decorative ? "" : character.alt}">`;
}

function characterGreeting(name) {
  if (state.settings.language === "zh") return `你好，我是 ${name}。`;
  if (state.settings.language === "es") return `Hola, soy ${name}.`;
  return `Hi, I’m ${name}.`;
}

function guideText(key, topic = state.currentTopic) {
  const character = GUIDE_CHARACTERS[topic] || GUIDE_CHARACTERS.Waffles;
  return t(key).replaceAll("Waffles", character.name);
}

function resourceSearchForm(topic = "Support") {
  const examples = topic === "Support" ? t("supportSearchPlaceholder") : "Describe what kind of resource would help…";
  return `<div class="ai-shell support-search-shell"><div class="support-search-intro"><h3>${escapeHtml(t("supportSearchTitle"))}</h3><p>${escapeHtml(t("supportSearchIntro"))}</p></div><form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}"></textarea></label><label class="result-count">${escapeHtml(t("resultCount"))}<select name="count">${[3,4,5,6,7,8,9,10].map((value) => `<option value="${value}" ${value === Number(state.settings.resourceCount || 5) ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form><div id="ai-results"></div><p class="privacy-note">${escapeHtml(t(topic === "Support" ? "supportSearchDisclaimer" : "aiDisclaimer"))}</p></div>`;
}

function supportPanel(tab = state.supportTab, island = state.supportIsland || state.selectedIsland) {
  state.supportTab = tab;
  state.supportIsland = island;
  state.currentTopic = "Caregiver Support";
  state.currentDiagnosis = island === "autism" ? "Autism" : island === "adhd" ? "ADHD" : "";
  const contacts = [
    { title: t("supportEmergencyTitle"), detail: t("supportEmergencyDetail"), href: "tel:911", action: t("supportEmergencyAction") },
    { title: t("supportLifelineTitle"), detail: t("supportLifelineDetail"), href: "https://988lifeline.org", action: t("supportLifelineAction") },
    { title: t("supportContactUsTitle"), detail: "Ittakesavillage.capybara@gmail.com", href: "mailto:Ittakesavillage.capybara@gmail.com", action: t("supportContactUsAction") }
  ];
  const prepareOptions = [t("supportPrepareOne"), t("supportPrepareTwo"), t("supportPrepareThree")];
  const phoneContent = `<p class="panel-intro">${escapeHtml(t("supportIntroBody"))}</p>
      <article class="community-launch"><div><small>${escapeHtml(t("communityTitle"))}</small><h3>${escapeHtml(t("communityIntro"))}</h3><p>${escapeHtml(t("communityPrivacy"))}</p></div><button type="button" class="primary-button community-launch-button" data-action="open-community">${escapeHtml(t("communityOpen"))} →<span class="community-launch-badge hidden" data-community-unread-badge aria-label="Unread Village messages"></span></button></article>
      <div class="card-list">${contacts.map((contact) => `<article class="info-card"><div><h3>${escapeHtml(contact.title)}</h3><p>${escapeHtml(contact.detail)}</p></div><a href="${escapeHtml(contact.href)}" target="${contact.href.startsWith("http") ? "_blank" : "_self"}" rel="noreferrer">${escapeHtml(contact.action)} →</a></article>`).join("")}</div>
      <h3>${escapeHtml(t("prepare"))}</h3><ul class="gentle-list">${prepareOptions.map((option) => `<li>${escapeHtml(option)}</li>`).join("")}</ul>`;
  openPanel({
    title: t("supportTitle"),
    eyebrow: t("supportEyebrow"),
    html: `<div class="support-shell"><div class="mori-stage support-character-stage">${guideCharacter("Support")}<div><h3>${escapeHtml(characterGreeting(GUIDE_CHARACTERS.Support.name))}</h3><p>${escapeHtml(t("supportGuideIntro"))}</p></div></div>${tab === "search" ? resourceSearchForm("Support") : phoneContent}<nav class="support-dock" aria-label="Support options"><button type="button" class="${tab === "phone" ? "active" : ""}" data-action="support-tab" data-support-tab="phone">${supportIcon("phone")}<span>${escapeHtml(t("supportContactTab"))}</span></button><button type="button" class="${tab === "search" ? "active" : ""}" data-action="support-tab" data-support-tab="search">${supportIcon("search")}<span>${escapeHtml(t("supportFindTab"))}</span></button></nav></div>`
  });
  renderCommunityBadges();
}

function communityFriendChoices(data, field, { disabled = false } = {}) {
  return (data.directRooms || []).map((friend) => `<label class="friend-choice"><input type="checkbox" name="${field}" value="${escapeHtml(friend.user_id)}" ${disabled ? "disabled" : ""}> ${escapeHtml(friend.name)}</label>`).join("") || `<small>${escapeHtml(t("communityAddFriendFirst"))}</small>`;
}

function communityAvatarHtml(person = {}, { className = "", clickable = true } = {}) {
  const userId = person.userId || person.user_id || "";
  const name = person.displayName || person.display_name || person.name || person.author || "Village member";
  const image = person.avatarDataUrl || person.avatar_data_url || "";
  const content = image ? `<img src="${escapeHtml(image)}" alt="">` : `<span>${escapeHtml(String(name).charAt(0).toUpperCase())}</span>`;
  if (!clickable || !userId) return `<span class="community-avatar ${escapeHtml(className)}" aria-label="${escapeHtml(name)}">${content}</span>`;
  return `<button type="button" class="community-avatar community-avatar-button ${escapeHtml(className)}" data-action="open-community-profile" data-user-id="${escapeHtml(userId)}" title="View ${escapeHtml(name)}'s Moments">${content}</button>`;
}

function communityTime(value) {
  const date = new Date(value);
  const seconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function communityStickerButtons({ action = "send-custom-sticker", postId = "" } = {}) {
  const custom = (state.communityStickers || []).map((sticker) => `<button type="button" class="custom-sticker-button" data-action="${escapeHtml(action)}" data-sticker-id="${escapeHtml(sticker.id)}" data-sticker-src="${escapeHtml(sticker.imageDataUrl)}" ${postId ? `data-post-id="${escapeHtml(postId)}"` : ""} title="${escapeHtml(sticker.name)}"><img src="${escapeHtml(sticker.imageDataUrl)}" alt="${escapeHtml(sticker.name)}"></button>`).join("");
  return custom || `<small class="sticker-empty">Upload an image to create your first sticker.</small>`;
}

function communityCommentsHtml(post) {
  const comments = (post.comments || []).map((comment) => `<article class="moment-comment">
    ${communityAvatarHtml(comment, { className: "small" })}
    <div><header><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(comment.userId)}">${escapeHtml(comment.author)}</button><time>${escapeHtml(communityTime(comment.createdAt))}</time></header>
      ${comment.body ? `<p>${escapeHtml(comment.body)}</p>` : ""}
      ${comment.imageDataUrl ? `<img class="moment-comment-image" src="${escapeHtml(comment.imageDataUrl)}" alt="Comment image from ${escapeHtml(comment.author)}">` : ""}
      ${comment.stickerDataUrl ? `<div class="moment-comment-sticker"><img src="${escapeHtml(comment.stickerDataUrl)}" alt="Sticker from ${escapeHtml(comment.author)}">${!comment.mine ? `<button type="button" data-action="save-custom-sticker" data-sticker-src="${escapeHtml(comment.stickerDataUrl)}" data-sticker-name="${escapeHtml(`${comment.author}'s sticker`)}">Save sticker</button>` : ""}</div>` : ""}
      ${comment.mine || post.mine ? `<button type="button" class="moment-delete-link" data-action="delete-community-comment" data-post-id="${escapeHtml(post.id)}" data-comment-id="${escapeHtml(comment.id)}">Delete</button>` : ""}
    </div>
  </article>`).join("");
  return comments ? `<div class="moment-comments">${comments}</div>` : "";
}

function communityPostsHtml(posts = [], { chatWritable = communityCanChatWrite() } = {}) {
  const disabled = chatWritable ? "" : "disabled";
  return posts.map((post) => `<article class="community-post moment-post">
    <aside>${communityAvatarHtml(post)}</aside>
    <div class="moment-post-body">
      <header><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(post.userId)}"><strong>${escapeHtml(post.author)}</strong></button><time title="${escapeHtml(new Date(post.createdAt).toLocaleString())}">${escapeHtml(communityTime(post.createdAt))}</time></header>
      ${post.body ? `<p class="moment-text">${escapeHtml(post.body)}</p>` : ""}
      ${post.imageDataUrl ? `<button type="button" class="moment-photo" data-action="open-moment-photo" data-image-src="${escapeHtml(post.imageDataUrl)}"><img src="${escapeHtml(post.imageDataUrl)}" alt="Photo shared by ${escapeHtml(post.author)}"></button>` : ""}
      <div class="moment-actions"><button type="button" ${disabled} ${chatWritable ? `data-action="focus-community-comment"` : `title="Comments are unavailable during your chat mute."`} data-post-id="${escapeHtml(post.id)}">Comment</button>${post.mine ? `<button type="button" data-action="delete-community-post" data-post-id="${escapeHtml(post.id)}">Delete</button>` : ""}</div>
      ${communityCommentsHtml(post)}
      <form class="moment-comment-form" data-community-comment-form data-post-id="${escapeHtml(post.id)}">
        <input name="text" ${disabled} maxlength="1000" placeholder="${escapeHtml(chatWritable ? "Comment kindly…" : "Comments are unavailable during your chat mute.")}">
        <label class="moment-comment-tool" title="${escapeHtml(chatWritable ? "Add an image" : "Comments are unavailable during your chat mute.")}"><span>+</span><input type="file" ${disabled} accept="image/png,image/jpeg,image/webp,image/gif" data-community-comment-image data-post-id="${escapeHtml(post.id)}"></label>
        <button type="button" ${disabled} class="moment-comment-tool" ${chatWritable ? `data-action="toggle-comment-stickers"` : ""} data-post-id="${escapeHtml(post.id)}" title="${escapeHtml(chatWritable ? "Add a sticker" : "Comments are unavailable during your chat mute.")}">☺</button>
        <button type="submit" ${disabled}>Send</button>
        <div class="moment-comment-preview" data-comment-preview="${escapeHtml(post.id)}"></div>
        <div class="moment-comment-sticker-tray hidden" data-comment-stickers="${escapeHtml(post.id)}">${chatWritable ? communityStickerButtons({ action: "comment-custom-sticker", postId: post.id }) : ""}</div>
        <p class="form-error" role="alert"></p>
      </form>
    </div>
  </article>`).join("") || `<div class="moment-empty"><strong>No Moments yet</strong><p>Use the camera button to share the first photo or update with friends.</p></div>`;
}

function communityNavIcon(tab) {
  if (tab === "direct") return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="10" r="4"/><circle cx="22" cy="10" r="4"/><path d="M3.5 24c.8-5 3.2-7.5 6.5-7.5s5.7 2.5 6.5 7.5M15.5 24c.8-5 3.2-7.5 6.5-7.5s5.7 2.5 6.5 7.5"/><path d="M12 7h8"/></svg>`;
  if (tab === "groups") return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="5" r="3"/><circle cx="27" cy="16" r="3"/><circle cx="16" cy="27" r="3"/><circle cx="5" cy="16" r="3"/><circle cx="16" cy="16" r="8"/></svg>`;
  if (tab === "moments") return `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 10h6l2-3h8l2 3h6v16H4Z"/><circle cx="16" cy="18" r="5"/></svg>`;
  if (tab === "inbox") return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="24" height="19" rx="2"/><path d="m5 9 11 9L27 9"/></svg>`;
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="6"/><path d="M6 28c1-7 4-11 10-11s9 4 10 11"/><path d="M23 5h6M26 2v6"/></svg>`;
}

function communityNotificationsHtml(notifications = []) {
  return notifications.map((notification) => `<button type="button" class="community-notification ${notification.read ? "" : "unread"}" data-action="open-community-notification" data-notification-id="${escapeHtml(notification.id)}" data-notification-kind="${escapeHtml(notification.kind)}" data-notification-meta="${escapeHtml(JSON.stringify(notification.metadata || {}))}"><span class="notification-mark" aria-hidden="true"></span><div><strong>${escapeHtml(notification.title)}</strong><p>${escapeHtml(notification.body)}</p><time>${escapeHtml(communityTime(notification.createdAt))}</time></div></button>`).join("") || `<p class="community-empty">${escapeHtml(t("communityAllCaughtUp"))}</p>`;
}

function communityDocumentsHtml(documents = [], { compact = false, chatWritable = communityCanChatWrite() } = {}) {
  return documents.map((document) => `<article class="village-document-card ${compact ? "compact" : ""}"><span class="document-kind">${escapeHtml(String(document.kind || "doc").toUpperCase())}</span><button type="button" data-action="open-community-document" data-document-id="${escapeHtml(document.id)}"><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.mine ? t("yours") : `${t("sharedBy")} ${document.ownerName || t("aFriend")}`)} · ${escapeHtml(communityTime(document.updatedAt))}</small></button>${document.mine ? `<button type="button" class="document-share-button" ${chatWritable ? `data-action="share-community-document"` : "disabled"} data-document-id="${escapeHtml(document.id)}" title="${escapeHtml(chatWritable ? t("shareToChat") : "Sharing to chat is unavailable during your mute.")}">↗</button>` : ""}</article>`).join("") || `<p class="community-empty">${escapeHtml(t("noVillageDocuments"))}</p>`;
}

function communitySavedHtml(messages = []) {
  return messages.map((message) => `<article class="saved-community-item"><span>${escapeHtml(String(message.messageType || "text").toUpperCase())}</span><div><strong>${escapeHtml(message.author || t("communityTitle"))}</strong><p>${escapeHtml(message.body)}</p>${message.attachment ? `<a href="${escapeHtml(message.attachment.dataUrl)}" download="${escapeHtml(message.attachment.name)}">${escapeHtml(message.attachment.name)}</a>` : ""}</div><button type="button" data-action="unsave-community-message" data-message-id="${escapeHtml(message.id)}" title="${escapeHtml(t("savedFromChat"))}">×</button></article>`).join("") || `<p class="community-empty">${escapeHtml(t("savedFromChatEmpty"))}</p>`;
}

function communityMomentComposerHtml(data, { chatWritable = communityCanChatWrite(data) } = {}) {
  if (!state.communityPostComposerOpen || !chatWritable) return "";
  return `<section class="moment-composer-sheet">
    <header><div><small>NEW MOMENT</small><strong>Share with your village friends</strong></div><button type="button" data-action="toggle-moment-composer" title="Close composer">×</button></header>
    <form id="community-post-form" class="stack-form">
      <label><span class="sr-only">Moment text</span><textarea name="text" maxlength="2000" rows="3" placeholder="What would you like friends to know?"></textarea></label>
      <label class="moment-photo-picker"><span>Choose a photo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-image></label>
      <div id="community-image-preview" class="community-image-preview" aria-live="polite"></div>
      <details><summary>Audience · Friends</summary><strong>Only these friends (leave empty for all)</strong><div class="friend-choices">${communityFriendChoices(data, "allowedUserIds", { disabled: !chatWritable })}</div><strong>Hide from these friends</strong><div class="friend-choices">${communityFriendChoices(data, "deniedUserIds", { disabled: !chatWritable })}</div></details>
      <button class="primary-button" type="submit">Post Moment</button><p class="form-error" role="alert"></p>
    </form>
  </section>`;
}

function communitySelfHtml(data) {
  const preferences = data.preferences || {};
  const momentRanges = [[7, t("last7Days")], [30, t("last30Days")], [180, t("last6Months")], [365, t("lastYear")], [3650, t("allAvailable")]];
  return `<section class="community-self">
    <header class="community-self-profile">
      ${communityAvatarHtml({ userId: state.user?.id, name: data.displayName, avatarDataUrl: data.avatarDataUrl }, { clickable: false, className: "large" })}
      <div><small>${escapeHtml(t("yourVillageProfile"))}</small><h3>${escapeHtml(data.displayName)}</h3><p>${escapeHtml(t("communitySelfIntro"))}</p></div>
      <label class="self-avatar-upload">${escapeHtml(t("changePhoto"))}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-avatar></label>
    </header>
    <div class="community-self-grid">
      <section><div class="community-section-heading"><h3>${escapeHtml(t("savedFromChat"))}</h3><p>${escapeHtml(t("savedFromChatIntro"))}</p></div><div class="saved-community-list">${communitySavedHtml(state.communitySavedMessages)}</div></section>
      <section><div class="community-section-heading"><h3>${escapeHtml(t("villageDocuments"))}</h3><p>${escapeHtml(t("villageDocumentsIntro"))}</p></div><button type="button" class="secondary-button" data-action="create-community-document">${escapeHtml(t("createDocument"))}</button><div class="village-document-list">${communityDocumentsHtml(state.communityDocuments, { compact: true })}</div></section>
      <section><div class="community-section-heading"><h3>${escapeHtml(t("yourStickers"))}</h3><p>${escapeHtml(t("yourStickersIntro"))}</p></div><label class="self-sticker-upload">${escapeHtml(t("addSticker"))}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-sticker></label><div class="self-sticker-grid">${(state.communityStickers || []).map((sticker) => `<article><img src="${escapeHtml(sticker.imageDataUrl)}" alt="${escapeHtml(sticker.name)}"><button type="button" data-action="delete-custom-sticker" data-sticker-id="${escapeHtml(sticker.id)}" title="${escapeHtml(t("deleteSticker"))}">×</button></article>`).join("") || `<p class="community-empty">${escapeHtml(t("noCustomStickers"))}</p>`}</div></section>
    </div>
    <form id="community-privacy-form" class="community-privacy-form">
      <div class="community-section-heading"><h3>${escapeHtml(t("privacyNotifications"))}</h3><p>${escapeHtml(t("privacyNotificationsIntro"))}</p></div>
      <label class="community-switch"><span><strong>${escapeHtml(t("communityNotifications"))}</strong><small>${escapeHtml(t("communityNotificationsHint"))}</small></span><input type="checkbox" name="notificationsEnabled" ${preferences.notificationsEnabled !== false ? "checked" : ""}></label>
      <label class="community-switch"><span><strong>${escapeHtml(t("appearSearch"))}</strong><small>${escapeHtml(t("appearSearchHint"))}</small></span><input type="checkbox" name="discoverable" ${preferences.discoverable !== false ? "checked" : ""}></label>
      <label class="community-switch"><span><strong>${escapeHtml(t("acceptPrivateMessages"))}</strong><small>${escapeHtml(t("acceptPrivateMessagesHint"))}</small></span><input type="checkbox" name="directMessagesEnabled" ${preferences.directMessagesEnabled !== false ? "checked" : ""}></label>
      <label class="community-switch"><span><strong>${escapeHtml(t("allowLocationSharing"))}</strong><small>${escapeHtml(t("allowLocationSharingHint"))}</small></span><input type="checkbox" name="locationSharingEnabled" ${preferences.locationSharingEnabled ? "checked" : ""}></label>
      <label class="community-switch"><span><strong>${escapeHtml(t("allowStrangersAdd"))}</strong><small>${escapeHtml(t("allowStrangersAddHint"))}</small></span><input type="checkbox" name="allowStrangerRequests" ${preferences.allowStrangerRequests !== false ? "checked" : ""}></label>
      <label class="community-switch"><span><strong>${escapeHtml(t("allowStrangersMoments"))}</strong><small>${escapeHtml(t("allowStrangersMomentsHint"))}</small></span><input type="checkbox" name="allowStrangerMoments" ${preferences.allowStrangerMoments ? "checked" : ""}></label>
      <label>${escapeHtml(t("friendsMomentRange"))}<select name="momentVisibilityDays">${momentRanges.map(([value,label]) => `<option value="${value}" ${Number(preferences.momentVisibilityDays || 30) === value ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select></label>
      <label>${escapeHtml(t("momentAppearance"))}<select name="momentTheme"><option value="light" ${preferences.momentTheme !== "dark" ? "selected" : ""}>${escapeHtml(t("themeWhite"))}</option><option value="dark" ${preferences.momentTheme === "dark" ? "selected" : ""}>${escapeHtml(t("themeBlack"))}</option></select></label>
      <label class="self-cover-upload">${escapeHtml(t("momentsCoverImage"))}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-cover></label>
      <button type="submit" class="primary-button">${escapeHtml(t("saveCommunitySettings"))}</button><p class="form-error" role="status"></p>
    </form>
    <button type="button" class="text-button danger" data-action="disable-community">${escapeHtml(t("communityDisable"))}</button>
  </section>`;
}

function moderationDurationLabel(sanction = {}) {
  if (sanction.durationSeconds == null) return "Permanent";
  const seconds = Math.max(0, Number(sanction.durationSeconds || 0));
  const units = [
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"]
  ];
  for (const [size, label] of units) {
    if (seconds >= size && seconds % size === 0) {
      const value = seconds / size;
      return `${value} ${label}${value === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

function moderationSanctionsHtml(moderation = {}, { compact = false } = {}) {
  const sanctions = Array.isArray(moderation.sanctions) ? moderation.sanctions : [];
  return sanctions.map((sanction) => {
    const endsAt = sanction.endsAt
      ? new Date(sanction.endsAt).toLocaleString()
      : "No automatic end date";
    return `<article class="moderation-sanction-card ${compact ? "compact" : ""}">
      <div class="moderation-sanction-heading"><strong>${escapeHtml(sanction.label || sanction.type || "Community penalty")}</strong><span>${escapeHtml(moderationDurationLabel(sanction))}</span></div>
      <dl><div><dt>Reason</dt><dd>${escapeHtml(sanction.reason || "No reason supplied")}</dd></div><div><dt>Duration</dt><dd>${escapeHtml(moderationDurationLabel(sanction))}</dd></div><div><dt>Ends</dt><dd>${escapeHtml(endsAt)}</dd></div></dl>
    </article>`;
  }).join("");
}

function communityCanChatWrite(data = state.communityOverview) {
  return data?.moderation?.access?.chatWrite !== false;
}

function communityChatMuteMessage() {
  return "This action is unavailable while your Community chat mute is active.";
}

function requireCommunityChatWrite(form = null) {
  if (communityCanChatWrite()) return true;
  const message = communityChatMuteMessage();
  const status = form?.querySelector?.(".form-error");
  if (status) status.textContent = message;
  else toast(message);
  return false;
}

const COMMUNITY_CHAT_WRITE_ACTIONS = new Set([
  "connect-community",
  "toggle-moment-composer",
  "focus-community-comment",
  "toggle-comment-stickers",
  "comment-custom-sticker",
  "send-sticker",
  "send-custom-sticker",
  "share-community-location",
  "toggle-meeting-scheduler",
  "share-community-document",
  "share-community-document-room",
  "mention-member"
]);

function communityModerationBanner(moderation = {}) {
  if (!moderation.active) return "";
  return `<aside class="moderation-banner" role="status"><strong>Account penalty active</strong><span>${escapeHtml(moderation.access?.community === false ? "Village Community access is suspended." : moderation.access?.chatWrite === false ? "You can read, but cannot post, invite, or use chat tools while muted." : "Some Village features are restricted.")}</span></aside>`;
}

function communityRestrictedByPenaltyHtml(data = {}) {
  return `<section class="moderation-restricted-view">
    <span class="moderation-lock" aria-hidden="true">!</span>
    <h3>Village Community is temporarily unavailable</h3>
    <p>Your Community data has not been deleted. Access returns automatically when the penalty ends or an administrator revokes it.</p>
    ${moderationSanctionsHtml(data.moderation)}
  </section>`;
}

function showCommunityPenaltyNotice(moderation = {}) {
  if (!moderation.active || !Array.isArray(moderation.sanctions) || !moderation.sanctions.length) return;
  let dialog = $("#community-penalty-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "community-penalty-dialog";
    dialog.className = "moderation-dialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="moderation-dialog-shell"><header><div><small>Village moderation notice</small><h2>Penalty reminder</h2></div><button type="button" class="moderation-dialog-close" aria-label="Close penalty reminder">×</button></header><p>This reminder appears each time you open Village Community while a penalty is active.</p><div class="moderation-dialog-list">${moderationSanctionsHtml(moderation)}</div><button type="button" class="primary-button moderation-dialog-confirm">I understand</button></div>`;
  const close = () => {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  };
  dialog.querySelector(".moderation-dialog-close")?.addEventListener("click", close);
  dialog.querySelector(".moderation-dialog-confirm")?.addEventListener("click", close);
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function communityAllRooms(data = state.communityOverview || {}) {
  const direct = (data.directRooms || []).map((room) => ({ ...room, kind: "direct", joined: true }));
  const groups = (data.groups || []).filter((room) => room.joined).map((room) => ({ ...room, kind: "group" }));
  return [...direct, ...groups].sort((first, second) => (
    Number(Boolean(second.pinned)) - Number(Boolean(first.pinned))
    || String(second.latestMessageAt || "").localeCompare(String(first.latestMessageAt || ""))
    || String(first.name || "").localeCompare(String(second.name || ""))
  ));
}

function communityRoomPreview(room = {}) {
  if (!room.latestMessageId) return room.kind === "group" ? (room.description || "Group conversation") : "Start a conversation";
  if (room.latestMessageType === "file") return "Shared a file";
  if (room.latestMessageType === "document") return "Shared a Village document";
  if (room.latestMessageType === "meeting") return "Scheduled a meeting";
  if (room.latestMessageType === "location") return "Shared a location";
  if (room.latestMessageType === "sticker") return "Sent a sticker";
  return String(room.latestMessageBody || "New message").replace(/\[\[sticker:[^\]]+\]\]/g, "Sent a sticker");
}

function communityUnreadBadge(count, className = "") {
  const unread = Math.max(0, Number(count || 0));
  return `<span class="community-unread-badge ${className} ${unread ? "" : "hidden"}" data-room-unread aria-label="${unread} unread message${unread === 1 ? "" : "s"}">${unread > 99 ? "99+" : unread || ""}</span>`;
}

function communityRailHtml(data, activeTab) {
  const items = [
    ["direct", t("communityPrivateTab"), "◉"],
    ["groups", t("communityGroupsTab"), "♙"],
    ["moments", t("communityMomentsTab"), "◎"],
    ["inbox", t("communityRequestsTab"), "✉"],
    ["self", t("communitySelfTab"), "♧"]
  ];
  const counts = data.notificationCounts || {};
  return `<nav class="community-workspace-rail" aria-label="Village Community">
    <div class="community-rail-avatar">${communityAvatarHtml({ userId: state.user?.id, name: data.displayName, avatarDataUrl: data.avatarDataUrl }, { clickable: false })}</div>
    <div class="community-rail-actions">${items.map(([tab, label, icon]) => {
      const count = tab === "direct" ? counts.direct : tab === "groups" ? counts.groups : tab === "moments" ? counts.moments : tab === "inbox" ? counts.requests : 0;
      return `<button type="button" class="${activeTab === tab ? "active" : ""}" data-action="community-tab" data-community-tab="${tab}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span aria-hidden="true">${icon}</span>${communityUnreadBadge(count, "rail-badge")}</button>`;
    }).join("")}</div>
    <button type="button" class="community-rail-exit" data-action="close-community-workspace" aria-label="Return to the village" title="Return to the village">⌂</button>
  </nav>`;
}

function communityConversationSidebarHtml(data, activeRoomId = "") {
  const rooms = communityAllRooms(data);
  return `<aside class="community-conversation-sidebar" aria-label="Conversations">
    <header><strong>Village</strong><span><button type="button" data-action="show-community-directory" aria-label="Find Village friends" title="Find friends">⌕</button><button type="button" data-action="community-tab" data-community-tab="inbox" aria-label="Requests and notices" title="Requests and notices">＋${communityUnreadBadge(data.notificationCounts?.requests, "request-badge")}</button></span></header>
    <label class="community-conversation-search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search conversations" data-community-conversation-search></label>
    <div class="community-conversation-list">${rooms.map((room) => {
      const preview = communityRoomPreview(room);
      const avatar = room.kind === "direct"
        ? communityAvatarHtml(room, { clickable: false, className: "conversation-avatar" })
        : `<span class="community-avatar conversation-avatar group-avatar" aria-hidden="true">#</span>`;
      return `<button type="button" class="community-conversation-row ${room.id === activeRoomId ? "active" : ""}" data-action="open-community-room" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}" data-conversation-search="${escapeHtml(`${room.name} ${preview}`.toLowerCase())}">
        <span class="conversation-avatar-wrap">${avatar}${communityUnreadBadge(room.unreadCount, "conversation-avatar-badge")}</span>
        <span class="conversation-copy"><span><strong>${escapeHtml(room.name)}</strong><time>${escapeHtml(room.latestMessageAt ? communityTime(room.latestMessageAt) : "")}</time></span><small>${room.alertsHidden ? `<i aria-label="Alerts hidden">⌁</i>` : ""}${escapeHtml(preview)}</small></span>
      </button>`;
    }).join("") || `<p class="community-empty">Join a group or add a friend to start chatting.</p>`}</div>
  </aside>`;
}

function communityWorkspaceHtml(data, mainHtml, { activeTab = state.communityTab, activeRoomId = "", drawerHtml = "" } = {}) {
  return `<div class="community-workspace tab-${escapeHtml(activeTab)} ${activeRoomId ? "has-active-room" : ""} ${state.communityInfoOpen ? "info-open" : ""} ${state.communityDirectoryOpen ? "directory-open" : ""}">
    ${communityRailHtml(data, activeTab)}
    ${communityConversationSidebarHtml(data, activeRoomId)}
    <main class="community-workspace-main">${activeRoomId ? "" : communityModerationBanner(data.moderation)}${mainHtml}</main>
    ${drawerHtml}
  </div>`;
}

function communityMemberRole(member = {}) {
  if (member.role === "owner" || member.isOwner) return "owner";
  if (["admin", "moderator"].includes(member.role) || member.isGroupAdmin || member.isSiteAdmin) return "admin";
  return "member";
}

function communityMemberRoleBadge(member = {}) {
  const role = communityMemberRole(member);
  if (role === "owner") return `<span class="community-member-role owner">Owner</span>`;
  if (role === "admin") return `<span class="community-member-role admin">Admin</span>`;
  return "";
}

function communityRoomCapabilities(room = {}) {
  return {
    currentUserRole: room.currentUserRole || room.myRole || "member",
    canManageMembers: room.canManageMembers === true || room.canManageGroup === true || room.canModerateMembers === true,
    canManageAdmins: room.canManageAdmins === true,
    canEditGroup: room.canEditGroup === true || room.canManageGroup === true || room.canManageAnnouncements === true || room.canManageMembers === true,
    canReviewJoinRequests: room.canReviewJoinRequests === true || room.canManageGroup === true || room.canManageMembers === true,
    canManageJoinSettings: room.canManageJoinSettings === true || room.canManageMembers === true,
    canTransferOwnership: room.systemManaged !== true && room.canTransferOwnership === true,
    canDeleteGroup: room.systemManaged !== true && (room.canDeleteGroup === true || room.canDissolveGroup === true),
    canMentionEveryone: room.canMentionEveryone === true
  };
}

function communityCurrentRoomMute(data = {}) {
  const member = (data.members || []).find((item) => item.userId === state.user?.id);
  if (!member) return null;
  const active = Boolean(member.isMuted ?? (member.mutedUntil && Date.parse(member.mutedUntil) > Date.now()));
  return active ? { endsAt: member.mutedUntil || null, reason: member.muteReason || "Group chat moderation" } : null;
}

function communityRoomChatWritable(data = {}) {
  return communityCanChatWrite() && !communityCurrentRoomMute(data);
}

function communityGroupManagementHtml(data) {
  const room = data.room || {};
  const capabilities = communityRoomCapabilities(room);
  if (!capabilities.canEditGroup && !capabilities.canReviewJoinRequests && !capabilities.canDeleteGroup) return "";
  const requests = Array.isArray(data.joinRequests) ? data.joinRequests : [];
  const requestList = requests.map((request) => `<article class="community-join-request">
    ${communityAvatarHtml(request, { clickable: false, className: "small" })}
    <div><strong>${escapeHtml(request.displayName || "Village member")}</strong><small>${escapeHtml(request.createdAt ? `Requested ${communityTime(request.createdAt)}` : "Waiting for review")}</small></div>
    <span><button type="button" data-action="review-community-join-request" data-request-id="${escapeHtml(request.id)}" data-request-status="approved">Approve</button><button type="button" class="danger" data-action="review-community-join-request" data-request-id="${escapeHtml(request.id)}" data-request-status="declined">Decline</button></span>
  </article>`).join("");
  const settings = capabilities.canEditGroup ? `<details class="community-group-settings">
    <summary><span><strong>Group settings</strong><small>Name, announcement and joining rules</small></span><b>›</b></summary>
    <form id="community-group-settings-form" class="stack-form">
      <label>Group name<input name="name" maxlength="80" required value="${escapeHtml(room.name || "")}"></label>
      <label>Description<textarea name="description" maxlength="240" rows="3">${escapeHtml(room.description || "")}</textarea></label>
      <label>Group announcement<textarea name="announcement" maxlength="1200" rows="4" placeholder="Share an update with every member">${escapeHtml(room.announcement || "")}</textarea></label>
      <label class="community-group-setting-toggle"><span><strong>Pin announcement</strong><small>Keep the notice above the conversation.</small></span><input type="checkbox" name="announcementPinned"${room.announcementPinned ? " checked" : ""}></label>
      ${capabilities.canManageJoinSettings ? `<label class="community-group-setting-toggle"><span><strong>Approve join requests</strong><small>New members wait for an owner or admin.</small></span><input type="checkbox" name="joinApprovalRequired"${room.joinApprovalRequired ? " checked" : ""}></label>
      <label class="community-group-setting-toggle"><span><strong>Review accepted invitations</strong><small>After an invited friend accepts, an owner or admin must approve their entry.</small></span><input type="checkbox" name="inviteConfirmationRequired"${room.inviteConfirmationRequired ? " checked" : ""}></label>` : `<p class="community-group-owner-note">Membership approval rules are read-only for your role.</p>`}
      <button type="submit" class="primary-button">Save group settings</button><p class="form-error" role="alert"></p>
    </form>
  </details>` : "";
  const approvals = capabilities.canReviewJoinRequests ? `<details class="community-join-requests"${requests.length ? " open" : ""}><summary><span><strong>Join requests</strong><small>${requests.length ? `${requests.length} waiting for review` : "No pending requests"}</small></span>${requests.length ? `<em>${requests.length}</em>` : ""}<b>›</b></summary><div>${requestList || `<p class="community-empty">New requests will appear here.</p>`}</div></details>` : "";
  const dissolve = capabilities.canDeleteGroup ? `<button type="button" class="community-group-danger-action" data-action="dissolve-community-group" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}"><span><strong>Dissolve group</strong><small>Permanently close this group for every member.</small></span><b>›</b></button>` : "";
  return `<section class="community-group-management" aria-label="Group management"><h3>Management</h3>${settings}${approvals}${dissolve}</section>`;
}

function communityRoomInfoHtml(data) {
  const room = data.room || {};
  const chatWritable = communityRoomChatWritable(data);
  const directRoom = (state.communityOverview?.directRooms || []).find((item) => item.id === room.id);
  const capabilities = communityRoomCapabilities(room);
  const currentRoleLabel = capabilities.currentUserRole === "owner" ? "You are the owner" : capabilities.currentUserRole === "admin" ? "You are an admin" : "Group member";
  return `<aside class="community-room-info" aria-label="Conversation details">
    <header><strong>Chat details</strong><button type="button" data-action="toggle-community-info" aria-label="Close chat details">×</button></header>
    ${room.kind === "group" ? `<section class="community-info-members"><header class="community-info-members-heading"><div><h3>${Number(data.members?.length || 0)} members</h3><small>${escapeHtml(room.systemManaged ? "System group · Village administrators can appoint group admins" : `${currentRoleLabel} · Only the owner can transfer ownership`)}</small></div></header>${groupMemberControls(data, { chatWritable })}</section>${communityGroupManagementHtml(data)}` : `<section class="community-info-person">${communityAvatarHtml(directRoom || { name: room.name }, { clickable: false, className: "large" })}<strong>${escapeHtml(room.name)}</strong></section>`}
    <section class="community-info-settings">
      <button type="button" class="community-info-switch" data-action="toggle-room-alerts" data-room-id="${escapeHtml(room.id)}" data-alerts-hidden="${String(!room.alertsHidden)}" role="switch" aria-checked="${String(Boolean(room.alertsHidden))}"><span><strong>Hide alerts</strong><small>Messages still show unread red dots.</small></span><i aria-hidden="true"></i></button>
      <button type="button" data-action="pin-community-room" data-room-id="${escapeHtml(room.id)}" data-pinned="${String(!room.pinned)}"><span><strong>${room.pinned ? "Unpin conversation" : "Pin conversation"}</strong><small>Keep it near the top of your list.</small></span><b>›</b></button>
      <button type="button" data-action="clear-community-history" data-room-id="${escapeHtml(room.id)}"><span><strong>Clear my chat history</strong><small>This affects only your view.</small></span><b>›</b></button>
      ${room.kind === "group"
        ? capabilities.currentUserRole === "owner" ? `<button type="button" class="community-info-disabled" disabled title="Transfer ownership before leaving"><span><strong>Leave group</strong><small>Transfer ownership before you leave.</small></span><b>›</b></button>` : `<button type="button" class="danger" data-action="leave-community-room" data-room-id="${escapeHtml(room.id)}"><span><strong>Leave group</strong></span><b>›</b></button>`
        : `<button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(room.otherUserId || "")}"><span><strong>View Moments</strong></span><b>›</b></button><button type="button" class="danger" data-action="remove-community-friend" data-user-id="${escapeHtml(room.otherUserId || "")}"><span><strong>Remove friend</strong></span><b>›</b></button><button type="button" class="danger" data-action="block-community-user" data-user-id="${escapeHtml(room.otherUserId || "")}"><span><strong>Block member</strong></span><b>›</b></button>`}
    </section>
  </aside>`;
}

function communityRoomWorkspaceMainHtml(data, meetingData = { meetings: [] }) {
  const room = data.room;
  const roomMute = communityCurrentRoomMute(data);
  const chatWritable = communityCanChatWrite() && !roomMute;
  const disabled = chatWritable ? "" : "disabled";
  const stickerButtons = [["wave","👋"],["love","🫶"],["laugh","😂"],["celebrate","🎉"],["hug","🤗"],["yes","👍"],["cry","😭"],["paws","🐾"]].map(([key, emoji]) => `<button type="button" ${disabled} data-action="send-sticker" data-sticker="${key}" aria-label="Send ${key} sticker">${emoji}</button>`).join("");
  const rawCustomStickers = communityStickerButtons();
  const customStickers = chatWritable ? rawCustomStickers : rawCustomStickers.replaceAll("<button ", "<button disabled ");
  const meetings = (meetingData.meetings || []).filter((meeting) => meeting.status !== "ended").map((meeting) => `<article class="room-meeting-item"><div><strong>${escapeHtml(meeting.title)}</strong><small>${escapeHtml(new Date(meeting.startsAt).toLocaleString())}</small></div><button type="button" data-action="join-community-meeting" data-meeting-id="${escapeHtml(meeting.id)}">Join</button></article>`).join("");
  const announcement = room.kind === "group" && room.announcement ? `<aside class="community-group-announcement ${room.announcementPinned ? "pinned" : ""}"><span aria-hidden="true">${room.announcementPinned ? "◆" : "◇"}</span><div><strong>Group announcement${room.announcementPinned ? " · Pinned" : ""}</strong><p>${escapeHtml(room.announcement)}</p></div></aside>` : "";
  return `<section class="community-chat wechat-chat">
    <header class="community-chat-header"><button type="button" class="community-mobile-back" data-action="close-community-room" aria-label="Back to conversations">‹</button><div><strong>${escapeHtml(room.name)}</strong><small>${room.kind === "group" ? `${Number(data.members?.length || 0)} members` : "Private conversation"}</small></div><button type="button" data-action="toggle-community-info" aria-label="Conversation details" aria-expanded="${String(state.communityInfoOpen)}">•••</button></header>
    ${room.systemManaged ? `<p class="community-chat-retention">Commons messages are kept for 12 hours.</p>` : ""}
    ${announcement}
    ${meetings ? `<section class="room-meeting-list"><header><strong>Meetings</strong></header>${meetings}</section>` : ""}
    <div id="community-message-list" class="community-message-list" aria-live="polite">${communityMessagesHtml(data.messages)}</div>
    ${roomMute ? `<aside class="community-room-mute-banner" role="status"><strong>You are muted in this group</strong><span>${escapeHtml(roomMute.reason)}${roomMute.endsAt ? ` · Ends ${escapeHtml(new Date(roomMute.endsAt).toLocaleString())}` : ""}</span></aside>` : chatWritable ? "" : communityModerationBanner(state.communityOverview?.moderation)}
    <div class="community-compose-shell ${chatWritable ? "" : "is-disabled"}">
      <div class="community-compose-tools">
        <label class="compose-tool" title="Attach a photo or document">＋<span class="sr-only">Attach file</span><input type="file" ${disabled} accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.ppt,.pptx" data-community-attachment></label>
        <button type="button" ${disabled} class="compose-tool" data-action="share-community-location" title="Share current location">⌖</button>
        <button type="button" ${disabled} class="compose-tool" data-action="create-community-document" title="Create a Village document">▤</button>
        <button type="button" ${disabled} class="compose-tool" data-action="toggle-meeting-scheduler" title="Schedule a video meeting">◉</button>
        <label class="compose-tool" title="Upload a custom sticker">☺<input type="file" ${disabled} accept="image/png,image/jpeg,image/webp,image/gif" data-community-sticker></label>
      </div>
      <div id="community-attachment-preview" class="community-attachment-preview"></div>
      <div class="sticker-picker" aria-label="Stickers">${stickerButtons}${customStickers}</div>
      <form id="community-meeting-form" class="community-meeting-form hidden"><input name="title" ${disabled} maxlength="120" value="Village catch-up" required><label>Start time<input name="startsAt" ${disabled} type="datetime-local" required></label><label>Minutes<input name="durationMinutes" ${disabled} type="number" min="10" max="480" value="45" required></label><button type="submit" ${disabled} class="secondary-button">Schedule and invite this chat</button><p class="form-error"></p></form>
      <form id="community-message-form" class="community-message-form"><input type="hidden" name="roomId" value="${escapeHtml(room.id)}"><label><span class="sr-only">${escapeHtml(t("communityMessagePlaceholder"))}</span><textarea name="message" ${disabled} maxlength="1000" rows="2" placeholder="${escapeHtml(chatWritable ? t("communityMessagePlaceholder") : "Chat is unavailable during your mute.")}"></textarea></label>${room.kind === "group" ? `<button type="button" ${disabled} class="community-everyone-button" data-action="mention-member" data-mention="@everyone" title="@everyone · Notify all group members" aria-label="Mention everyone in this group">@all</button>` : ""}<button type="submit" ${disabled} class="primary-button">${escapeHtml(t("communitySend"))}</button><p class="form-error" role="alert"></p></form>
    </div>
  </section>`;
}

function communityOverviewHtml(data, posts = state.communityPosts, activeTab = state.communityTab) {
  if (!data.enabled) {
    state.communityOverview = data;
    const optIn = `<div class="community-opt-in"><p>${escapeHtml(t("communityIntro"))}</p><p class="privacy-note">${escapeHtml(t("communityPrivacy"))}</p><form id="community-settings-form" class="stack-form"><label>${escapeHtml(t("communityDisplayName"))}<input name="displayName" maxlength="40" value="${escapeHtml(data.displayName || state.user?.name || "")}" required /></label><input type="hidden" name="enabled" value="true" /><button class="primary-button" type="submit">${escapeHtml(t("communityEnable"))}</button><p class="form-error" role="alert"></p></form></div>`;
    return communityWorkspaceHtml(data, optIn, { activeTab });
  }
  state.communityOverview = data;
  state.communityPosts = posts;
  state.communityTab = activeTab;
  const chatWritable = communityCanChatWrite(data);
  const writeDisabled = chatWritable ? "" : "disabled";
  state.communityUnreadCount = communityAllRooms(data).reduce((total, room) => total + Number(room.unreadCount || 0), 0)
    + Number(data.notificationCounts?.moments || 0) + Number(data.notificationCounts?.requests || 0) + Number(data.notificationCounts?.meetings || 0);
  const outgoingIds = new Set((data.outgoing || []).map((item) => item.user_id));
  const groupCards = (data.groups || []).map((group) => `<article class="community-room-card village-room-card"><span class="room-symbol">⌂</span><button type="button" class="community-room-open" data-action="${group.joined ? "open-community-room" : "join-community-room"}" data-room-id="${escapeHtml(group.id)}" data-room-name="${escapeHtml(group.name)}"><h4>${group.pinned ? "Pinned · " : ""}${escapeHtml(group.name)}</h4><p>${escapeHtml(group.description)}</p><small>${Number(group.member_count || 0)} members · ${group.system_managed ? "Commons history lasts 12 hours" : "Friend group"}</small></button>${group.joined ? `<details class="community-row-menu"><summary aria-label="Group options">•••</summary><button type="button" data-action="pin-community-room" data-room-id="${escapeHtml(group.id)}" data-pinned="${String(!group.pinned)}">${group.pinned ? "Unpin" : "Pin"}</button><button type="button" data-action="leave-community-room" data-room-id="${escapeHtml(group.id)}">Leave</button></details>` : `<button type="button" class="secondary-button" data-action="join-community-room" data-room-id="${escapeHtml(group.id)}" data-room-name="${escapeHtml(group.name)}">${escapeHtml(t("communityJoin"))}</button>`}</article>`).join("") || `<p class="community-empty">${escapeHtml(t("communityNoGroups"))}</p>`;
  const suggestions = (data.recommendations || []).map((person) => `<article class="community-person-card">${communityAvatarHtml(person)}<div><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(person.userId)}"><strong>${escapeHtml(person.displayName)}</strong></button><ul>${(person.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><button type="button" class="secondary-button" ${outgoingIds.has(person.userId) || !chatWritable ? `disabled title="${escapeHtml(!chatWritable ? communityChatMuteMessage() : t("communityPending"))}"` : `data-action="connect-community" data-user-id="${escapeHtml(person.userId)}"`}>${escapeHtml(outgoingIds.has(person.userId) ? t("communityPending") : t("communityConnect"))}</button></article>`).join("") || `<p class="community-empty">${escapeHtml(t("communitySuggestionsEmpty"))}</p>`;
  const incoming = (data.incoming || []).map((request) => `<article class="community-person-card">${communityAvatarHtml(request)}<strong>${escapeHtml(request.display_name)}</strong><div class="community-actions"><button type="button" class="secondary-button" data-action="accept-connection" data-connection-id="${escapeHtml(request.id)}">${escapeHtml(t("communityAccept"))}</button><button type="button" class="text-button" data-action="decline-connection" data-connection-id="${escapeHtml(request.id)}">${escapeHtml(t("communityDecline"))}</button></div></article>`).join("");
  const directRooms = (data.directRooms || []).map((room) => `<article class="community-direct-room">${communityAvatarHtml(room)}${communityUnreadBadge(room.unreadCount, "direct-room-badge")}<button type="button" class="community-room-open" data-action="open-community-room" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}"><strong>${room.pinned ? "Pinned · " : ""}${escapeHtml(room.name)}</strong><small>${room.alertsHidden ? "⌁ " : ""}${escapeHtml(communityRoomPreview(room))}</small></button><details class="community-row-menu"><summary aria-label="Chat options">•••</summary><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(room.user_id)}">Moments</button><button type="button" data-action="pin-community-room" data-room-id="${escapeHtml(room.id)}" data-pinned="${String(!room.pinned)}">${room.pinned ? "Unpin" : "Pin"}</button><button type="button" data-action="remove-community-friend" data-user-id="${escapeHtml(room.user_id)}">Remove</button><button type="button" class="danger" data-action="block-community-user" data-user-id="${escapeHtml(room.user_id)}">Block</button></details></article>`).join("");
  const blocks = (data.blocks || []).map((person) => `<article class="community-person-card"><strong>${escapeHtml(person.display_name)}</strong><button type="button" class="text-button" data-action="unblock-community-user" data-user-id="${escapeHtml(person.user_id)}">Unblock</button></article>`).join("");
  const groupInvites = (data.groupInvites || []).map((invite) => `<article class="community-person-card"><div><strong>${escapeHtml(invite.room_name)}</strong><small>Invited by ${escapeHtml(invite.inviter_name)}</small><p>${escapeHtml(invite.description || "")}</p></div><div class="community-actions"><button type="button" class="secondary-button" data-action="accept-group-invite" data-invitation-id="${escapeHtml(invite.id)}">Accept</button><button type="button" class="text-button" data-action="decline-group-invite" data-invitation-id="${escapeHtml(invite.id)}">Decline</button></div></article>`).join("");
  const momentProfile = state.communityPostsProfile || { userId: state.user?.id, displayName: data.displayName, avatarDataUrl: data.avatarDataUrl, coverImageDataUrl: data.coverImageDataUrl, momentTheme: data.preferences?.momentTheme || "light", mine: true };
  const momentCover = momentProfile.coverImageDataUrl || "/assets/interior-village.jpg";
  const moments = `<section class="moments-page ${momentProfile.momentTheme === "dark" ? "dark" : "light"}">
    <header class="moments-cover" style="background-image:url('${escapeHtml(momentCover)}')">
      <div class="moments-cover-shade"></div>
      <div class="moments-cover-actions">${momentProfile.mine ? `<label class="moment-cover-edit" title="Change cover photo"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="24" height="20" rx="2"></rect><circle cx="11" cy="12" r="2"></circle><path d="m6 23 7-7 4 4 3-3 6 6"></path></svg><span class="sr-only">Change cover photo</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-cover></label>${chatWritable ? `<button type="button" data-action="toggle-moment-composer" class="moment-camera-button" title="Create a Moment">${communityNavIcon("moments")}<span class="sr-only">Create a Moment</span></button>` : ""}` : ""}</div>
      <div class="moments-identity"><div><strong>${escapeHtml(momentProfile.displayName || data.displayName)}</strong><small>${momentProfile.mine ? "Your Moments" : "Friend Moments"}</small></div>${communityAvatarHtml({ userId: momentProfile.userId, name: momentProfile.displayName, avatarDataUrl: momentProfile.avatarDataUrl }, { clickable: false, className: "moments-profile-avatar" })}</div>
    </header>
    ${!momentProfile.mine ? `<button type="button" class="text-button moments-back" data-action="open-own-moments">← Back to friend feed</button>` : ""}
    ${momentProfile.mine ? communityMomentComposerHtml(data, { chatWritable }) : ""}
    <div class="community-post-list">${communityPostsHtml(posts, { chatWritable })}</div>
  </section>`;
  const groups = `<section><div class="community-section-heading"><div><h3>${escapeHtml(t("communityGroups"))}</h3><p>${escapeHtml(t("communityGroupsIntro"))}</p></div></div><form id="community-group-form" class="stack-form community-create-group"><label>${escapeHtml(t("communityGroupName"))}<input name="name" ${writeDisabled} maxlength="40" required></label><label>${escapeHtml(t("communityDescription"))}<textarea name="description" ${writeDisabled} maxlength="240"></textarea></label><strong>${escapeHtml(t("communityInviteFriends"))}</strong><div class="friend-choices">${communityFriendChoices(data, "memberIds", { disabled: !chatWritable })}</div><button class="primary-button" ${writeDisabled}>${escapeHtml(t("communityCreateGroup"))}</button>${chatWritable ? "" : `<p class="community-write-restricted">${escapeHtml(communityChatMuteMessage())}</p>`}<p class="form-error" role="alert"></p></form><div class="community-grid">${groupCards}</div></section>`;
  const direct = `<button type="button" class="mobile-directory-back" data-action="close-community-directory">‹ Conversations</button><section><div class="community-section-heading"><h3>${escapeHtml(t("communityDirect"))}</h3><p>${escapeHtml(t("communityDirectIntro"))}</p></div><div class="community-direct-list">${directRooms || `<p class="community-empty">${escapeHtml(t("communityDirectEmpty"))}</p>`}</div></section><section><div class="community-section-heading"><h3>${escapeHtml(t("communitySuggestions"))}</h3><p>${escapeHtml(t("communitySuggestionsIntro"))}</p></div><div class="community-grid">${suggestions}</div></section>`;
  const inbox = `<section><div class="community-section-heading"><h3>${escapeHtml(t("communityNotificationsTitle"))}</h3><p>${escapeHtml(t("communityNotificationsIntro"))}</p></div><div class="community-notification-list">${communityNotificationsHtml(state.communityNotifications)}</div><button type="button" class="text-button" data-action="mark-community-read">${escapeHtml(t("communityMarkAllRead"))}</button></section><section><h3>${escapeHtml(t("communityFriendRequests"))}</h3><div class="community-grid">${incoming || `<p class="community-empty">${escapeHtml(t("communityNoFriendRequests"))}</p>`}</div></section><section><h3>${escapeHtml(t("communityGroupInvitations"))}</h3><div class="community-grid">${groupInvites || `<p class="community-empty">${escapeHtml(t("communityNoGroupInvitations"))}</p>`}</div></section>${blocks ? `<section><h3>${escapeHtml(t("communityBlockedUsers"))}</h3><div class="community-grid">${blocks}</div></section>` : ""}`;
  const self = communitySelfHtml(data);
  const tabContent = activeTab === "groups" ? groups : activeTab === "moments" ? moments : activeTab === "inbox" ? inbox : activeTab === "self" ? self : direct;
  const showSearch = ["direct", "groups", "inbox"].includes(activeTab);
  const mainHtml = `<div class="community-shell ${activeTab === "moments" ? "moments-active" : ""}">
    ${activeTab === "moments" ? "" : `<header class="community-village-header">
      <div class="community-village-art"><img src="/assets/interior-village.jpg" alt=""><span></span></div>
      <div class="community-village-brand"><img src="/assets/it-takes-a-village-logo.svg" alt=""><div><small>${escapeHtml(t("communityCommons"))}</small><strong>${escapeHtml(data.displayName)}</strong></div></div>
      <button type="button" class="community-bell ${data.notificationCount ? "has-unread" : ""}" data-action="community-tab" data-community-tab="inbox" title="${escapeHtml(t("communityNotificationsTitle"))}">${communityNavIcon("inbox")}<span class="sr-only">${escapeHtml(t("communityNotificationsTitle"))}</span>${data.notificationCount ? `<b>${Number(data.notificationCount)}</b>` : ""}</button>
    </header>`}
    ${showSearch ? `<div class="community-search-fixed"><form id="community-search-form" class="inline-form"><label class="sr-only" for="community-query">${escapeHtml(t("communitySearchPeople"))}</label><input id="community-query" name="query" minlength="2" placeholder="${escapeHtml(t("communitySearchPlaceholder"))}" required><button class="secondary-button">${escapeHtml(t("search"))}</button></form><div id="community-search-results"></div></div>` : ""}
    <main class="community-tab-content">${tabContent}</main>
    <p class="privacy-note">${escapeHtml(t("communitySafety"))}</p>
  </div>`;
  return communityWorkspaceHtml(data, mainHtml, { activeTab });
}

async function communityPanel() {
  if (state.user?.guest) return toast("Village Community is for registered members. Create an account to join conversations.");
  clearInterval(state.communityTimer);
  state.communityRoom = null;
  state.communityPostImage = null;
  state.communityActiveProfileId = null;
  state.communityInfoOpen = false;
  state.communityDirectoryOpen = false;
  openPanel({ title: t("communityTitle"), eyebrow: t("supportEyebrow"), html: `<p class="panel-intro">${escapeHtml(t("communityLoading"))}</p>`, className: "community-workspace-panel" });
  try {
    const optional = (path, fallback) => api(path).catch(() => fallback);
    const data = await api("/api/community");
    showCommunityPenaltyNotice(data.moderation);
    state.communityOverview = data;
    if (data.moderation?.access?.community === false) {
      $("#panel").classList.remove("community-workspace-panel");
      $("#panel-content").innerHTML = communityRestrictedByPenaltyHtml(data);
      return;
    }
    const [feed, notifications, documents, stickers, saved] = await Promise.all([
      api("/api/community/posts"),
      optional("/api/community/notifications", { notifications: [] }),
      optional("/api/community/documents", { documents: [] }),
      optional("/api/community/stickers", { stickers: [] }),
      optional("/api/community/saved", { messages: [] })
    ]);
    state.communityPosts = feed.posts || [];
    state.communityPostsProfile = feed.profile || null;
    state.communityNotifications = notifications.notifications || [];
    state.communityDocuments = documents.documents || [];
    state.communityStickers = stickers.stickers || [];
    state.communitySavedMessages = saved.messages || [];
    if (state.user) {
      state.user.avatarDataUrl = data.avatarDataUrl || state.user.avatarDataUrl || "";
      renderHeaderAvatar();
    }
    $("#panel-content").innerHTML = communityOverviewHtml(data, state.communityPosts);
    renderCommunityBadges();
  }
  catch (error) { $("#panel-content").innerHTML = `<p class="form-error" role="alert">${escapeHtml(error.message)}</p>`; }
}

function communityMessagesHtml(messages = []) {
  if (!messages.length) return `<p class="community-empty">${escapeHtml(t("communityEmpty"))}</p>`;
  const stickers = { wave: "👋", love: "🫶", laugh: "😂", celebrate: "🎉", hug: "🤗", yes: "👍", cry: "😭", paws: "🐾" };
  return messages.map((message) => {
    const sticker = String(message.body || "").match(/^\[\[sticker:([a-z]+)\]\]$/)?.[1];
    const type = message.messageType || (sticker ? "sticker" : "text");
    let content = `<p>${escapeHtml(message.body)}</p>`;
    if (sticker && stickers[sticker]) content = `<div class="chat-sticker" role="img" aria-label="${escapeHtml(sticker)} sticker">${stickers[sticker]}</div>`;
    else if (type === "sticker" && message.attachment?.dataUrl) content = `<div class="chat-custom-sticker"><img src="${escapeHtml(message.attachment.dataUrl)}" alt="${escapeHtml(message.body || "Custom sticker")}">${message.mine ? "" : `<button type="button" data-action="save-custom-sticker" data-sticker-src="${escapeHtml(message.attachment.dataUrl)}" data-sticker-name="${escapeHtml(message.attachment.name || "Saved sticker")}">Save sticker</button>`}</div>`;
    else if (type === "file" && message.attachment) content = `<a class="chat-file-card" href="${escapeHtml(message.attachment.dataUrl)}" download="${escapeHtml(message.attachment.name)}"><span>${message.attachment.mime?.startsWith("image/") ? "IMG" : message.attachment.mime === "application/pdf" ? "PDF" : "FILE"}</span><div><strong>${escapeHtml(message.attachment.name)}</strong><small>${escapeHtml(message.attachment.mime || "Attachment")}</small></div><b>↓</b></a>${message.attachment.mime?.startsWith("image/") ? `<img class="chat-image-attachment" src="${escapeHtml(message.attachment.dataUrl)}" alt="${escapeHtml(message.attachment.name)}">` : ""}`;
    else if (type === "location") {
      const latitude = Number(message.metadata?.latitude);
      const longitude = Number(message.metadata?.longitude);
      content = `<a class="chat-location-card" href="https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}" target="_blank" rel="noreferrer"><span>⌖</span><div><strong>${escapeHtml(message.metadata?.label || "Shared location")}</strong><small>${latitude.toFixed(4)}, ${longitude.toFixed(4)}</small></div><b>↗</b></a>`;
    } else if (type === "document") content = `<button type="button" class="chat-document-card" data-action="open-community-document" data-document-id="${escapeHtml(message.metadata?.documentId || "")}"><span>${escapeHtml(String(message.metadata?.kind || "doc").toUpperCase())}</span><div><strong>${escapeHtml(message.metadata?.title || message.body)}</strong><small>Village document · Open together</small></div><b>→</b></button>`;
    else if (type === "meeting") content = `<article class="chat-meeting-card"><span>LIVE</span><div><strong>${escapeHtml(message.metadata?.title || message.body)}</strong><small>${escapeHtml(new Date(message.metadata?.startsAt || message.createdAt).toLocaleString())} · ${Number(message.metadata?.durationMinutes || 45)} min</small></div><button type="button" data-action="join-community-meeting" data-meeting-id="${escapeHtml(message.metadata?.meetingId || "")}">Join</button></article>`;
    return `<article class="community-message ${message.mine ? "mine" : ""} ${type === "sticker" ? "sticker-message" : ""}">
      <div class="message-avatar-wrap">${communityAvatarHtml(message, { className: "small" })}</div>
      <div class="message-bubble"><header><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(message.userId)}"><strong>${escapeHtml(message.author)}</strong></button><time>${escapeHtml(new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }))}</time></header>${content}
        <div class="message-actions"><button type="button" data-action="${message.saved ? "unsave-community-message" : "save-community-message"}" data-message-id="${escapeHtml(message.id)}">${message.saved ? "Saved" : "Save"}</button>${message.mine ? "" : `<button type="button" data-action="report-community-message" data-message-id="${escapeHtml(message.id)}">Report</button>`}</div>
      </div>
    </article>`;
  }).join("");
}

function groupMemberControls(data, { chatWritable = communityCanChatWrite() } = {}) {
  if (data.room.kind !== "group") return "";
  const room = data.room || {};
  const capabilities = communityRoomCapabilities(room);
  const members = data.members || [];
  const memberIds = new Set(members.map((member) => member.userId));
  const memberRows = members.map((member) => {
    const role = communityMemberRole(member);
    const mine = member.userId === state.user?.id;
    const mention = String(member.displayName || "member").trim().replace(/\s+/g, "_");
    const canChangeAdmin = capabilities.canManageAdmins && !mine && role !== "owner" && !(room.systemManaged && member.isSiteAdmin);
    const canModerate = capabilities.canManageMembers && !mine && role === "member";
    const canTransfer = capabilities.canTransferOwnership && !mine;
    const muted = Boolean(member.isMuted ?? (member.mutedUntil && Date.parse(member.mutedUntil) > Date.now()));
    const menu = canChangeAdmin || canModerate || canTransfer ? `<details class="community-member-menu">
      <summary aria-label="Manage ${escapeHtml(member.displayName)}">•••</summary>
      <div role="menu">
        ${canChangeAdmin ? role === "admin" ? `<button type="button" data-action="demote-group-admin" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">Remove admin role</button>` : `<button type="button" data-action="promote-group-admin" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">Appoint as admin</button>` : ""}
        ${canModerate ? `<button type="button" data-action="mute-community-member" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">${muted ? "Change mute" : "Mute member…"}</button>${muted ? `<button type="button" data-action="unmute-community-member" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">Unmute member</button>` : ""}<button type="button" class="danger" data-action="remove-community-member" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">Remove from group</button>` : ""}
        ${canTransfer ? `<button type="button" class="ownership-action" data-action="transfer-community-ownership" data-user-id="${escapeHtml(member.userId)}" data-user-name="${escapeHtml(member.displayName)}">Transfer ownership</button>` : ""}
      </div>
    </details>` : "";
    const mute = muted ? `<span class="community-member-muted" title="${escapeHtml(member.muteReason || "Muted by a group administrator")}">Muted until ${escapeHtml(new Date(member.mutedUntil).toLocaleString())}</span>` : "";
    return `<article class="community-member-row" data-community-member-id="${escapeHtml(member.userId)}">
      <button type="button" class="community-member-profile" data-action="open-community-profile" data-user-id="${escapeHtml(member.userId)}">${communityAvatarHtml(member, { clickable: false, className: "small" })}<span><strong>${escapeHtml(member.displayName)}${mine ? " (You)" : ""}</strong><small>${role === "owner" ? "Group owner" : role === "admin" ? room.systemManaged && member.isSiteAdmin ? "Village administrator" : "Group administrator" : "Member"}</small>${mute}</span></button>
      ${communityMemberRoleBadge(member)}
      ${chatWritable && (!mine || capabilities.canMentionEveryone) ? `<button type="button" class="community-member-mention" data-action="mention-member" data-mention="@${escapeHtml(mention)}" aria-label="Mention ${escapeHtml(member.displayName)}">@</button>` : ""}
      ${menu}
    </article>`;
  }).join("");
  const eligibleFriends = (state.communityOverview?.directRooms || []).filter((friend) => !memberIds.has(friend.user_id));
  const invitationChoices = eligibleFriends.map((friend) => `<label class="friend-choice"><input type="checkbox" name="memberIds" value="${escapeHtml(friend.user_id)}"> ${escapeHtml(friend.name)}</label>`).join("");
  const invitation = chatWritable
    ? `<details class="group-invite"><summary><span><strong>Invite friends</strong><small>${room.inviteConfirmationRequired ? "Accepted invitations also need admin approval" : "Friends choose whether to join"}</small></span><b>›</b></summary>${invitationChoices ? `<form id="community-room-invite-form" class="stack-form"><div class="friend-choices">${invitationChoices}</div><button type="submit" class="secondary-button">Send invitations</button><p class="form-error" role="alert"></p></form>` : `<p class="community-empty">All of your current friends are already members.</p>`}</details>`
    : `<p class="community-write-restricted">Invitations are unavailable during your chat mute.</p>`;
  return `<div class="group-members"><div class="community-member-list">${memberRows}</div>${invitation}</div>`;
}

function communityRoomManagementSignature(data = {}) {
  const room = data.room || {};
  return JSON.stringify({
    room: [room.name, room.description, room.announcement, room.announcementPinned, room.joinApprovalRequired, room.inviteConfirmationRequired, room.currentUserRole, room.canManageMembers, room.canManageAdmins, room.canTransferOwnership, room.canDeleteGroup, room.canMentionEveryone],
    members: (data.members || []).map((member) => [member.userId, communityMemberRole(member), member.isSiteAdmin, member.isMuted, member.mutedUntil, member.muteReason]),
    requests: (data.joinRequests || []).map((request) => [request.id, request.status])
  });
}

async function refreshCommunityRoom() {
  if (!state.communityRoom) return;
  try {
    const previousSignature = communityRoomManagementSignature(state.communityRoom.data);
    const data = await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`);
    data.joinRequests = state.communityRoom.data?.joinRequests || [];
    if (state.communityInfoOpen && data.room?.kind === "group" && communityRoomCapabilities(data.room).canReviewJoinRequests) {
      const pending = await api(`/api/community/rooms/${encodeURIComponent(data.room.id)}/join-requests`).catch(() => null);
      if (pending) data.joinRequests = pending.requests || [];
    }
    const list = $("#community-message-list");
    if (!list || state.communityRoom?.id !== data.room.id) return;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 90;
    state.communityRoom = { ...state.communityRoom, ...data.room, data };
    if (previousSignature !== communityRoomManagementSignature(data)) {
      renderOpenCommunityRoom();
      if (document.visibilityState === "visible" && $("#panel")?.classList.contains("open")) await markCommunityRoomRead(data.room.id);
      return;
    }
    list.innerHTML = communityMessagesHtml(data.messages);
    if (nearBottom) list.scrollTop = list.scrollHeight;
    if (document.visibilityState === "visible" && $("#panel")?.classList.contains("open")) await markCommunityRoomRead(data.room.id);
  } catch {}
}

function updateCommunityRoomSummary(roomId, updates = {}) {
  if (!state.communityOverview) return;
  const room = [...(state.communityOverview.directRooms || []), ...(state.communityOverview.groups || [])].find((item) => item.id === roomId);
  if (room) Object.assign(room, updates);
  const counts = state.communityOverview.notificationCounts;
  if (counts) {
    counts.direct = (state.communityOverview.directRooms || []).reduce((total, item) => total + Number(item.unreadCount || 0), 0);
    counts.groups = (state.communityOverview.groups || []).reduce((total, item) => total + Number(item.unreadCount || 0), 0);
    counts.total = counts.direct + counts.groups + Number(counts.moments || 0) + Number(counts.requests || 0) + Number(counts.meetings || 0);
    state.communityOverview.notificationCount = counts.total;
  }
  state.communityUnreadCount = communityAllRooms(state.communityOverview).reduce((total, item) => total + Number(item.unreadCount || 0), 0)
    + Number(counts?.moments || 0) + Number(counts?.requests || 0) + Number(counts?.meetings || 0);
}

async function markCommunityRoomRead(roomId) {
  if (!roomId) return;
  const readCursor = state.communityRoom?.id === roomId ? Number(state.communityRoom.data?.readCursor || 0) : 0;
  const result = await api(`/api/community/rooms/${encodeURIComponent(roomId)}/read`, { method: "POST", body: JSON.stringify({ cursor: readCursor }) }).catch(() => null);
  if (!result) return;
  if (state.communityRoom?.id === roomId && Number(result.readCursor || 0) < Number(state.communityRoom.data?.readCursor || 0)) return;
  const unreadCount = Math.max(0, Number(result.unreadCount || 0));
  if (state.communityRoom?.id === roomId && state.communityRoom.data) {
    state.communityRoom.data.readCursor = Math.max(Number(state.communityRoom.data.readCursor || 0), Number(result.readCursor || 0));
  }
  updateCommunityRoomSummary(roomId, { unreadCount });
  renderCommunityBadges();
  const rowBadge = document.querySelector(`.community-conversation-row[data-room-id="${CSS.escape(roomId)}"] [data-room-unread]`);
  rowBadge?.classList.toggle("hidden", unreadCount === 0);
  if (rowBadge) {
    rowBadge.textContent = unreadCount ? (unreadCount > 99 ? "99+" : String(unreadCount)) : "";
    rowBadge.setAttribute("aria-label", `${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`);
  }
}

function renderCommunityBadges() {
  const unread = Math.max(0, Number(state.communityUnreadCount || 0));
  $$("[data-community-unread-badge]").forEach((badge) => {
    badge.classList.toggle("hidden", unread === 0);
    badge.textContent = unread ? (unread > 99 ? "99+" : String(unread)) : "";
  });
  if (!state.communityOverview) return;
  communityAllRooms(state.communityOverview).forEach((room) => {
    const row = document.querySelector(`.community-conversation-row[data-room-id="${CSS.escape(room.id)}"]`);
    if (!row) return;
    const badge = row.querySelector("[data-room-unread]");
    const count = Math.max(0, Number(room.unreadCount || 0));
    if (badge) {
      badge.classList.toggle("hidden", count === 0);
      badge.textContent = count ? (count > 99 ? "99+" : String(count)) : "";
      badge.setAttribute("aria-label", `${count} unread message${count === 1 ? "" : "s"}`);
    }
    const preview = row.querySelector(".conversation-copy small");
    if (preview) preview.innerHTML = `${room.alertsHidden ? `<i aria-label="Alerts hidden">⌁</i>` : ""}${escapeHtml(communityRoomPreview(room))}`;
    const time = row.querySelector("time");
    if (time) time.textContent = room.latestMessageAt ? communityTime(room.latestMessageAt) : "";
  });
  const counts = state.communityOverview.notificationCounts || {};
  [["direct", counts.direct], ["groups", counts.groups], ["moments", counts.moments], ["inbox", counts.requests]].forEach(([tab, count]) => {
    const badge = document.querySelector(`.community-workspace-rail [data-community-tab="${tab}"] [data-room-unread]`);
    if (!badge) return;
    const value = Math.max(0, Number(count || 0));
    badge.classList.toggle("hidden", value === 0);
    badge.textContent = value ? (value > 99 ? "99+" : String(value)) : "";
  });
}

function mergeCommunityRoomUpdates(rooms = []) {
  if (!state.communityOverview) {
    state.communityUnreadCount = rooms.reduce((total, room) => total + Number(room.unreadCount || 0), 0);
    return;
  }
  rooms.forEach((summary) => updateCommunityRoomSummary(summary.roomId, {
    alertsHidden: Boolean(summary.alertsHidden),
    unreadCount: Number(summary.unreadCount || 0),
    latestMessageId: summary.latestMessageId || "",
    latestMessageBody: summary.latestMessageBody || "",
    latestMessageType: summary.latestMessageType || "",
    latestMessageAt: summary.latestMessageAt || ""
  }));
}

async function pollCommunityUpdates() {
  if (state.communityUpdateBusy || !state.user || state.user.guest) return;
  state.communityUpdateBusy = true;
  try {
    const hadCursor = Boolean(state.communityUpdateCursor);
    const hadNotificationCursor = Boolean(state.communityNotificationCursor);
    const parameters = new URLSearchParams();
    if (hadCursor) parameters.set("after", state.communityUpdateCursor);
    if (hadNotificationCursor) parameters.set("notificationAfter", state.communityNotificationCursor);
    const update = await api(`/api/community/updates${parameters.size ? `?${parameters}` : ""}`);
    state.communityUpdateCursor = String(update.cursor || state.communityUpdateCursor || "");
    state.communityNotificationCursor = String(update.notificationCursor || state.communityNotificationCursor || "");
    mergeCommunityRoomUpdates(update.rooms || []);
    if (state.communityOverview && update.notificationCounts) {
      const counts = state.communityOverview.notificationCounts || (state.communityOverview.notificationCounts = {});
      counts.moments = Number(update.notificationCounts.moments || 0);
      counts.requests = Number(update.notificationCounts.requests || 0);
      counts.meetings = Number(update.notificationCounts.meetings || 0);
      counts.total = Number(counts.direct || 0) + Number(counts.groups || 0) + Number(update.notificationUnreadCount || 0);
      state.communityOverview.notificationCount = counts.total;
    }
    state.communityUnreadCount = Number(update.unreadCount || 0) + Number(update.notificationUnreadCount || 0);
    renderCommunityBadges();
    if (hadCursor) {
      const events = (update.events || []).filter((event) => {
        if (!event?.id || state.communitySeenEventIds.has(event.id)) return false;
        state.communitySeenEventIds.add(event.id);
        return true;
      });
      if (state.communitySeenEventIds.size > 1000) state.communitySeenEventIds = new Set([...state.communitySeenEventIds].slice(-500));
      events.filter((event) => !event.alertsHidden).forEach((event, index) => {
        window.setTimeout(() => state.audio?.playChatDing(), Math.min(index, 5) * 190);
      });
      if (state.communityRoom?.id && events.some((event) => event.roomId === state.communityRoom.id)) await refreshCommunityRoom();
    }
    if (hadNotificationCursor && Array.isArray(update.notifications) && update.notifications.length) {
      const existingIds = new Set((state.communityNotifications || []).map((item) => item.id));
      const incoming = update.notifications.filter((item) => !existingIds.has(item.id));
      state.communityNotifications = [...incoming.reverse(), ...(state.communityNotifications || [])].slice(0, 100);
      incoming.filter((item) => item.kind === "meeting-invite").forEach((_, index) => {
        window.setTimeout(() => state.audio?.playChatDing(), Math.min(index, 3) * 190);
      });
    }
  } catch {}
  finally { state.communityUpdateBusy = false; }
}

function startCommunityUpdates() {
  if (!state.user || state.user.guest) return;
  clearInterval(state.communityUpdatesTimer);
  state.communityUpdatesTimer = null;
  pollCommunityUpdates();
  state.communityUpdatesTimer = setInterval(pollCommunityUpdates, 5000);
}

function stopCommunityUpdates() {
  clearInterval(state.communityUpdatesTimer);
  state.communityUpdatesTimer = null;
  state.communityUpdateBusy = false;
  state.communityUpdateCursor = "";
  state.communityNotificationCursor = "";
  state.communityUnreadCount = 0;
  state.communitySeenEventIds = new Set();
  renderCommunityBadges();
}

function renderOpenCommunityRoom() {
  const current = state.communityRoom;
  if (!current?.data || !state.communityOverview) return;
  $("#panel-content").innerHTML = communityWorkspaceHtml(
    state.communityOverview,
    communityRoomWorkspaceMainHtml(current.data, current.meetingData),
    {
      activeTab: current.kind === "group" ? "groups" : "direct",
      activeRoomId: current.id,
      drawerHtml: communityRoomInfoHtml(current.data)
    }
  );
  $("#panel").classList.add("community-workspace-panel");
  const list = $("#community-message-list");
  if (list) list.scrollTop = list.scrollHeight;
  const localStart = new Date(Date.now() + 15 * 60_000);
  localStart.setMinutes(localStart.getMinutes() - localStart.getTimezoneOffset());
  const startsAt = $("#community-meeting-form input[name='startsAt']");
  if (startsAt) startsAt.value = localStart.toISOString().slice(0, 16);
  renderCommunityBadges();
}

async function openCommunityRoom(roomId, roomName) {
  clearInterval(state.communityTimer);
  state.communityAttachment = null;
  state.communityAttachmentPromise = null;
  state.communityInfoOpen = false;
  state.communityDirectoryOpen = false;
  const [data, meetingData] = await Promise.all([
    api(`/api/community/rooms/${encodeURIComponent(roomId)}/messages`),
    api(`/api/community/meetings?roomId=${encodeURIComponent(roomId)}`).catch(() => ({ meetings: [] }))
  ]);
  if (data.room?.kind === "group" && communityRoomCapabilities(data.room).canReviewJoinRequests) {
    const pending = await api(`/api/community/rooms/${encodeURIComponent(roomId)}/join-requests`).catch(() => ({ requests: [] }));
    data.joinRequests = pending.requests || [];
  }
  openPanel({
    title: roomName || data.room.name,
    eyebrow: t("communityTitle"),
    html: `<p class="panel-intro">${escapeHtml(t("communityLoading"))}</p>`,
    className: "community-workspace-panel"
  });
  data.room.name = data.room.name || roomName;
  updateCommunityRoomSummary(roomId, { name: data.room.name, description: data.room.description || "" });
  state.communityRoom = { ...data.room, id: roomId, name: data.room.name, data, meetingData };
  renderOpenCommunityRoom();
  await markCommunityRoomRead(roomId);
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
  if (!requireCommunityChatWrite(form)) return;
  const message = new FormData(form).get("message");
  try {
    if (state.communityAttachmentPromise) await state.communityAttachmentPromise;
    if (!String(message || "").trim() && !state.communityAttachment) throw new Error("Write a message or attach something first.");
    await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ message, attachment: state.communityAttachment }) });
    form.reset();
    state.communityAttachment = null;
    state.communityAttachmentPromise = null;
    const preview = $("#community-attachment-preview");
    if (preview) preview.innerHTML = "";
    await refreshCommunityRoom();
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunitySearch(event) {
  event.preventDefault();
  const query = new FormData(event.target).get("query");
  try {
    const data = await api(`/api/community/search?q=${encodeURIComponent(query)}`);
    $("#community-search-results").innerHTML = (data.people || []).map((person) => {
      const action = person.relationship === "friend" ? `<button type="button" class="secondary-button" data-action="open-friend-chat" data-user-id="${escapeHtml(person.user_id)}">Open chat</button>` : person.relationship === "outgoing" ? `<button type="button" class="secondary-button" disabled>Request sent</button>` : person.relationship === "incoming" ? `<button type="button" class="secondary-button" data-action="accept-connection" data-connection-id="${escapeHtml(person.connection_id || "")}">Accept request</button>` : communityCanChatWrite() ? `<button type="button" class="secondary-button" data-action="connect-community" data-user-id="${escapeHtml(person.user_id)}">Add friend</button>` : `<button type="button" class="secondary-button" disabled title="${escapeHtml(communityChatMuteMessage())}">Add friend</button>`;
      return `<article class="community-person-card">${communityAvatarHtml(person)}<div><button type="button" data-action="open-community-profile" data-user-id="${escapeHtml(person.user_id)}"><strong>${escapeHtml(person.display_name)}</strong></button><small>${escapeHtml(person.email)}</small></div>${action}</article>`;
    }).join("") || `<p class="community-empty">No community member matched that name or email.</p>`;
  } catch (error) { $("#community-search-results").innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function submitCommunityGroup(event) {
  event.preventDefault();
  const form = event.target;
  if (!requireCommunityChatWrite(form)) return;
  const data = new FormData(form);
  try { await api("/api/community/groups", { method: "POST", body: JSON.stringify({ name: data.get("name"), description: data.get("description"), memberIds: data.getAll("memberIds") }) }); state.communityTab = "groups"; toast("Group created. Invitations were sent to selected friends."); await communityPanel(); }
  catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityRoomInvite(event) {
  event.preventDefault();
  const form = event.target;
  if (!requireCommunityChatWrite(form)) return;
  const memberIds = new FormData(form).getAll("memberIds");
  try {
    const result = await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/invite`, { method: "POST", body: JSON.stringify({ memberIds }) });
    form.reset();
    toast(result.invited ? `Sent ${result.invited} group invitation${result.invited === 1 ? "" : "s"}.` : "Those friends are already members or invited.");
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityGroupSettings(event) {
  event.preventDefault();
  const form = event.target;
  const room = state.communityRoom;
  if (!room?.id || room.kind !== "group") return;
  const data = new FormData(form);
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  form.querySelector(".form-error").textContent = "";
  try {
    const payload = {
      name: data.get("name"),
      description: data.get("description"),
      announcement: data.get("announcement"),
      announcementPinned: data.get("announcementPinned") === "on"
    };
    if (form.elements.namedItem("joinApprovalRequired")) payload.joinApprovalRequired = data.get("joinApprovalRequired") === "on";
    if (form.elements.namedItem("inviteConfirmationRequired")) payload.inviteConfirmationRequired = data.get("inviteConfirmationRequired") === "on";
    await api(`/api/community/rooms/${encodeURIComponent(room.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    updateCommunityRoomSummary(room.id, { name: String(data.get("name") || room.name), description: String(data.get("description") || "") });
    toast("Group settings saved.");
    await openCommunityRoom(room.id, String(data.get("name") || room.name));
    state.communityInfoOpen = true;
    renderOpenCommunityRoom();
  } catch (error) {
    form.querySelector(".form-error").textContent = error.message;
  } finally { button.disabled = false; }
}

async function updateCommunityGroupAdmin(element, role) {
  const room = state.communityRoom;
  const userId = element.dataset.userId;
  const name = element.dataset.userName || "this member";
  if (!room?.id || !userId) return;
  const message = role === "admin"
    ? `Appoint ${name} as a group administrator? They will be able to manage ordinary members and group settings.`
    : `Remove ${name}'s group administrator role? They will remain a member.`;
  if (!confirm(message)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ role }) });
  toast(role === "admin" ? `${name} is now a group administrator.` : `${name} is now a regular member.`);
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function transferCommunityGroupOwnership(element) {
  const room = state.communityRoom;
  const userId = element.dataset.userId;
  const name = element.dataset.userName || "this member";
  if (!room?.id || !userId) return;
  if (!confirm(`Transfer ownership of “${room.name}” to ${name}? You will become a group administrator. Only the new owner can transfer or dissolve the group.`)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/ownership`, { method: "POST", body: JSON.stringify({ userId }) });
  toast(`${name} is now the group owner.`);
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function muteCommunityGroupMember(element) {
  const room = state.communityRoom;
  const userId = element.dataset.userId;
  const name = element.dataset.userName || "this member";
  if (!room?.id || !userId) return;
  const durationInput = prompt(`Mute ${name} for how many hours?`, "24");
  if (durationInput === null) return;
  const hours = Number(durationInput);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) return toast("Enter a duration between 0 and 8,760 hours.");
  const reason = prompt("Reason shown to group administrators:", "Group chat moderation");
  if (reason === null) return;
  if (!String(reason).trim()) return toast("Add a reason before muting this member.");
  if (!confirm(`Mute ${name} for ${hours} hour${hours === 1 ? "" : "s"}? They can still read the group.`)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ durationSeconds: Math.round(hours * 3600), muteReason: String(reason).trim() }) });
  toast(`${name} has been muted in this group.`);
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function unmuteCommunityGroupMember(element) {
  const room = state.communityRoom;
  const userId = element.dataset.userId;
  const name = element.dataset.userName || "this member";
  if (!room?.id || !userId || !confirm(`Unmute ${name} now?`)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/members/${encodeURIComponent(userId)}`, { method: "PATCH", body: JSON.stringify({ mutedUntil: null }) });
  toast(`${name} can send group messages again.`);
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function removeCommunityGroupMember(element) {
  const room = state.communityRoom;
  const userId = element.dataset.userId;
  const name = element.dataset.userName || "this member";
  if (!room?.id || !userId || !confirm(`Remove ${name} from “${room.name}”? They will lose access to future group messages.`)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/members/${encodeURIComponent(userId)}`, { method: "DELETE" });
  toast(`${name} was removed from the group.`);
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function reviewCommunityJoinRequest(element) {
  const room = state.communityRoom;
  const requestId = element.dataset.requestId;
  const status = element.dataset.requestStatus;
  if (!room?.id || !requestId || !["approved", "declined"].includes(status)) return;
  if (status === "declined" && !confirm("Decline this request to join the group?")) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}/join-requests/${encodeURIComponent(requestId)}`, { method: "PATCH", body: JSON.stringify({ status }) });
  toast(status === "approved" ? "Join request approved." : "Join request declined.");
  await openCommunityRoom(room.id, room.name);
  state.communityInfoOpen = true;
  renderOpenCommunityRoom();
}

async function dissolveCommunityGroup(element) {
  const room = state.communityRoom;
  if (!room?.id || room.systemManaged) return;
  const roomName = element.dataset.roomName || room.name;
  const confirmation = prompt(`This permanently deletes the group and its chat history for every member. Type “${roomName}” to continue:`);
  if (confirmation === null) return;
  if (confirmation !== roomName) return toast("Group name did not match. Nothing was deleted.");
  if (!confirm(`Final confirmation: permanently dissolve “${roomName}”? This cannot be undone.`)) return;
  await api(`/api/community/rooms/${encodeURIComponent(room.id)}`, { method: "DELETE" });
  state.communityRoom = null;
  state.communityInfoOpen = false;
  state.communityTab = "groups";
  toast("Group dissolved.");
  return communityPanel();
}

async function submitCommunityPost(event) {
  event.preventDefault();
  const form = event.target;
  if (!requireCommunityChatWrite(form)) return;
  const data = new FormData(form);
  try { if (state.communityPostImagePromise) await state.communityPostImagePromise; await api("/api/community/posts", { method: "POST", body: JSON.stringify({ text: data.get("text"), imageDataUrl: state.communityPostImage, allowedUserIds: data.getAll("allowedUserIds"), deniedUserIds: data.getAll("deniedUserIds") }) }); state.communityPostImage = null; state.communityPostImagePromise = null; state.communityPostComposerOpen = false; state.communityTab = "moments"; await communityPanel(); state.communityTab = "moments"; $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "moments"); }
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

function readCommunityFile(file, { maxBytes = 650000, pattern = /^image\/(png|jpeg|webp|gif)$/, label = "image" } = {}) {
  if (!file) return Promise.resolve(null);
  if (file.size > maxBytes || !pattern.test(file.type)) return Promise.reject(new Error(`Choose a supported ${label} under ${Math.round(maxBytes / 1000)} KB.`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`That ${label} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function handleCommunityAttachment(input) {
  const file = input.files?.[0];
  state.communityAttachment = null;
  const allowed = /^(?:image\/(?:png|jpe?g|webp|gif)|application\/pdf|text\/plain|application\/(?:msword|vnd\.openxmlformats-officedocument\.(?:wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/i;
  state.communityAttachmentPromise = readCommunityFile(file, { maxBytes: 650000, pattern: allowed, label: "file" })
    .then((dataUrl) => {
      if (!dataUrl) return;
      state.communityAttachment = { name: file.name, mime: file.type, dataUrl };
      const preview = $("#community-attachment-preview");
      if (preview) preview.innerHTML = `<span>${file.type.startsWith("image/") ? "IMG" : file.type === "application/pdf" ? "PDF" : "FILE"}</span><div><strong>${escapeHtml(file.name)}</strong><small>Ready to send</small></div><button type="button" data-action="clear-community-attachment" title="Remove attachment">×</button>`;
    })
    .catch((error) => { input.value = ""; toast(error.message); throw error; });
}

async function handleCommunityAvatar(input) {
  try {
    const imageDataUrl = await readCommunityFile(input.files?.[0], { maxBytes: 550000, label: "profile image" });
    if (!imageDataUrl) return;
    const data = await api("/api/community/avatar", { method: "PUT", body: JSON.stringify({ imageDataUrl }) });
    state.user = { ...state.user, ...(data.user || {}), avatarDataUrl: data.avatarDataUrl || imageDataUrl };
    renderAccountStatus();
    toast(t("profilePhotoUpdated"));
    input.value = "";
    if (input.dataset.avatarContext === "profile") {
      profilePanel();
      return;
    }
    await communityPanel();
    state.communityTab = "self";
    $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "self");
  } catch (error) { input.value = ""; toast(error.message); }
}

async function handleCommunityCover(input) {
  try {
    const imageDataUrl = await readCommunityFile(input.files?.[0], { maxBytes: 550000, label: "cover image" });
    if (!imageDataUrl) return;
    await api("/api/community/cover", { method: "PUT", body: JSON.stringify({ imageDataUrl }) });
    toast("Moments cover updated.");
    const tab = state.communityTab;
    await communityPanel();
    state.communityTab = tab;
    $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, tab);
  } catch (error) { input.value = ""; toast(error.message); }
}

async function handleCommunityStickerUpload(input) {
  try {
    const file = input.files?.[0];
    const imageDataUrl = await readCommunityFile(file, { maxBytes: 550000, label: "sticker image" });
    if (!imageDataUrl) return;
    const result = await api("/api/community/stickers", { method: "POST", body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, ""), imageDataUrl }) });
    if (!state.communityStickers.some((item) => item.id === result.sticker.id)) state.communityStickers.unshift(result.sticker);
    toast(result.saved === false ? "That sticker is already saved." : "Sticker added.");
    if (state.communityRoom) return openCommunityRoom(state.communityRoom.id, state.communityRoom.name);
    $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, state.communityTab);
  } catch (error) { input.value = ""; toast(error.message); }
}

function handleCommunityCommentImage(input) {
  const postId = input.dataset.postId;
  state.communityCommentImages.delete(postId);
  const promise = readCommunityFile(input.files?.[0], { maxBytes: 550000, label: "comment image" }).then((imageDataUrl) => {
    if (!imageDataUrl) return;
    state.communityCommentImages.set(postId, imageDataUrl);
    const preview = document.querySelector(`[data-comment-preview="${CSS.escape(postId)}"]`);
    if (preview) preview.innerHTML = `<img src="${escapeHtml(imageDataUrl)}" alt="Comment image ready"><button type="button" data-action="clear-comment-image" data-post-id="${escapeHtml(postId)}">Remove</button>`;
  }).catch((error) => { input.value = ""; toast(error.message); throw error; });
  state.communityCommentImagePromises.set(postId, promise);
}

async function saveCustomSticker(imageDataUrl, name = "Saved sticker") {
  const result = await api("/api/community/stickers", { method: "POST", body: JSON.stringify({ name, imageDataUrl }) });
  if (!state.communityStickers.some((item) => item.id === result.sticker.id)) state.communityStickers.unshift(result.sticker);
  toast(result.saved === false ? "Sticker already in Self." : "Sticker saved to Self.");
  return result.sticker;
}

async function submitCommunityComment(event) {
  event.preventDefault();
  const form = event.target;
  if (!requireCommunityChatWrite(form)) return;
  const postId = form.dataset.postId;
  try {
    if (state.communityCommentImagePromises.has(postId)) await state.communityCommentImagePromises.get(postId);
    const text = new FormData(form).get("text");
    const imageDataUrl = state.communityCommentImages.get(postId) || null;
    if (!String(text || "").trim() && !imageDataUrl) throw new Error("Write a comment or add an image.");
    await api(`/api/community/posts/${encodeURIComponent(postId)}/comments`, { method: "POST", body: JSON.stringify({ text, imageDataUrl }) });
    state.communityCommentImages.delete(postId);
    state.communityCommentImagePromises.delete(postId);
    await refreshCommunityMoments();
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function submitCommunityPrivacy(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const status = form.querySelector(".form-error");
  status.textContent = "Saving…";
  try {
    const result = await api("/api/community/settings", {
      method: "POST",
      body: JSON.stringify({
        enabled: true,
        displayName: state.communityOverview.displayName,
        notificationsEnabled: data.get("notificationsEnabled") === "on",
        discoverable: data.get("discoverable") === "on",
        directMessagesEnabled: data.get("directMessagesEnabled") === "on",
        locationSharingEnabled: data.get("locationSharingEnabled") === "on",
        allowStrangerRequests: data.get("allowStrangerRequests") === "on",
        allowStrangerMoments: data.get("allowStrangerMoments") === "on",
        momentVisibilityDays: Number(data.get("momentVisibilityDays")),
        momentTheme: data.get("momentTheme")
      })
    });
    state.communityOverview = result;
    status.textContent = "Saved.";
    toast("Community settings saved.");
  } catch (error) { status.textContent = error.message; }
}

async function refreshCommunityMoments(userId = state.communityActiveProfileId) {
  const suffix = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const feed = await api(`/api/community/posts${suffix}`);
  state.communityPosts = feed.posts || [];
  state.communityPostsProfile = feed.profile || null;
  if ($("#panel-content")) $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "moments");
}

async function submitCommunityMeeting(event) {
  event.preventDefault();
  const form = event.target;
  if (!requireCommunityChatWrite(form)) return;
  const data = new FormData(form);
  try {
    const result = await api("/api/community/meetings", { method: "POST", body: JSON.stringify({ roomId: state.communityRoom.id, title: data.get("title"), startsAt: new Date(data.get("startsAt")).toISOString(), durationMinutes: Number(data.get("durationMinutes")), settings: { waitingRoom: true, recordingAllowed: true, captionsEnabled: true } }) });
    toast("Meeting scheduled and shared with this chat.");
    await openCommunityRoom(state.communityRoom.id, state.communityRoom.name);
    return result;
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

function communityDocumentEditorHtml(document = null, { kind = "doc", roomId = "", responses = [] } = {}) {
  const selectedKind = document?.kind || kind;
  const chatWritable = communityCanChatWrite();
  const content = document?.content || {};
  const questions = Array.isArray(content.questions) ? content.questions : [];
  const backAction = roomId ? `<button type="button" class="text-button" data-action="return-community-room">← Back to chat</button>` : `<button type="button" class="text-button" data-action="community-tab" data-community-tab="self">← Back to Self</button>`;
  if (document && !document.mine) {
    const form = selectedKind === "form" ? `<form id="community-form-response-form" class="village-form-response"><input type="hidden" name="documentId" value="${escapeHtml(document.id)}">${questions.map((question, index) => `<label>${escapeHtml(question)}<textarea name="answer-${index}" rows="2" required></textarea></label>`).join("")}<button type="submit" class="primary-button">Submit response</button><p class="form-error"></p></form>` : "";
    return `<div class="village-document-workspace">${backAction}<article class="village-paper ${selectedKind}"><header><span>${escapeHtml(selectedKind.toUpperCase())}</span><h2>${escapeHtml(document.title)}</h2><small>Shared by ${escapeHtml(document.ownerName || "a village friend")}</small></header><div class="village-paper-body">${escapeHtml(content.body || "").replace(/\n/g, "<br>")}</div>${selectedKind === "form" ? `<ol class="village-form-question-list">${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol>` : ""}</article>${selectedKind === "pdf" ? `<button type="button" class="secondary-button" data-action="print-community-document" data-document-id="${escapeHtml(document.id)}">Print or save PDF</button>` : ""}${form}</div>`;
  }
  const responseList = responses.map((response) => `<article><strong>${escapeHtml(response.author)}</strong><time>${escapeHtml(new Date(response.createdAt).toLocaleString())}</time>${Object.values(response.response || {}).map((answer) => `<p>${escapeHtml(answer)}</p>`).join("")}</article>`).join("");
  return `<div class="village-document-workspace">
    ${backAction}
    <form id="${document ? "community-document-edit-form" : "community-document-create-form"}" class="village-document-editor">
      <input type="hidden" name="documentId" value="${escapeHtml(document?.id || "")}">
      <input type="hidden" name="kind" value="${escapeHtml(selectedKind)}">
      <header><span>${escapeHtml(selectedKind.toUpperCase())}</span><div><small>VILLAGE ${document ? "DOCUMENT" : "CREATOR"}</small><h3>${document ? "Edit your document" : `Create a ${selectedKind.toUpperCase()}`}</h3></div></header>
      <label>Title<input name="title" maxlength="120" value="${escapeHtml(document?.title || "")}" required></label>
      <label>${selectedKind === "form" ? "Introduction" : "Content"}<textarea name="body" rows="10" placeholder="${selectedKind === "pdf" ? "Write the printable document…" : selectedKind === "form" ? "Tell people what this form is for…" : "Write together in the village…"}">${escapeHtml(content.body || "")}</textarea></label>
      ${selectedKind === "form" ? `<label>Questions · one per line<textarea name="questions" rows="7" required placeholder="What would you like to ask?">${escapeHtml(questions.join("\n"))}</textarea></label>` : ""}
      <div class="village-document-editor-actions"><button type="submit" class="primary-button">${document ? "Save changes" : `Create ${selectedKind.toUpperCase()}`}</button>${document ? `<button type="button" class="secondary-button" ${chatWritable ? `data-action="share-community-document"` : "disabled"} data-document-id="${escapeHtml(document.id)}" title="${escapeHtml(chatWritable ? "Share" : communityChatMuteMessage())}">Share</button><button type="button" class="text-button danger" data-action="delete-community-document" data-document-id="${escapeHtml(document.id)}">Delete</button>` : ""}${selectedKind === "pdf" && document ? `<button type="button" class="secondary-button" data-action="print-community-document" data-document-id="${escapeHtml(document.id)}">Print or save PDF</button>` : ""}</div>
      <p class="form-error"></p>
    </form>
    ${selectedKind === "form" && document ? `<section class="village-form-responses"><h3>Responses</h3>${responseList || `<p class="community-empty">No responses yet.</p>`}</section>` : ""}
  </div>`;
}

async function openCommunityDocuments({ kind = "", roomId = state.communityRoom?.id || "", documentId = "" } = {}) {
  state.communityDocumentRoomId = roomId;
  clearInterval(state.communityTimer);
  closePanel();
  if (!state.documentRuntime) return toast("The document studio is still loading.");
  if (documentId) return openCommunityDocument(documentId, roomId);
  if (kind) return state.documentRuntime.createKind(kind, { roomId });
  return state.documentRuntime.openHub({ roomId });
}

async function openCommunityDocument(documentId, roomId = state.communityDocumentRoomId || state.communityRoom?.id || "") {
  try {
    state.communityDocumentRoomId = roomId;
    closePanel();
    state.documentRuntime.roomId = roomId;
    await state.documentRuntime.openDocument(documentId);
  } catch (error) { toast(error.message); }
}

function communityDocumentPayload(form) {
  const data = new FormData(form);
  const kind = String(data.get("kind") || "doc");
  return {
    kind,
    title: data.get("title"),
    content: {
      body: String(data.get("body") || ""),
      questions: kind === "form" ? String(data.get("questions") || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).slice(0, 30) : []
    }
  };
}

async function submitCommunityDocument(event) {
  event.preventDefault();
  const form = event.target;
  const status = form.querySelector(".form-error");
  const payload = communityDocumentPayload(form);
  const documentId = String(new FormData(form).get("documentId") || "");
  if (!documentId && state.communityDocumentRoomId && !requireCommunityChatWrite(form)) return;
  try {
    const result = await api(documentId ? `/api/community/documents/${encodeURIComponent(documentId)}` : "/api/community/documents", { method: documentId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    const document = result.document;
    const index = state.communityDocuments.findIndex((item) => item.id === document.id);
    if (index >= 0) state.communityDocuments[index] = document;
    else state.communityDocuments.unshift(document);
    if (!documentId && state.communityDocumentRoomId) await api(`/api/community/documents/${encodeURIComponent(document.id)}/share`, { method: "POST", body: JSON.stringify({ roomId: state.communityDocumentRoomId }) });
    toast(documentId ? "Document saved." : state.communityDocumentRoomId ? "Document created and shared." : "Document created.");
    await openCommunityDocument(document.id, state.communityDocumentRoomId);
  } catch (error) { status.textContent = error.message; }
}

async function submitCommunityFormResponse(event) {
  event.preventDefault();
  const form = event.target;
  const data = new FormData(form);
  const documentId = data.get("documentId");
  const response = {};
  [...form.elements].filter((element) => element.name?.startsWith("answer-")).forEach((element) => { response[element.name] = element.value; });
  try {
    await api(`/api/community/documents/${encodeURIComponent(documentId)}/responses`, { method: "POST", body: JSON.stringify({ response }) });
    form.reset();
    toast("Form response submitted.");
  } catch (error) { form.querySelector(".form-error").textContent = error.message; }
}

async function shareCommunityDocument(documentId) {
  if (!requireCommunityChatWrite()) return;
  const rooms = [
    ...(state.communityOverview?.directRooms || []).map((room) => ({ id: room.id, name: room.name, type: "Private" })),
    ...(state.communityOverview?.groups || []).filter((room) => room.joined).map((room) => ({ id: room.id, name: room.name, type: "Group" }))
  ];
  if (state.communityRoom?.id) {
    await api(`/api/community/documents/${encodeURIComponent(documentId)}/share`, { method: "POST", body: JSON.stringify({ roomId: state.communityRoom.id }) });
    toast("Document shared to this chat.");
    return openCommunityRoom(state.communityRoom.id, state.communityRoom.name);
  }
  openPanel({ title: "Share document", eyebrow: "Choose a village conversation", html: `<div class="community-share-picker">${rooms.map((room) => `<button type="button" data-action="share-community-document-room" data-document-id="${escapeHtml(documentId)}" data-room-id="${escapeHtml(room.id)}" data-room-name="${escapeHtml(room.name)}"><span>${escapeHtml(room.type)}</span><strong>${escapeHtml(room.name)}</strong><b>→</b></button>`).join("") || `<p class="community-empty">Add a friend or join a group before sharing.</p>`}</div>` });
}

function printCommunityDocument(document) {
  const content = document?.content || {};
  const popup = window.open("", "_blank");
  if (!popup) return toast("Allow pop-ups to print this document.");
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(document.title)}</title><style>body{font-family:Georgia,serif;max-width:760px;margin:60px auto;padding:0 36px;color:#173c32;line-height:1.65}header{border-bottom:3px solid #d4a72c;margin-bottom:30px}small{letter-spacing:.18em}h1{font-size:38px}article{white-space:pre-wrap;font-size:17px}@media print{body{margin:0 auto}}</style></head><body><header><small>IT TAKES A VILLAGE</small><h1>${escapeHtml(document.title)}</h1></header><article>${escapeHtml(content.body || "")}</article></body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}

async function markCommunityKindsRead(kinds, tab) {
  const result = await api("/api/community/notifications/read", { method: "POST", body: JSON.stringify({ kinds }) }).catch(() => null);
  if (!result) return;
  const readKinds = new Set(kinds);
  state.communityNotifications = (state.communityNotifications || []).map((notification) => (
    readKinds.has(notification.kind) ? { ...notification, read: true } : notification
  ));
  const counts = state.communityOverview?.notificationCounts;
  if (counts && tab) {
    const countKey = tab === "inbox" ? "requests" : tab;
    counts.total = Math.max(0, Number(counts.total || 0) - Number(counts[countKey] || 0));
    counts[countKey] = 0;
    state.communityOverview.notificationCount = counts.total;
    state.communityUnreadCount = counts.total;
    renderCommunityBadges();
  }
}

async function openCommunityProfile(userId) {
  if (!userId) return;
  clearInterval(state.communityTimer);
  state.communityTimer = null;
  state.communityRoom = null;
  state.communityActiveProfileId = userId === state.user?.id ? null : userId;
  const feed = await api(`/api/community/posts${state.communityActiveProfileId ? `?userId=${encodeURIComponent(state.communityActiveProfileId)}` : ""}`);
  state.communityPosts = feed.posts || [];
  state.communityPostsProfile = feed.profile || null;
  state.communityTab = "moments";
  $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "moments");
  $("#panel").scrollTop = 0;
}

function showMomentPhoto(source) {
  const dialog = document.createElement("dialog");
  dialog.className = "moment-photo-dialog";
  dialog.innerHTML = `<button type="button" title="Close">×</button><img src="${escapeHtml(source)}" alt="Moment photo">`;
  dialog.addEventListener("click", (event) => { if (event.target === dialog || event.target.closest("button")) dialog.close(); });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

async function communityAction(element, action) {
  try {
    if (action === "open-community") return communityPanel();
    if (!communityCanChatWrite() && (
      COMMUNITY_CHAT_WRITE_ACTIONS.has(action)
      || (action === "create-community-document" && Boolean(state.communityRoom?.id))
      || (action === "create-community-document-kind" && Boolean(state.communityDocumentRoomId))
    )) return requireCommunityChatWrite();
    if (action === "community-tab") {
      const tab = element.dataset.communityTab || "direct";
      if (tab === "moments") return openCommunityProfile(state.user?.id);
      state.communityTab = tab;
      state.communityDirectoryOpen = false;
      const kinds = tab === "inbox" ? ["request", "group-invite", "meeting-invite"] : [];
      if (kinds.length) await markCommunityKindsRead(kinds, tab);
      clearInterval(state.communityTimer);
      state.communityTimer = null;
      state.communityRoom = null;
      state.communityInfoOpen = false;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, state.communityTab);
      $("#panel").scrollTop = 0;
      return;
    }
    if (action === "close-community-workspace") return closePanel();
    if (action === "show-community-directory") {
      state.communityTab = "direct";
      state.communityDirectoryOpen = true;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "direct");
      return;
    }
    if (action === "close-community-directory") {
      state.communityDirectoryOpen = false;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "direct");
      return;
    }
    if (action === "close-community-room") {
      clearInterval(state.communityTimer);
      state.communityTimer = null;
      state.communityRoom = null;
      state.communityInfoOpen = false;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, state.communityTab);
      renderCommunityBadges();
      return;
    }
    if (action === "toggle-community-info") {
      state.communityInfoOpen = !state.communityInfoOpen;
      if (state.communityRoom) renderOpenCommunityRoom();
      return;
    }
    if (action === "toggle-room-alerts") {
      const alertsHidden = element.dataset.alertsHidden === "true";
      await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/preferences`, { method: "PATCH", body: JSON.stringify({ alertsHidden }) });
      updateCommunityRoomSummary(element.dataset.roomId, { alertsHidden });
      if (state.communityRoom?.id === element.dataset.roomId) {
        state.communityRoom.alertsHidden = alertsHidden;
        state.communityRoom.data.room.alertsHidden = alertsHidden;
        renderOpenCommunityRoom();
      }
      toast(alertsHidden ? "Message sounds hidden for this chat. Unread dots stay on." : "Message sounds turned on for this chat.");
      return;
    }
    if (action === "promote-group-admin") return await updateCommunityGroupAdmin(element, "admin");
    if (action === "demote-group-admin") return await updateCommunityGroupAdmin(element, "member");
    if (action === "transfer-community-ownership") return await transferCommunityGroupOwnership(element);
    if (action === "mute-community-member") return await muteCommunityGroupMember(element);
    if (action === "unmute-community-member") return await unmuteCommunityGroupMember(element);
    if (action === "remove-community-member") return await removeCommunityGroupMember(element);
    if (action === "review-community-join-request") return await reviewCommunityJoinRequest(element);
    if (action === "dissolve-community-group") return await dissolveCommunityGroup(element);
    if (action === "support-tab") return supportPanel(element.dataset.supportTab, state.supportIsland);
    if (action === "send-sticker") { await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ message: `[[sticker:${element.dataset.sticker}]]` }) }); return refreshCommunityRoom(); }
    if (action === "send-custom-sticker") {
      const sticker = state.communityStickers.find((item) => item.id === element.dataset.stickerId) || { name: "Custom sticker", imageDataUrl: element.dataset.stickerSrc };
      const mime = String(sticker.imageDataUrl || "").match(/^data:([^;]+);/)?.[1] || "image/png";
      await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ messageType: "sticker", attachment: { name: sticker.name || "Custom sticker", mime, dataUrl: sticker.imageDataUrl } }) });
      return refreshCommunityRoom();
    }
    if (action === "save-custom-sticker") return saveCustomSticker(element.dataset.stickerSrc, element.dataset.stickerName);
    if (action === "delete-custom-sticker") {
      if (!confirm("Delete this sticker from Self?")) return;
      await api(`/api/community/stickers/${encodeURIComponent(element.dataset.stickerId)}`, { method: "DELETE" });
      state.communityStickers = state.communityStickers.filter((item) => item.id !== element.dataset.stickerId);
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, state.communityTab);
      return;
    }
    if (action === "toggle-moment-composer") {
      state.communityPostComposerOpen = !state.communityPostComposerOpen;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "moments");
      return;
    }
    if (action === "open-community-profile") return openCommunityProfile(element.dataset.userId);
    if (action === "open-own-moments") return openCommunityProfile(state.user?.id);
    if (action === "open-moment-photo") return showMomentPhoto(element.dataset.imageSrc);
    if (action === "focus-community-comment") return document.querySelector(`[data-community-comment-form][data-post-id="${CSS.escape(element.dataset.postId)}"] input[name="text"]`)?.focus();
    if (action === "toggle-comment-stickers") return document.querySelector(`[data-comment-stickers="${CSS.escape(element.dataset.postId)}"]`)?.classList.toggle("hidden");
    if (action === "comment-custom-sticker") {
      await api(`/api/community/posts/${encodeURIComponent(element.dataset.postId)}/comments`, { method: "POST", body: JSON.stringify({ stickerDataUrl: element.dataset.stickerSrc }) });
      return refreshCommunityMoments();
    }
    if (action === "delete-community-comment") {
      if (!confirm("Delete this comment?")) return;
      await api(`/api/community/posts/${encodeURIComponent(element.dataset.postId)}/comments/${encodeURIComponent(element.dataset.commentId)}`, { method: "DELETE" });
      return refreshCommunityMoments();
    }
    if (action === "clear-comment-image") {
      state.communityCommentImages.delete(element.dataset.postId);
      state.communityCommentImagePromises.delete(element.dataset.postId);
      const preview = document.querySelector(`[data-comment-preview="${CSS.escape(element.dataset.postId)}"]`);
      if (preview) preview.innerHTML = "";
      return;
    }
    if (action === "clear-community-attachment") {
      state.communityAttachment = null;
      state.communityAttachmentPromise = null;
      const preview = $("#community-attachment-preview");
      if (preview) preview.innerHTML = "";
      return;
    }
    if (action === "share-community-location") {
      if (!state.communityOverview?.preferences?.locationSharingEnabled) throw new Error("Turn on location sharing in Self settings first.");
      if (!navigator.geolocation) throw new Error("Location sharing is unavailable in this browser.");
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          await api(`/api/community/rooms/${encodeURIComponent(state.communityRoom.id)}/messages`, { method: "POST", body: JSON.stringify({ messageType: "location", location: { latitude: position.coords.latitude, longitude: position.coords.longitude, label: "Current location" } }) });
          await refreshCommunityRoom();
        } catch (error) { toast(error.message); }
      }, () => toast("Location permission was not granted."), { enableHighAccuracy: false, timeout: 10000 });
      return;
    }
    if (action === "toggle-meeting-scheduler") return $("#community-meeting-form")?.classList.toggle("hidden");
    if (action === "join-community-meeting") return state.meetingRuntime.open(element.dataset.meetingId, state.communityRoom);
    if (action === "create-community-document") return openCommunityDocuments({ roomId: state.communityRoom?.id || "" });
    if (action === "create-community-document-kind") return openCommunityDocuments({ kind: element.dataset.documentKind, roomId: state.communityDocumentRoomId });
    if (action === "open-community-document") return openCommunityDocument(element.dataset.documentId);
    if (action === "share-community-document") return shareCommunityDocument(element.dataset.documentId);
    if (action === "share-community-document-room") {
      await api(`/api/community/documents/${encodeURIComponent(element.dataset.documentId)}/share`, { method: "POST", body: JSON.stringify({ roomId: element.dataset.roomId }) });
      toast(`Shared to ${element.dataset.roomName}.`);
      return openCommunityDocuments();
    }
    if (action === "delete-community-document") {
      if (!confirm("Delete this Village document?")) return;
      await api(`/api/community/documents/${encodeURIComponent(element.dataset.documentId)}`, { method: "DELETE" });
      state.communityDocuments = state.communityDocuments.filter((item) => item.id !== element.dataset.documentId);
      return openCommunityDocuments({ roomId: state.communityDocumentRoomId });
    }
    if (action === "print-community-document") {
      let document = state.communityDocuments.find((item) => item.id === element.dataset.documentId);
      if (!document) document = (await api(`/api/community/documents/${encodeURIComponent(element.dataset.documentId)}`)).document;
      return printCommunityDocument(document);
    }
    if (action === "return-community-room") return openCommunityRoom(state.communityRoom.id, state.communityRoom.name);
    if (action === "save-community-message" || action === "unsave-community-message") {
      const save = action === "save-community-message";
      await api(`/api/community/messages/${encodeURIComponent(element.dataset.messageId)}/save`, { method: save ? "POST" : "DELETE", body: save ? "{}" : undefined });
      if (state.communityRoom) return refreshCommunityRoom();
      return communityPanel();
    }
    if (action === "report-community-message") {
      const reason = prompt("Briefly tell administrators what is wrong with this message:", "Inappropriate or unsafe content");
      if (!reason) return;
      await api(`/api/community/messages/${encodeURIComponent(element.dataset.messageId)}/report`, { method: "POST", body: JSON.stringify({ reason }) });
      return toast("Report sent to village administrators.");
    }
    if (action === "mark-community-read") {
      await api("/api/community/notifications/read", { method: "POST", body: "{}" });
      state.communityNotifications = state.communityNotifications.map((item) => ({ ...item, read: true }));
      const counts = state.communityOverview.notificationCounts || {};
      counts.moments = 0;
      counts.requests = 0;
      counts.meetings = 0;
      counts.total = Number(counts.direct || 0) + Number(counts.groups || 0);
      state.communityOverview.notificationCount = counts.total;
      $("#panel-content").innerHTML = communityOverviewHtml(state.communityOverview, state.communityPosts, "inbox");
      renderCommunityBadges();
      return;
    }
    if (action === "open-community-notification") {
      const metadata = JSON.parse(element.dataset.notificationMeta || "{}");
      await api("/api/community/notifications/read", { method: "POST", body: JSON.stringify({ ids: [element.dataset.notificationId] }) });
      if (metadata.meetingId) return state.meetingRuntime.open(metadata.meetingId, metadata.roomId ? { id: metadata.roomId, name: "Village meeting" } : null);
      if (metadata.roomId) {
        const room = [...(state.communityOverview.directRooms || []), ...(state.communityOverview.groups || [])].find((item) => item.id === metadata.roomId);
        return openCommunityRoom(metadata.roomId, room?.name || "Village chat");
      }
      if (metadata.userId || metadata.postId) return openCommunityProfile(metadata.userId || state.user?.id);
      return communityPanel();
    }
    if (action === "mention-member") { const textarea = $("#community-message-form textarea[name='message']"); if (!textarea) return; const mention = element.dataset.mention || ""; const spacer = textarea.value && !textarea.value.endsWith(" ") ? " " : ""; textarea.value += `${spacer}${mention} `; textarea.focus(); return; }
    if (action === "open-friend-chat") {
      const room = state.communityOverview?.directRooms?.find((item) => item.user_id === element.dataset.userId);
      if (room) return openCommunityRoom(room.id, room.name);
    }
    if (action === "join-community-room") {
      const result = await api(`/api/community/rooms/${encodeURIComponent(element.dataset.roomId)}/join`, { method: "POST", body: "{}" });
      if (result.joined === false || result.pending || result.status === "pending" || result.request?.status === "pending") {
        toast("Join request sent. A group owner or administrator will review it.");
        return communityPanel();
      }
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
    if (action === "delete-community-post") { if (confirm("Delete this post?")) { await api(`/api/community/posts/${encodeURIComponent(element.dataset.postId)}`, { method: "DELETE" }); return refreshCommunityMoments(); } }
  } catch (error) { toast(error.message); }
}

function settingsPanel() {
  const current = state.settings;
  const selectedVisualQuality = current.calm ? "low" : current.visualQuality || "high";
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
      ${current.sceneMode === "3d" ? `<div class="setting-group visual-quality-settings"><strong>${escapeHtml(t("visualQuality"))}</strong><div class="setting-options">
        ${[["low",t("qualityLow")],["medium",t("qualityMedium")],["high",t("qualityHigh")],["ultra",t("qualityUltra")]].map(([value,label]) => `<button type="button" aria-pressed="${String(selectedVisualQuality === value)}" class="setting-option ${selectedVisualQuality === value ? "active" : ""}" data-setting="visualQuality" data-value="${value}" ${current.calm ? "disabled" : ""}>${escapeHtml(label)}</button>`).join("")}
      </div><small>${escapeHtml(t("visualQualityHint"))}</small></div>` : ""}
      <div class="setting-group precision-research-settings"><strong>${escapeHtml(t("precisionResearch"))}</strong>
        <button type="button" aria-pressed="${String(Boolean(current.precisionResearch))}" class="setting-option precision-research-toggle ${current.precisionResearch ? "active" : ""}" data-action="toggle-precision-research">
          <span class="toggle-indicator" aria-hidden="true"></span><span>${escapeHtml(t(current.precisionResearch ? "precisionResearchOn" : "precisionResearchOff"))}</span>
        </button>
        <small>${escapeHtml(t("precisionResearchHint"))}</small>
      </div>
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

function activityCards() {
  const activities = state.activities.length ? state.activities : config.activities;
  return activities.length ? activities.map((activity) => `<article class="activity-card"><div class="date-badge">${escapeHtml(activity.date)}</div><div><small>${escapeHtml(activity.meta)}</small><h3>${escapeHtml(activity.title)}</h3><p>${escapeHtml(activity.description)}</p>${state.user?.isAdmin && activity.id ? `<button type="button" class="text-button danger-text activity-delete" data-action="delete-activity" data-activity-id="${escapeHtml(activity.id)}">Delete activity</button>` : ""}</div></article>`).join("") : `<p class="record-empty">There are no upcoming activities yet.</p>`;
}

function renderActivities({ compose = false } = {}) {
  const adminForm = state.user?.isAdmin ? `<details class="activity-composer" ${compose ? "open" : ""}><summary>Add an activity</summary><form id="activity-form" class="stack-form"><label>Date label<input name="date" maxlength="40" required placeholder="Aug 09" /></label><label>Title<input name="title" maxlength="120" required /></label><label>Location / details<input name="meta" maxlength="160" placeholder="San Jose · Free" /></label><label>Description<textarea name="description" rows="4" maxlength="1200" required></textarea></label><button class="primary-button" type="submit">Publish activity</button><p class="form-error" role="alert"></p></form></details>` : "";
  return `<div class="mori-stage activity-character-stage">${guideCharacter("Activity", { className: "mayor-crumpet-character" })}<div><h3>${escapeHtml(characterGreeting(GUIDE_CHARACTERS.Activity.name))}</h3><p>${escapeHtml(t("activityGuideIntro"))}</p></div></div><p class="panel-intro">${escapeHtml(t("activityIntro"))}</p>${adminForm}<div class="card-list">${activityCards()}</div>`;
}

async function activitiesPanel({ compose = false } = {}) {
  openPanel({
    title: t("activityTitle"),
    eyebrow: t("activityEyebrow"),
    html: `<p class="record-empty">Loading village activities…</p>`
  });
  try {
    const data = await api("/api/activities");
    state.activities = data.activities || [];
    if (state.user) state.user.isAdmin = Boolean(data.isAdmin);
    renderAccountStatus();
    $("#panel-content").innerHTML = renderActivities({ compose });
  } catch (error) {
    state.activities = [];
    $("#panel-content").innerHTML = `${renderActivities({ compose })}<p class="form-error">${escapeHtml(error.message)}</p>`;
  }
}

async function submitActivity(event) {
  event.preventDefault();
  const form = event.target;
  const values = new FormData(form);
  const status = form.querySelector(".form-error");
  status.textContent = "Publishing…";
  try {
    const result = await api("/api/activities", { method: "POST", body: JSON.stringify({ date: values.get("date"), title: values.get("title"), meta: values.get("meta"), description: values.get("description") }) });
    state.activities = [...state.activities, result.activity];
    $("#panel-content").innerHTML = renderActivities();
    toast("Activity published.");
  } catch (error) { status.textContent = error.message; }
}

async function deleteActivity(id) {
  try {
    await api(`/api/activities/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.activities = state.activities.filter((activity) => activity.id !== id);
    $("#panel-content").innerHTML = renderActivities();
    toast("Activity deleted.");
  } catch (error) { toast(error.message); }
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
      <div class="mori-stage guide-stage">${guideCharacter("Waffles")}<p>${escapeHtml(t("guideIntro"))}</p></div>
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

function quickSearchPanel() {
  const topics = ["Education", "Legal", "Recreation", "Support"];
  const selectedTopic = topics.includes(state.currentTopic) ? state.currentTopic : "Education";
  const selectedPath = ["autism", "adhd"].includes(state.selectedIsland) ? state.selectedIsland : "";
  openPanel({
    title: t("quickSearch"),
    eyebrow: t("quickSearchEyebrow"),
    html: `<section class="quick-search-shell">
      <p class="panel-intro">${escapeHtml(t("quickSearchIntro"))}</p>
      <form id="quick-search-form" class="quick-search-form">
        <div class="quick-search-filters">
          <label>${escapeHtml(t("quickSearchTopic"))}<select name="topic">${topics.map((topic) => `<option value="${topic}" ${topic === selectedTopic ? "selected" : ""}>${escapeHtml(t(topic.toLowerCase()))}</option>`).join("")}</select></label>
          <label>${escapeHtml(t("quickSearchPath"))}<select name="island"><option value="" ${selectedPath ? "" : "selected"}>${escapeHtml(t("quickSearchAnyPath"))}</option><option value="autism" ${selectedPath === "autism" ? "selected" : ""}>${escapeHtml(t("autismIsland"))}</option><option value="adhd" ${selectedPath === "adhd" ? "selected" : ""}>${escapeHtml(t("adhdIsland"))}</option></select></label>
        </div>
        <label class="quick-search-query">${escapeHtml(t("quickSearchQuery"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(t("quickSearchPlaceholder"))}"></textarea></label>
        <button class="primary-button" type="submit">${escapeHtml(t("quickSearchSubmit"))} <span aria-hidden="true">→</span></button>
        <p class="form-error" role="alert"></p>
      </form>
      <p class="privacy-note">${escapeHtml(t("quickSearchHint"))}</p>
    </section>`
  });
}

function submitQuickSearch(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const description = String(formData.get("description") || "").trim();
  if (description.length < 8) return;
  aiPanel(String(formData.get("topic") || "Education"), String(formData.get("island") || ""), description, { autoSubmit: true });
}

function aiPanel(topic = "Education", island = state.selectedIsland, initialDescription = "", options = {}) {
  state.currentTopic = topic;
  state.currentDiagnosis = island === "autism" ? "Autism" : island === "adhd" ? "ADHD" : "";
  const character = GUIDE_CHARACTERS[topic] || GUIDE_CHARACTERS.Education;
  const examples = topic === "Legal" ? t("aiExampleLegal") : topic === "Recreation" ? t("aiExampleRecreation") : t("aiExampleEducation");
  const descriptionValue = String(initialDescription || "").trim();
  openPanel({
    title: `${t(String(topic || "Education").toLowerCase())} · ${character.name}`,
    eyebrow: guideText("aiEyebrow", topic),
    html: `<div class="ai-shell">
      <div class="mori-stage">${guideCharacter(topic, { id: "mori-character" })}<div><h3>${escapeHtml(characterGreeting(character.name))}</h3><p>${escapeHtml(t("aiExplain"))}</p></div></div>
      <form id="ai-form" class="ai-form"><label>${escapeHtml(t("aiQuestion"))}<textarea name="description" required minlength="8" placeholder="${escapeHtml(examples)}">${escapeHtml(descriptionValue)}</textarea></label><label class="result-count">${escapeHtml(t("resultCount"))}<select name="count">${[3,4,5,6,7,8,9,10].map((value) => `<option value="${value}" ${value === Number(state.settings.resourceCount || 5) ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="primary-button" type="submit">${escapeHtml(t("aiFind"))} <span aria-hidden="true">→</span></button><p id="ai-error" class="form-error" role="alert"></p></form>
      <div id="ai-results"></div>
      <p class="privacy-note">${escapeHtml(guideText("aiDisclaimer", topic))}</p>
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
  const guideName = (GUIDE_CHARACTERS[state.currentTopic] || GUIDE_CHARACTERS.Waffles).name;
  if (language === "zh") {
    const cost = resource.price ? ` 费用提示：${resource.price}。` : "";
    const age = resource.age ? ` 这个资源标注适合 ${resource.age}。` : "";
    return `${guideName} 认为 ${resource.name} 可能合适，因为 ${reasonText}。${age}${cost} 请直接向服务机构确认资格、可用性和实际匹配度。`;
  }
  if (language === "es") {
    const cost = resource.price ? ` Nota de costo: ${resource.price}.` : "";
    const age = resource.age ? ` Está listado para ${resource.age}.` : "";
    return `${guideName} cree que ${resource.name} puede encajar porque ${reasonText}.${age}${cost} Confirma requisitos, disponibilidad y ajuste directamente con el proveedor.`;
  }
  const cost = resource.price ? ` Cost note: ${resource.price}.` : "";
  const age = resource.age ? ` It is listed for ${resource.age}.` : "";
  return `${guideName} thinks ${resource.name} may fit because ${reasonText}.${age}${cost} Please verify eligibility, availability, and fit directly with the provider.`;
}

function parseResourcePayload(element) {
  try { return JSON.parse(element.dataset.resourceJson || "{}"); } catch { return {}; }
}

function renderSourceFooter(data, fallbackVersion = "1.0") {
  const expandedBy = data.keywordExpansion?.ai ? t("aiExpandedKeywords") : t("localExpandedKeywords");
  return `<p class="privacy-note">${escapeHtml(t("sourceLabel"))}: ${escapeHtml(data.source)} · ${escapeHtml(t("scoringLabel"))} v${escapeHtml(data.scoring?.version || fallbackVersion)} · ${escapeHtml(expandedBy)}</p>`;
}

function sortResourcesByScore(resources) {
  return [...(Array.isArray(resources) ? resources : [])].sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name || "").localeCompare(String(b.name || "")));
}

function researchFeedbackStorageKey() {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `capy-daily-research-feedback:${state.user?.id || "guest"}:${date}`;
}

function registerCompletedResearch(data, payload) {
  const resources = sortResourcesByScore(data.resources);
  data.resources = resources;
  state.currentResearch = data.researchContext || {
    fullInput: String(payload?.description || ""),
    diagnosis: String(payload?.diagnosis || ""),
    category: String(payload?.topic || ""),
    primaryKeywords: [],
    confirmedKeywords: payload?.confirmedSecondaryKeywords || [],
    predictedKeywords: data.keywordExpansion?.predicted || [],
    locatedKeywords: [...new Set(resources.flatMap((resource) => (resource.explanation || []).map((reason) => reason.keyword)).filter(Boolean))],
    requestedCount: Number(payload?.count || 5),
    providedCount: resources.length,
    highScoreCount: resources.filter((resource) => Number(resource.score || 0) >= 20).length,
    source: data.source || ""
  };
  try {
    const key = researchFeedbackStorageKey();
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (!saved) {
      const pending = { status: "pending", research: state.currentResearch };
      localStorage.setItem(key, JSON.stringify(pending));
      state.dailyResearchContext = state.currentResearch;
      state.dailyResearchFeedbackPending = true;
    } else if (saved.status === "pending") {
      state.dailyResearchContext = saved.research || state.currentResearch;
      state.dailyResearchFeedbackPending = true;
    }
  } catch {
    state.dailyResearchContext ||= state.currentResearch;
    state.dailyResearchFeedbackPending = true;
  }
}

function renderResearchFeedbackFields() {
  return `<div class="research-feedback-rating">
    <span class="research-feedback-label">Rate this research (1–5 stars)</span>
    <div class="feedback-star-bar" role="radiogroup" aria-label="Research rating">
      ${[1, 2, 3, 4, 5].map((rating) => `<button type="button" class="feedback-star-button" data-action="select-feedback-rating" data-rating="${rating}" role="radio" aria-checked="false" aria-label="${rating} star${rating === 1 ? "" : "s"}" title="${rating} star${rating === 1 ? "" : "s"}">★</button>`).join("")}
    </div>
  </div>
  <label class="research-feedback-details"><span>Detailed explanation <small>(optional)</small></span><textarea data-feedback-details rows="3" maxlength="2000" placeholder="Why did this feel helpful or unhelpful?"></textarea></label>`;
}

function renderResearchFeedback() {
  return `<section class="research-result-feedback" data-feedback-container aria-label="Research feedback"><p>Was this research helpful?</p>${renderResearchFeedbackFields()}<div class="research-feedback-actions"><button type="button" class="primary-button" data-action="research-feedback" data-feedback-scope="results" data-helpful="true">Helpful</button><button type="button" class="secondary-button research-feedback-negative" data-action="research-feedback" data-feedback-scope="results" data-helpful="false">Not Helpful</button></div><p class="research-feedback-status" role="status"></p></section>`;
}

function renderFollowUpQuestions(questions = []) {
  const valid = (Array.isArray(questions) ? questions : [])
    .filter((item) => String(item?.question || "").trim() && Array.isArray(item.options) && item.options.length)
    .slice(0, 3);
  if (!valid.length) return "";
  return `<section class="research-followup" aria-label="${escapeHtml(t("clarificationTitle"))}">
    <div><h3>${escapeHtml(t("clarificationTitle"))}</h3><p>${escapeHtml(t("clarificationOptional"))}</p></div>
    ${valid.map((item) => `<article class="followup-question"><strong>${escapeHtml(item.question)}</strong><div class="followup-options">${item.options.slice(0, 4).map((option) => `<button type="button" class="secondary-button" data-action="apply-follow-up" data-followup-question="${escapeHtml(item.question)}" data-followup-option="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("")}</div></article>`).join("")}
  </section>`;
}

function renderCompletedResearch(data, payload, fallbackVersion) {
  registerCompletedResearch(data, payload);
  const expanded = data.keywordExpansion?.suggested || [];
  const followUp = state.settings.precisionResearch ? renderFollowUpQuestions(data.followUpQuestions) : "";
  return `<div class="ai-response">${escapeHtml(data.answer)}</div>${followUp}${renderResearchFeedback()}${expanded.length ? `<p class="keyword-expansion"><strong>${escapeHtml(t("expandedTerms"))}:</strong> ${expanded.map(escapeHtml).join(" · ")}</p>` : ""}<div class="card-list">${data.resources.map(resourceCard).join("")}</div>${renderSourceFooter(data, fallbackVersion)}`;
}

function showDailyResearchFeedback() {
  if (!state.dailyResearchFeedbackPending || !state.dailyResearchContext) return;
  const dialog = $("#research-feedback-dialog");
  if (!dialog) return;
  resetResearchFeedbackContainer(dialog);
  dialog.classList.remove("hidden");
  dialog.querySelector('[data-action="select-feedback-rating"]')?.focus();
}

function closeDailyResearchFeedback() {
  $("#research-feedback-dialog")?.classList.add("hidden");
}

function feedbackContainer(element) {
  return element?.closest?.("[data-feedback-container]") || null;
}

function selectResearchFeedbackRating(element) {
  const container = feedbackContainer(element);
  const rating = Math.max(1, Math.min(5, Number(element?.dataset.rating || 0)));
  if (!container || !Number.isInteger(rating) || container.dataset.submitted === "true") return;
  container.dataset.rating = String(rating);
  $$("[data-action='select-feedback-rating']", container).forEach((button) => {
    const buttonRating = Number(button.dataset.rating || 0);
    button.classList.toggle("active", buttonRating <= rating);
    button.setAttribute("aria-checked", String(buttonRating === rating));
  });
  const status = container.querySelector(".research-feedback-status");
  if (status?.dataset.validation === "rating") {
    status.textContent = "";
    delete status.dataset.validation;
  }
}

function resetResearchFeedbackContainer(container) {
  if (!container) return;
  delete container.dataset.rating;
  delete container.dataset.submitted;
  $$("[data-action='select-feedback-rating']", container).forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-checked", "false");
    button.disabled = false;
  });
  $$("[data-action='research-feedback']", container).forEach((button) => {
    button.disabled = false;
    delete button.dataset.busy;
  });
  const details = container.querySelector("[data-feedback-details]");
  if (details) {
    details.value = "";
    details.disabled = false;
  }
  const status = container.querySelector(".research-feedback-status");
  if (status) {
    status.textContent = "";
    delete status.dataset.validation;
  }
}

async function submitResearchFeedback(element) {
  if (element.dataset.busy === "true") return;
  const scope = element.dataset.feedbackScope || "results";
  const helpful = element.dataset.helpful === "true";
  const research = scope === "daily" ? state.dailyResearchContext : state.currentResearch;
  const container = feedbackContainer(element);
  const status = container?.querySelector(".research-feedback-status");
  const rating = Number(container?.dataset.rating || 0);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    if (status) {
      status.textContent = "Choose a star rating from 1 to 5.";
      status.dataset.validation = "rating";
    }
    container?.querySelector('[data-action="select-feedback-rating"]')?.focus();
    return;
  }
  const details = String(container?.querySelector("[data-feedback-details]")?.value || "").trim().slice(0, 2000);
  const controls = container ? $$("[data-action='research-feedback'], [data-action='select-feedback-rating'], [data-feedback-details]", container) : [element];
  controls.forEach((control) => {
    control.disabled = true;
    if (control.matches?.("[data-action='research-feedback']")) control.dataset.busy = "true";
  });
  if (status) status.textContent = "Saving…";
  let succeeded = false;
  try {
    const data = await api("/api/research-feedback", { method: "POST", body: JSON.stringify({ helpful, rating, details, source: scope === "daily" ? "daily-return" : "research-results", research }) });
    if (!data.recorded) throw new Error(data.feedbackSync?.reason || data.sync?.reason || "The feedback row could not be recorded.");
    succeeded = true;
    if (container) container.dataset.submitted = "true";
    if (scope === "daily") {
      state.dailyResearchFeedbackPending = false;
      try { localStorage.setItem(researchFeedbackStorageKey(), JSON.stringify({ status: "done" })); } catch {}
      closeDailyResearchFeedback();
    } else if (status) {
      status.textContent = "Thanks — your rating and feedback were recorded.";
    }
  } catch (error) {
    if (status) status.textContent = error.message;
  } finally {
    if (!succeeded) {
      controls.forEach((control) => {
        control.disabled = false;
        if (control.matches?.("[data-action='research-feedback']")) delete control.dataset.busy;
      });
    }
  }
}

function applyFollowUp(element) {
  const question = String(element.dataset.followupQuestion || "").trim();
  const option = String(element.dataset.followupOption || "").trim();
  const field = $('#ai-form textarea[name="description"]');
  if (!field || !option) return;
  const addition = [question, option].filter(Boolean).join(" ");
  const current = String(field.value || "").trim();
  field.value = current.includes(addition) ? current : `${current}${current ? "\n" : ""}${addition}`;
  $("#ai-form")?.requestSubmit?.();
}

function returnHome() {
  closePanel();
  resetMap();
  window.setTimeout(showDailyResearchFeedback, 0);
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
  button.textContent = guideText("aiChecking");
  character?.classList.add("thinking");
  $("#ai-error").textContent = "";
  try {
    const payload = { topic: state.currentTopic, diagnosis: state.currentDiagnosis, description, count, language: state.settings.language || "en", allowFollowUpQuestions: Boolean(state.settings.precisionResearch) };
    const data = await api("/api/ai/recommend", { method: "POST", body: JSON.stringify(payload) });
    if (data.sync) state.sheetSync = { configured: data.sync.synced || state.sheetSync.configured, ...data.sync };
    character?.classList.remove("thinking");
    character?.classList.add("celebrate");
    state.audio?.playAnimal("capybara");
    setTimeout(() => character?.classList.remove("celebrate"), 1500);
    $("#ai-results").innerHTML = renderCompletedResearch(data, payload, "1.0");
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
      <button type="button" class="secondary-button resource-explain-button" data-action="explain-resource" data-resource-json='${resourceJson}'>${escapeHtml(guideText("resourceExplain"))}</button>
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
      <div class="record-profile-heading">
        ${communityAvatarHtml({ userId: state.user?.id, name: state.user?.name, avatarDataUrl: state.user?.avatarDataUrl }, { clickable: false, className: "large" })}
        <div><strong>${escapeHtml(state.user?.name || t("recordTitle"))}</strong><small>${escapeHtml(t("changeProfilePhoto"))}</small></div>
        <label class="secondary-button record-avatar-upload">${escapeHtml(t("changePhoto"))}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-community-avatar data-avatar-context="profile"></label>
      </div>
      <div class="sync-badge ${state.sheetSync.configured ? "connected" : "missing"}">${escapeHtml(state.sheetSync.configured ? t("sheetConnected") : t("sheetMissing"))}</div>
      <div class="record-summary">${escapeHtml(profile?.summary || "Complete the Community Compass to create your record.")}</div>
      <div class="record-primary-actions">
        <button type="button" class="primary-button" data-action="restart-introduction">${escapeHtml(t("restartIntro"))}</button>
        <button type="button" class="secondary-button" data-action="edit-survey">${escapeHtml(t("updateSurvey"))}</button>
      </div>
      <div class="card-list"><article class="record-card"><strong>${escapeHtml(t("recentSearches"))}</strong><ul class="gentle-list">${history.length ? history.slice(-5).reverse().map((item) => `<li><strong>${escapeHtml(item.topic)}</strong> · ${escapeHtml(item.description)}</li>`).join("") : `<li>${escapeHtml(t("noSearches"))}</li>`}</ul></article>
      <article class="record-card resource-record-card"><strong>${escapeHtml(t("savedResourcesTitle"))}</strong>${recordResourceList(likedResources, "noSavedResources")}</article>
      <article class="record-card resource-record-card"><strong>${escapeHtml(t("dislikedResourcesTitle"))}</strong>${recordResourceList(dislikedResources, "noDislikedResources")}</article></div>
      <form id="feedback-form" class="feedback-form"><label>${escapeHtml(t("feedbackLabel"))}<textarea name="feedback" rows="4" placeholder="What felt helpful or confusing?">${escapeHtml(state.user?.feedback || "")}</textarea></label><button class="secondary-button" type="submit">${escapeHtml(t("feedbackSave"))}</button><p id="feedback-status" role="status"></p></form>
      <button class="text-button" data-action="logout">${escapeHtml(t("logout"))}</button>`
  });
}

function adminFunctionButton(action, icon, title, description) {
  return `<button type="button" class="admin-function-button" data-action="${escapeHtml(action)}"><span class="admin-function-icon" aria-hidden="true">${escapeHtml(icon)}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span><span class="admin-function-arrow" aria-hidden="true">→</span></button>`;
}

function adminFunctionsPanel() {
  if (!state.user?.isAdmin) return toast("Administrator access is required.");
  const functions = [
    ["admin-publish-announcement", "+", "Publish announcement", "Create and optionally pin a new village announcement."],
    ["admin-manage-announcements", "A", "Manage or delete announcements", "Edit, pin, review, or remove existing announcements."],
    ["admin-publish-activity", "+", "Publish activity", "Add an upcoming event or volunteer opportunity."],
    ["admin-manage-activities", "V", "Manage or delete activities", "Review the activity list and remove expired entries."],
    ["admin-manage-users", "U", "Administrator access", "Add registered administrators or remove existing access."],
    ["admin-keyword-controls", "#", "Primary keyword controls", "Block terms from Primary Keywords and the Error sheet record."],
    ["admin-community-blocklist", "✱", "Community restricted words", "Share and edit chat masking rules across all administrators."],
    ["admin-community-reports", "!", "Reports & penalties", "Review reports, issue time-limited penalties, and revoke active penalties."]
  ];
  openPanel({
    title: "Administrator Functions",
    eyebrow: "Private village controls",
    html: `<p class="admin-function-intro">These controls are visible only to administrators. Choose one function to open its dedicated workspace.</p><div class="admin-function-grid">${functions.map((entry) => adminFunctionButton(...entry)).join("")}</div>`
  });
}

function adminUsersPanel() {
  if (!state.user?.isAdmin) return toast("Administrator access is required.");
  openPanel({
    title: "Administrator access",
    eyebrow: "Private village controls",
    html: `<section class="admin-manager"><div><p class="eyebrow">Village administration</p><h3>Administrators</h3><p>Add a registered account by email. Administrators can publish, edit, and remove village content.</p></div><form id="admin-add-form" class="admin-add-form"><label>Account email<input type="email" name="email" required placeholder="person@example.com" /></label><button class="secondary-button" type="submit">Add administrator</button><p class="form-error" role="alert"></p></form><div id="admin-user-list" class="admin-user-list"><p class="record-empty">Loading administrators…</p></div></section>`
  });
  loadAdminUsers();
}

function adminKeywordsPanel() {
  if (!state.user?.isAdmin) return toast("Administrator access is required.");
  openPanel({
    title: "Primary keyword controls",
    eyebrow: "Private village controls",
    html: `<form id="primary-keyword-blocklist-form" class="admin-keyword-settings"><div><strong>Blocked words and phrases</strong><small>Words listed here cannot appear as Primary Keywords or in the Error sheet Primary Keywords record.</small></div><label>One term per line<textarea name="keywords" rows="8" placeholder="waffles&#10;village">${escapeHtml((state.primaryKeywordBlocklist || []).join("\n"))}</textarea></label><button type="submit" class="primary-button">Save blocked keywords</button><p class="form-error" role="status"></p></form>`
  });
  loadPrimaryKeywordBlocklist();
}

function adminCommunityBlocklistPanel() {
  if (!state.user?.isAdmin) return toast("Administrator access is required.");
  openPanel({
    title: "Community restricted words",
    eyebrow: "Shared administrator controls",
    html: `<form id="community-blocklist-form" class="admin-keyword-settings"><div><strong>Shared restricted words and phrases</strong><small>One administrator's changes are immediately shared with every administrator. Matching text in community chat, Moments, and comments is replaced with asterisks.</small></div><label>One term per line<textarea name="terms" rows="10" placeholder="restricted phrase">${escapeHtml((state.communityBlocklist || []).join("\n"))}</textarea></label><button type="submit" class="primary-button">Save shared restrictions</button><p class="form-error" role="status"></p></form>`
  });
  loadCommunityBlocklist();
}

async function loadCommunityBlocklist() {
  const form = $("#community-blocklist-form");
  if (!form) return;
  const status = form.querySelector(".form-error");
  try {
    const data = await api("/api/admin/community-blocklist");
    state.communityBlocklist = data.terms || [];
    form.elements.terms.value = state.communityBlocklist.join("\n");
    status.textContent = "";
  } catch (error) { status.textContent = error.message; }
}

async function submitCommunityBlocklist(event) {
  event.preventDefault();
  const form = event.target;
  const status = form.querySelector(".form-error");
  status.textContent = "Saving shared restrictions…";
  try {
    const data = await api("/api/admin/community-blocklist", { method: "PUT", body: JSON.stringify({ text: new FormData(form).get("terms") }) });
    state.communityBlocklist = data.terms || [];
    form.elements.terms.value = state.communityBlocklist.join("\n");
    status.textContent = "Saved for every administrator.";
    toast("Community restrictions saved.");
  } catch (error) { status.textContent = error.message; }
}

function adminSanctionFormHtml(report) {
  if (report.status === "dismissed") {
    return `<p class="moderation-admin-note">This report was dismissed. Reopen it before issuing a penalty.</p>`;
  }
  if (!report.reportedUserId || report.reportedIsAdmin) {
    return `<p class="moderation-admin-note">${escapeHtml(report.reportedIsAdmin ? "Administrator accounts cannot be penalized through this tool." : "The reported account is no longer available.")}</p>`;
  }
  return `<details class="moderation-admin-action">
    <summary>Issue a penalty</summary>
    <form data-admin-sanction-form data-report-id="${escapeHtml(report.id)}" data-target-name="${escapeHtml(report.reportedName || report.reportedEmail || "this member")}">
      <label>Penalty type<select name="type" required><option value="chat_mute">Chat mute</option><option value="community_ban">Community suspension</option><option value="site_blacklist">Site blacklist</option></select></label>
      <label>Duration<select name="durationSeconds" required><option value="3600">1 hour</option><option value="86400">1 day</option><option value="259200">3 days</option><option value="604800">7 days</option><option value="864000">10 days</option><option value="2592000">30 days</option><option value="permanent">Permanent</option></select></label>
      <label>Reason<textarea name="reason" rows="3" maxlength="1000" required>${escapeHtml(report.reason || "")}</textarea></label>
      <button type="submit" class="danger-button">Issue penalty</button><p class="form-error" role="status"></p>
    </form>
  </details>`;
}

function adminCommunityReportsHtml(reports = []) {
  return reports.map((report) => {
    const sanctions = (report.sanctions || []).map((sanction) => `<div class="moderation-admin-existing"><span><strong>${escapeHtml(sanction.label || sanction.type)}</strong> · ${escapeHtml(sanction.active ? sanction.endsAt ? `active until ${new Date(sanction.endsAt).toLocaleString()}` : "active · permanent (until revoked)" : sanction.revokedAt ? "revoked" : "expired")}</span>${sanction.active ? `<button type="button" class="text-button danger" data-action="revoke-community-sanction" data-sanction-id="${escapeHtml(sanction.id)}">Revoke</button>` : ""}</div>`).join("");
    return `<article class="admin-report-row moderation-report-row">
      <div><small>${escapeHtml(report.status)} · ${escapeHtml(new Date(report.createdAt).toLocaleString())}</small><strong>${escapeHtml(report.reportedName || "Unknown member")}</strong>${report.reportedEmail ? `<span>${escapeHtml(report.reportedEmail)}</span>` : ""}<p>${escapeHtml(report.reason)}</p>${report.messageBody ? `<blockquote>${escapeHtml(report.messageBody)}</blockquote>` : ""}<span>Reported by ${escapeHtml(report.reporterName || "member")}</span></div>
      ${sanctions ? `<div class="moderation-admin-existing-list">${sanctions}</div>` : ""}
      <div class="community-actions">${report.status === "open" ? `<button type="button" class="secondary-button" data-action="review-community-report" data-report-id="${escapeHtml(report.id)}" data-report-status="reviewed">Mark reviewed</button><button type="button" class="text-button" data-action="review-community-report" data-report-id="${escapeHtml(report.id)}" data-report-status="dismissed">Dismiss</button>` : report.status === "dismissed" ? `<button type="button" class="secondary-button" data-action="review-community-report" data-report-id="${escapeHtml(report.id)}" data-report-status="open">Reopen for review</button>` : ""}</div>
      ${adminSanctionFormHtml(report)}
    </article>`;
  }).join("") || `<p class="record-empty">There are no community reports.</p>`;
}

function adminSanctionsHtml(sanctions = []) {
  const active = sanctions.filter((sanction) => sanction.active);
  return active.map((sanction) => `<article class="moderation-active-row"><div><strong>${escapeHtml(sanction.targetName || "Unknown member")}</strong><span>${escapeHtml(sanction.targetEmail || "")}</span><small>${escapeHtml(sanction.label || sanction.type)} · ${escapeHtml(sanction.endsAt ? `ends ${new Date(sanction.endsAt).toLocaleString()}` : "permanent")}</small><p>${escapeHtml(sanction.reason)}</p></div><button type="button" class="text-button danger" data-action="revoke-community-sanction" data-sanction-id="${escapeHtml(sanction.id)}">Revoke</button></article>`).join("") || `<p class="record-empty">There are no active penalties.</p>`;
}

async function adminCommunityReportsPanel() {
  if (!state.user?.isAdmin) return toast("Administrator access is required.");
  openPanel({ title: "Reports & penalties", eyebrow: "Shared administrator controls", html: `<section class="moderation-admin-section"><h3>Active penalties</h3><div id="community-sanction-list"><p class="record-empty">Loading penalties…</p></div></section><section class="moderation-admin-section"><h3>Member reports</h3><div id="community-report-list"><p class="record-empty">Loading reports…</p></div></section>` });
  try {
    const [data, sanctionData] = await Promise.all([
      api("/api/admin/community-reports"),
      api("/api/admin/community-sanctions")
    ]);
    state.communityReports = data.reports || [];
    state.communitySanctions = sanctionData.sanctions || [];
    $("#community-sanction-list").innerHTML = adminSanctionsHtml(state.communitySanctions);
    $("#community-report-list").innerHTML = adminCommunityReportsHtml(state.communityReports);
  } catch (error) { $("#community-report-list").innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function submitAdminCommunitySanction(event) {
  event.preventDefault();
  const form = event.target;
  const status = form.querySelector(".form-error");
  const data = new FormData(form);
  const duration = data.get("durationSeconds");
  const type = String(data.get("type") || "");
  const typeLabel = type === "site_blacklist" ? "site blacklist" : type === "community_ban" ? "Community suspension" : "chat mute";
  const durationLabel = duration === "permanent" ? "permanently" : `for ${moderationDurationLabel({ durationSeconds: Number(duration) })}`;
  const warning = type === "site_blacklist"
    ? `Blacklist ${form.dataset.targetName} ${durationLabel}? This will immediately sign the member out and prevent Village website login. Their account data will not be deleted.`
    : `Issue a ${typeLabel} to ${form.dataset.targetName} ${durationLabel}?`;
  if (!confirm(warning)) return;
  if (type === "site_blacklist" && !confirm(`Final confirmation: blacklist ${form.dataset.targetName} now and revoke every active session?`)) return;
  status.textContent = "Issuing penalty…";
  form.querySelector("button[type='submit']").disabled = true;
  try {
    await api(`/api/admin/community-reports/${encodeURIComponent(form.dataset.reportId)}/sanctions`, {
      method: "POST",
      body: JSON.stringify({
        type,
        reason: data.get("reason"),
        permanent: duration === "permanent",
        durationSeconds: duration === "permanent" ? null : Number(duration)
      })
    });
    toast("Penalty issued and the member was notified.");
    await adminCommunityReportsPanel();
  } catch (error) {
    status.textContent = error.message;
    form.querySelector("button[type='submit']").disabled = false;
  }
}

async function revokeCommunitySanction(sanctionId) {
  const reason = prompt("Why is this penalty being revoked?", "Penalty revoked after administrator review");
  if (reason === null) return;
  try {
    await api(`/api/admin/community-sanctions/${encodeURIComponent(sanctionId)}/revoke`, { method: "PATCH", body: JSON.stringify({ reason }) });
    toast("Penalty revoked.");
    await adminCommunityReportsPanel();
  } catch (error) { toast(error.message); }
}

function announcementLabels() {
  if (state.settings.language === "zh") return { title: "村庄公告", eyebrow: "更新与重要事件", empty: "目前还没有公告。", publish: "发布新公告", headline: "标题", details: "公告内容", category: "类型", pinned: "置顶公告", submit: "发布公告", edit: "编辑", save: "保存修改", cancel: "取消", remove: "删除公告", by: "发布人" };
  if (state.settings.language === "es") return { title: "Anuncios", eyebrow: "Novedades y eventos importantes", empty: "Todavía no hay anuncios.", publish: "Publicar un anuncio", headline: "Título", details: "Detalles", category: "Categoría", pinned: "Fijar anuncio", submit: "Publicar", edit: "Editar", save: "Guardar cambios", cancel: "Cancelar", remove: "Eliminar", by: "Publicado por" };
  return { title: "Village announcements", eyebrow: "Updates & important events", empty: "There are no announcements yet.", publish: "Publish an announcement", headline: "Title", details: "Announcement details", category: "Category", pinned: "Pin this announcement", submit: "Publish announcement", edit: "Edit", save: "Save changes", cancel: "Cancel", remove: "Delete announcement", by: "Posted by" };
}

function announcementDate(value) {
  try { return new Intl.DateTimeFormat(state.settings.language || "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
  catch { return String(value || ""); }
}

function sortAnnouncements(items) {
  return [...(items || [])].sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || String(b.createdAt).localeCompare(String(a.createdAt)));
}

function latestAnnouncementToken() {
  const latest = [...state.announcements].sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))[0];
  return latest ? `${latest.id}:${latest.updatedAt || latest.createdAt}` : "none";
}

function announcementSeenKey() {
  return `capy-announcement-seen:${state.user?.id || "visitor"}`;
}

function renderAnnouncements({ compose = false } = {}) {
  const labels = announcementLabels();
  const editing = state.announcements.find((item) => item.id === state.editingAnnouncementId) || null;
  const selected = state.announcements.find((item) => item.id === state.selectedAnnouncementId) || state.announcements[0];
  state.selectedAnnouncementId = selected?.id || null;
  const list = state.announcements.length ? state.announcements.map((item) => `<button type="button" class="announcement-list-item ${item.id === selected?.id ? "active" : ""}" data-action="select-announcement" data-announcement-id="${escapeHtml(item.id)}"><small>${item.isPinned ? "✦ " : ""}${escapeHtml(item.category || "Update")}</small><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(announcementDate(item.createdAt))}</span></button>`).join("") : `<p class="announcement-empty">${escapeHtml(labels.empty)}</p>`;
  const detail = selected ? `<article class="announcement-detail"><div class="announcement-detail-meta"><span>${selected.isPinned ? "✦ Pinned · " : ""}${escapeHtml(selected.category || "Update")}</span><time>${escapeHtml(announcementDate(selected.createdAt))}</time></div><h2>${escapeHtml(selected.title)}</h2><div class="announcement-body">${escapeHtml(selected.body).replace(/\n/g, "<br>")}</div><p>${escapeHtml(labels.by)} ${escapeHtml(selected.authorName || "Village admin")}</p>${state.user?.isAdmin ? `<div class="announcement-admin-actions"><button type="button" class="text-button" data-action="edit-announcement" data-announcement-id="${escapeHtml(selected.id)}">${escapeHtml(labels.edit)}</button><button type="button" class="text-button danger-text" data-action="delete-announcement" data-announcement-id="${escapeHtml(selected.id)}">${escapeHtml(labels.remove)}</button></div>` : ""}</article>` : `<div class="announcement-detail announcement-empty-detail"><span aria-hidden="true">📜</span><p>${escapeHtml(labels.empty)}</p></div>`;
  const form = state.user?.isAdmin ? `<details class="announcement-composer" ${editing || compose ? "open" : ""}><summary>${escapeHtml(editing ? labels.edit : labels.publish)}</summary><form id="announcement-form" class="stack-form"><input type="hidden" name="id" value="${escapeHtml(editing?.id || "")}" /><label>${escapeHtml(labels.headline)}<input name="title" maxlength="120" required value="${escapeHtml(editing?.title || "")}" /></label><label>${escapeHtml(labels.category)}<input name="category" maxlength="40" value="${escapeHtml(editing?.category || "Update")}" /></label><label>${escapeHtml(labels.details)}<textarea name="body" rows="6" maxlength="5000" required>${escapeHtml(editing?.body || "")}</textarea></label><label class="check-row"><input type="checkbox" name="isPinned" ${editing?.isPinned ? "checked" : ""} /> ${escapeHtml(labels.pinned)}</label><div class="announcement-form-actions"><button class="primary-button" type="button" data-action="save-announcement">${escapeHtml(editing ? labels.save : labels.submit)}</button>${editing ? `<button class="secondary-button" type="button" data-action="cancel-announcement-edit">${escapeHtml(labels.cancel)}</button>` : ""}</div><p class="form-error" role="alert"></p></form></details>` : "";
  return `${form}<div class="announcement-parchment"><aside class="announcement-list">${list}</aside>${detail}</div>`;
}

async function announcementsPanel({ compose = false } = {}) {
  const labels = announcementLabels();
  openPanel({ title: labels.title, eyebrow: labels.eyebrow, html: `<div class="announcement-loading">Opening the notice board…</div>` });
  try {
    const data = await api("/api/announcements");
    state.announcements = sortAnnouncements(data.announcements);
    if (state.user) state.user.isAdmin = Boolean(data.isAdmin);
    renderAccountStatus();
    $("#panel-content").innerHTML = renderAnnouncements({ compose });
    localStorage.setItem(announcementSeenKey(), latestAnnouncementToken());
    $("#announcement-dot")?.classList.add("hidden");
  } catch (error) { $("#panel-content").innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function refreshAnnouncementBadge() {
  if (!state.user) return;
  try {
    const data = await api("/api/announcements");
    state.announcements = sortAnnouncements(data.announcements);
    state.user.isAdmin = Boolean(data.isAdmin);
    renderAccountStatus();
    const latestId = latestAnnouncementToken();
    const lastSeen = localStorage.getItem(announcementSeenKey());
    $("#announcement-dot")?.classList.toggle("hidden", latestId === "none" || latestId === lastSeen);
  } catch {}
}

async function submitAnnouncementForm(form) {
  if (!form || !form.reportValidity()) return;
  const data = new FormData(form); const status = form.querySelector(".form-error");
  status.textContent = "Publishing…";
  try {
    const id = String(data.get("id") || "");
    const result = await api(id ? `/api/announcements/${encodeURIComponent(id)}` : "/api/announcements", { method: id ? "PATCH" : "POST", body: JSON.stringify({ title: data.get("title"), category: data.get("category"), body: data.get("body"), isPinned: data.get("isPinned") === "on" }) });
    state.announcements = sortAnnouncements(id ? state.announcements.map((item) => item.id === id ? result.announcement : item) : [...state.announcements, result.announcement]); state.selectedAnnouncementId = result.announcement.id; state.editingAnnouncementId = null;
    localStorage.setItem(announcementSeenKey(), latestAnnouncementToken());
    $("#panel-content").innerHTML = renderAnnouncements(); toast(id ? "Announcement updated." : "Announcement published.");
  } catch (error) { status.textContent = error.message; }
}

function submitAnnouncement(event) {
  event.preventDefault();
  submitAnnouncementForm(event.target);
}

async function loadAdminUsers() {
  const container = $("#admin-user-list"); if (!container) return;
  try {
    state.adminUsers = (await api("/api/admin/users")).users || [];
    container.innerHTML = state.adminUsers.map((item) => `<div class="admin-user-row"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.email)}</span></div>${item.isOwner ? `<small>Owner</small>` : item.id === state.user?.id ? `<small>You</small>` : `<button type="button" class="text-button danger-text" data-action="remove-admin" data-user-id="${escapeHtml(item.id)}">Remove</button>`}</div>`).join("");
  } catch (error) { container.innerHTML = `<p class="form-error">${escapeHtml(error.message)}</p>`; }
}

async function loadPrimaryKeywordBlocklist() {
  const form = $("#primary-keyword-blocklist-form");
  if (!form) return;
  const status = form.querySelector(".form-error");
  try {
    const data = await api("/api/admin/primary-keyword-blocklist");
    state.primaryKeywordBlocklist = data.keywords || [];
    form.elements.keywords.value = state.primaryKeywordBlocklist.join("\n");
    status.textContent = "";
  } catch (error) {
    status.textContent = error.message;
  }
}

async function submitPrimaryKeywordBlocklist(event) {
  event.preventDefault();
  const form = event.target;
  const status = form.querySelector(".form-error");
  status.textContent = "Saving…";
  try {
    const data = await api("/api/admin/primary-keyword-blocklist", { method: "PUT", body: JSON.stringify({ text: new FormData(form).get("keywords") }) });
    state.primaryKeywordBlocklist = data.keywords || [];
    form.elements.keywords.value = state.primaryKeywordBlocklist.join("\n");
    status.textContent = "Saved.";
    toast("Primary keyword controls saved.");
  } catch (error) { status.textContent = error.message; }
}

async function submitAdminAdd(event) {
  event.preventDefault(); const form = event.target; const status = form.querySelector(".form-error");
  status.textContent = "Adding…";
  try { await api("/api/admin/users", { method: "POST", body: JSON.stringify({ email: new FormData(form).get("email") }) }); form.reset(); status.textContent = ""; await loadAdminUsers(); toast("Administrator added."); }
  catch (error) { status.textContent = error.message; }
}

function buildingGuideTopic(building) {
  if (building.type === "support") return "Support";
  if (building.type === "activity") return "Activity";
  return building.topic || "Waffles";
}

function openBuildingDestination(building) {
  if (building.type === "support") supportPanel("phone", building.island);
  if (building.type === "activity") activitiesPanel();
  if (building.type === "ai") aiPanel(building.topic, building.island);
}

function buildingInteriorScene(building) {
  const interiorKey = state.settings.sceneMode === "3d" ? building.interior : building.interior2d || building.interior;
  return config.interiors?.[interiorKey] || {};
}

function showBuildingInterior(building) {
  const scene = buildingInteriorScene(building);
  const interior = $("#building-interior");
  const image = $("#building-interior-image");
  image.src = scene.image || config.map.image;
  image.alt = `${scene.title || building.mapLabel || building.short} illustrated interior`;
  image.style.objectFit = scene.fit || "cover";
  image.style.objectPosition = scene.position || "center";
  $("#building-interior-title").textContent = scene.title || building.mapLabel || building.short;
  $("#building-interior-island").textContent = building.island === "autism" ? t("autismIsland") : t("adhdIsland");
  interior.classList.remove("hidden");
  interior.setAttribute("aria-hidden", "false");
  if (state.settings.sceneMode === "3d") {
    state.interior3d?.open(building, {
      reducedMotion: state.settings.calm,
      quality: effectiveVisualQuality(),
      environment: effectiveEnvironment()
    });
  }
  else state.interior3d?.close();
  document.body.classList.remove("building-transitioning");
  document.body.classList.add("building-mode");
  openBuildingDestination(building);
}

function enterBuilding(building) {
  const scene = buildingInteriorScene(building);
  const guide = GUIDE_CHARACTERS[buildingGuideTopic(building)] || GUIDE_CHARACTERS.Waffles;
  const loading = $("#building-loading");
  clearTimeout(state.buildingTransitionTimer);
  state.activeBuilding = building;
  $("#building-loading-title").textContent = `Entering ${scene.title || building.mapLabel || building.short}`;
  $("#building-loading-character").src = guide.src;
  $("#building-loading-character").alt = "";
  $("#building-interior-image").src = scene.image || config.map.image;
  loading.classList.remove("hidden", "active");
  loading.setAttribute("aria-hidden", "false");
  document.body.classList.add("building-transitioning");
  void loading.offsetWidth;
  loading.classList.add("active");
  state.buildingTransitionTimer = window.setTimeout(() => {
    loading.classList.add("hidden");
    loading.classList.remove("active");
    loading.setAttribute("aria-hidden", "true");
    showBuildingInterior(building);
  }, state.settings.calm ? 320 : 1500);
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
  enterBuilding(building);
}

function applySettings() {
  state.settings = { fontSize: "normal", theme: "sage", language: "en", sceneMode: "2d", visualQuality: "high", calm: false, soundEnabled: false, voiceAssistant: false, voiceControl: false, precisionResearch: false, masterVolume: .35, environmentVolume: .65, musicVolume: .26, animalVolume: .22, resourceCount: 5, ...state.settings };
  if (state.settings.calm && state.settings.visualQuality !== "low") {
    state.settings.visualQualityBeforeCalm ||= state.settings.visualQuality;
    state.settings.visualQuality = "low";
  }
  const { fontSize, theme, language, sceneMode, calm } = state.settings;
  const visualQuality = effectiveVisualQuality();
  const renderedEnvironment = effectiveEnvironment();
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
  state.ecosystem?.setAtmosphere(renderedEnvironment);
  state.ecosystem?.setSceneMode(sceneMode);
  state.immersive?.setReducedMotion(calm);
  state.immersive?.setEnabled(sceneMode === "3d");
  state.immersive?.setEnvironment(renderedEnvironment);
  state.interior3d?.setQuality(visualQuality);
  state.interior3d?.setReducedMotion(calm);
  state.interior3d?.setEnvironment(renderedEnvironment);
  if (state.activeBuilding && !$("#building-interior")?.classList.contains("hidden")) {
    if (sceneMode === "3d") {
      state.interior3d?.open(state.activeBuilding, {
        reducedMotion: calm,
        quality: visualQuality,
        environment: renderedEnvironment
      });
    }
    else state.interior3d?.close();
  }
  state.surfaceMotion?.setReducedMotion(calm);
  state.surfaceMotion?.setEnabled(sceneMode !== "3d" && !calm);
  state.surfaceMotion?.setEnvironment(renderedEnvironment);
  state.audio?.setWeather?.(renderedEnvironment.weatherKind || renderedEnvironment.weather || "clear");
  state.audio?.setSeason?.(renderedEnvironment.season || "summer");
  state.audio?.setDay?.(renderedEnvironment.isDay !== false);
  state.audio?.setClock?.({ currentMinutes: renderedEnvironment.currentMinutes ?? 720, sunrise: renderedEnvironment.sunrise ?? 360 });
  state.audio?.setSceneMode?.(sceneMode);
  state.audio?.applySettings();
  if (state.user) renderAccountStatus();
  renderResourceStatus();
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

function togglePrecisionResearch() {
  state.settings.precisionResearch = !state.settings.precisionResearch;
  applySettings();
  settingsPanel();
  toast(t("settingsSaved"));
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
  if (action === "home") { returnHome(); return say(intent.speech || "Back to both islands."); }
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
  if (state.settings.calm) {
    state.settings.calm = false;
    state.settings.visualQuality = state.settings.visualQualityBeforeCalm || state.settings.visualQuality || "high";
    delete state.settings.visualQualityBeforeCalm;
  } else {
    state.settings.visualQualityBeforeCalm = state.settings.visualQuality || "high";
    state.settings.visualQuality = "low";
    state.settings.calm = true;
  }
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

function renderResourceStatus() {
  if (!Array.isArray(state.resources)) return;
  const count = $("#resource-count");
  const source = $("#resource-source");
  if (count) count.textContent = t("resourcesReadyCount").replace("{count}", String(state.resources.length));
  if (source) source.textContent = t(state.resourceSource === "google-sheet-live" ? "resourcesLive" : state.resourceSource === "google-sheet-cache" ? "resourcesCache" : "resourcesFallback");
}

async function loadResources(force = false) {
  const count = $("#resource-count");
  const source = $("#resource-source");
  count.textContent = t("resourcesLoading");
  source.textContent = t("resourcesChecking");
  try {
    const data = await api(`/api/resources${force ? "?refresh=1" : ""}`);
    state.resources = data.resources;
    state.resourceSource = data.source;
    renderResourceStatus();
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
  state.environment = { ...state.environment, isDay, currentMinutes, sunrise, sunset };
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
  if (!state.settings.calm) {
    state.ecosystem?.setClock({ isDay, currentMinutes, sunrise, sunset, localDate, locationSeed });
    state.audio?.setDay(isDay);
    state.audio?.setClock({ currentMinutes, sunrise });
    renderMoonPhase(environment);
  }
  const renderedEnvironment = effectiveEnvironment(state.environment);
  state.immersive?.setEnvironment(renderedEnvironment);
  state.interior3d?.setEnvironment(renderedEnvironment);
  state.surfaceMotion?.setEnvironment(renderedEnvironment);
  renderEnvironmentStatus();
}

function applyEnvironment(environment, available = true) {
  const stage = $("#map-stage");
  if (!stage) return;
  const parts = zonedParts(environment.location?.timezone || "UTC");
  const season = seasonFor(Number(parts.month), environment.hemisphere);
  const kind = weatherKind(Number(environment.current?.weatherCode || 0));
  state.environment = {
    ...environment,
    available,
    season,
    weatherKind: kind,
    windSpeed: Number(environment.current?.windSpeed || 0),
    cloudCover: Number(environment.current?.cloudCover || 0)
  };
  stage.classList.remove("season-spring", "season-summer", "season-autumn", "season-winter", "weather-clear", "weather-cloudy", "weather-fog", "weather-rain", "weather-snow", "weather-storm");
  stage.classList.add(`season-${season}`, `weather-${kind}`);
  stage.style.setProperty("--cloud-strength", String(Math.max(.15, Math.min(1, Number(environment.current?.cloudCover || 0) / 100))));
  state.audio?.setWeather(kind);
  state.audio?.setSeason(season);
  const atmosphere = effectiveEnvironment({ weather: kind, weatherKind: kind, season, windSpeed: Number(environment.current?.windSpeed || 0), cloudCover: Number(environment.current?.cloudCover || 0) });
  state.ecosystem?.setAtmosphere(atmosphere);
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
  renderHeaderAvatar();
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

function openWafflesIntro({ force = false } = {}) {
  if (!state.user || state.user.guest || (!force && state.user.onboardingCompleted !== false)) return;
  state.introStep = 0;
  state.introOpen = true;
  state.introReplay = Boolean(force);
  $("#waffles-intro").classList.remove("hidden");
  renderWafflesIntro();
  $("#intro-next").focus();
}

async function finishWafflesIntro() {
  state.introOpen = false;
  $("#waffles-intro").classList.add("hidden");
  const replay = state.introReplay;
  state.introReplay = false;
  if (!state.user || state.user.guest || replay || state.user.onboardingCompleted) return;
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
  state.currentResearch = null;
  state.dailyResearchContext = null;
  state.dailyResearchFeedbackPending = false;
  closeDailyResearchFeedback();
  clearInterval(state.environmentTimer);
  clearTimeout(state.environmentRefreshTimer);
  state.ecosystem?.destroy();
  state.audio?.context?.suspend().catch(() => {});
  stopCommunityUpdates();
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
      ? "Feedback saved to your account and Feedback sheet. Thank you."
      : `Feedback saved to your account, but the Feedback sheet could not be updated${data.sync?.reason ? `: ${data.sync.reason}` : "."}`;
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
  if (action === "exit-building") exitBuilding();
  if (action === "reset-map" || action === "home") returnHome();
  if (action === "open-profile") profilePanel();
  if (action === "open-quick-search") quickSearchPanel();
  if (action === "restart-introduction") { closePanel(); openWafflesIntro({ force: true }); }
  if (action === "edit-survey") startSurveyEdit();
  if (action === "cancel-survey-edit") cancelSurveyEdit();
  if (action === "open-settings") settingsPanel();
  if (action === "open-admin-functions") adminFunctionsPanel();
  if (action === "admin-publish-announcement") announcementsPanel({ compose: true });
  if (action === "admin-manage-announcements") announcementsPanel();
  if (action === "admin-publish-activity") activitiesPanel({ compose: true });
  if (action === "admin-manage-activities") activitiesPanel();
  if (action === "admin-manage-users") adminUsersPanel();
  if (action === "admin-keyword-controls") adminKeywordsPanel();
  if (action === "admin-community-blocklist") adminCommunityBlocklistPanel();
  if (action === "admin-community-reports") adminCommunityReportsPanel();
  if (action === "review-community-report") {
    api(`/api/admin/community-reports/${encodeURIComponent(actionElement.dataset.reportId)}`, { method: "PATCH", body: JSON.stringify({ status: actionElement.dataset.reportStatus }) })
      .then(() => adminCommunityReportsPanel()).catch((error) => toast(error.message));
  }
  if (action === "revoke-community-sanction") revokeCommunitySanction(actionElement.dataset.sanctionId);
  if (action === "open-announcements") announcementsPanel();
  if (action === "select-announcement") { state.selectedAnnouncementId = actionElement.dataset.announcementId; $("#panel-content").innerHTML = renderAnnouncements(); }
  if (action === "save-announcement") submitAnnouncementForm(actionElement.closest("form"));
  if (action === "edit-announcement") { state.editingAnnouncementId = actionElement.dataset.announcementId; $("#panel-content").innerHTML = renderAnnouncements(); $("#panel-content").scrollTo({ top: 0, behavior: "smooth" }); }
  if (action === "cancel-announcement-edit") { state.editingAnnouncementId = null; $("#panel-content").innerHTML = renderAnnouncements(); }
  if (action === "delete-announcement") { if (confirm("Delete this announcement?")) api(`/api/announcements/${encodeURIComponent(actionElement.dataset.announcementId)}`, { method: "DELETE" }).then(() => { state.announcements = state.announcements.filter((item) => item.id !== actionElement.dataset.announcementId); state.selectedAnnouncementId = null; $("#panel-content").innerHTML = renderAnnouncements(); toast("Announcement deleted."); }).catch((error) => toast(error.message)); }
  if (action === "delete-activity") { if (confirm("Delete this activity?")) deleteActivity(actionElement.dataset.activityId); }
  if (action === "remove-admin") { if (confirm("Remove this administrator?")) api(`/api/admin/users/${encodeURIComponent(actionElement.dataset.userId)}`, { method: "DELETE" }).then(() => loadAdminUsers()).catch((error) => toast(error.message)); }
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
  if (action === "toggle-precision-research") togglePrecisionResearch();
  if (action === "toggle-voice-setting") toggleVoiceSetting(actionElement.dataset.voiceSetting);
  if (action === "start-voice-command") startVoiceCommand();
  if (action === "explain-resource") showResourceExplanation(actionElement);
  if (action === "like-resource") toggleResourceLike(actionElement);
  if (action === "dislike-resource") toggleResourceDislike(actionElement);
  if (action === "select-feedback-rating") selectResearchFeedbackRating(actionElement);
  if (action === "research-feedback") submitResearchFeedback(actionElement);
  if (action === "apply-follow-up") applyFollowUp(actionElement);
  if (action === "refresh-resources") loadResources(true);
  if (action === "refresh-environment") loadEnvironment(true);
  if (action === "clear-local-music") clearLocalMusic(actionElement.dataset.musicSlot);
  if ([
    "open-community", "community-tab", "close-community-workspace", "close-community-room", "show-community-directory", "close-community-directory", "toggle-community-info", "toggle-room-alerts",
    "promote-group-admin", "demote-group-admin", "transfer-community-ownership", "mute-community-member", "unmute-community-member", "remove-community-member", "review-community-join-request", "dissolve-community-group",
    "support-tab", "send-sticker", "send-custom-sticker", "save-custom-sticker", "delete-custom-sticker",
    "mention-member", "open-friend-chat", "join-community-room", "open-community-room", "connect-community", "accept-connection",
    "decline-connection", "accept-group-invite", "decline-group-invite", "disable-community", "pin-community-room",
    "clear-community-history", "leave-community-room", "remove-community-friend", "block-community-user", "unblock-community-user",
    "delete-community-post", "delete-community-comment", "toggle-moment-composer", "open-community-profile", "open-own-moments",
    "open-moment-photo", "focus-community-comment", "toggle-comment-stickers", "comment-custom-sticker", "clear-comment-image",
    "clear-community-attachment", "share-community-location", "toggle-meeting-scheduler", "join-community-meeting",
    "create-community-document", "create-community-document-kind", "open-community-document", "share-community-document",
    "share-community-document-room", "delete-community-document", "print-community-document", "return-community-room",
    "save-community-message", "unsave-community-message", "report-community-message", "mark-community-read", "open-community-notification"
  ].includes(action)) communityAction(actionElement, action);
});

document.addEventListener("input", (event) => {
  const volume = event.target.closest("[data-volume]");
  if (volume) updateVolume(volume);
  const conversationSearch = event.target.closest("[data-community-conversation-search]");
  if (conversationSearch) {
    const query = String(conversationSearch.value || "").trim().toLowerCase();
    $$(".community-conversation-row").forEach((row) => row.classList.toggle("hidden", Boolean(query) && !String(row.dataset.conversationSearch || "").includes(query)));
  }
});

document.addEventListener("change", (event) => {
  const localMusic = event.target.closest("[data-local-music]");
  if (localMusic) handleLocalMusicUpload(localMusic);
  const communityImage = event.target.closest("[data-community-image]");
  if (communityImage) handleCommunityImage(communityImage);
  const communityAttachment = event.target.closest("[data-community-attachment]");
  if (communityAttachment) handleCommunityAttachment(communityAttachment);
  const communityAvatar = event.target.closest("[data-community-avatar]");
  if (communityAvatar) handleCommunityAvatar(communityAvatar);
  const communityCover = event.target.closest("[data-community-cover]");
  if (communityCover) handleCommunityCover(communityCover);
  const communitySticker = event.target.closest("[data-community-sticker]");
  if (communitySticker) handleCommunityStickerUpload(communitySticker);
  const communityCommentImage = event.target.closest("[data-community-comment-image]");
  if (communityCommentImage) handleCommunityCommentImage(communityCommentImage);
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "auth-form") submitAuth(event);
  if (event.target.id === "password-request-form") submitPasswordRequest(event);
  if (event.target.id === "password-confirm-form") submitPasswordConfirm(event);
  if (event.target.id === "survey-form") submitSurvey(event);
  if (event.target.id === "quick-search-form") submitQuickSearch(event);
  if (event.target.id === "ai-form") submitAi(event);
  if (event.target.id === "guide-form") submitGuide(event);
  if (event.target.id === "feedback-form") submitFeedback(event);
  if (event.target.id === "announcement-form") submitAnnouncement(event);
  if (event.target.id === "activity-form") submitActivity(event);
  if (event.target.id === "admin-add-form") submitAdminAdd(event);
  if (event.target.id === "primary-keyword-blocklist-form") submitPrimaryKeywordBlocklist(event);
  if (event.target.id === "community-blocklist-form") submitCommunityBlocklist(event);
  if (event.target.matches("[data-admin-sanction-form]")) submitAdminCommunitySanction(event);
  if (event.target.id === "community-settings-form") submitCommunitySettings(event);
  if (event.target.id === "community-message-form") submitCommunityMessage(event);
  if (event.target.id === "community-search-form") submitCommunitySearch(event);
  if (event.target.id === "community-group-form") submitCommunityGroup(event);
  if (event.target.id === "community-room-invite-form") submitCommunityRoomInvite(event);
  if (event.target.id === "community-group-settings-form") submitCommunityGroupSettings(event);
  if (event.target.id === "community-post-form") submitCommunityPost(event);
  if (event.target.matches("[data-community-comment-form]")) submitCommunityComment(event);
  if (event.target.id === "community-privacy-form") submitCommunityPrivacy(event);
  if (event.target.id === "community-meeting-form") submitCommunityMeeting(event);
  if (event.target.id === "community-document-create-form" || event.target.id === "community-document-edit-form") submitCommunityDocument(event);
  if (event.target.id === "community-form-response-form") submitCommunityFormResponse(event);
});

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePanel(); });
document.addEventListener("pointerdown", () => {
  if (state.audio?.context?.state === "running") return;
  state.audio?.unlockNotifications().catch(() => {});
}, { passive: true });
$("#calm-toggle").addEventListener("click", toggleCalm);
$("#original-survey-link").href = config.survey.url.replace("?embedded=true", "");

let weatherSecretClicks = [];
$("#environment-status")?.addEventListener("click", () => {
  const now = Date.now();
  weatherSecretClicks = weatherSecretClicks.filter((time) => now - time < 4200);
  weatherSecretClicks.push(now);
  if (weatherSecretClicks.length < 5) return;
  weatherSecretClicks = [];
  state.ecosystem?.celebrate();
  state.audio?.playAnimal(state.environment?.season === "winter" ? "owl" : "bird");
  toast("You found the village hello! Every capybara is waving.");
});

(async function boot() {
  setAuthMode("register");
  await hydrateLocalMusic();
  applySettings();
  state.meetingRuntime = new VillageMeetingRuntime({
    api,
    getUser: () => state.user,
    canChatWrite: () => communityCanChatWrite(),
    getLanguage: () => state.settings.language || "en",
    toast,
    suspendVoiceControl: () => {
      const shouldResume = Boolean(state.settings.voiceControl);
      stopVoiceCommand();
      return shouldResume;
    },
    resumeVoiceControl: (shouldResume) => {
      if (shouldResume && state.settings.voiceControl) {
        setTimeout(() => startVoiceCommand({ continuous: true, announce: false }), 450);
      }
    },
    onClose: () => {}
  });
  state.documentRuntime = new VillageDocumentStudio({ api, getUser: () => state.user, canChatWrite: () => communityCanChatWrite(), toast, onClose: () => {} });
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {}
  routeForUser();
  const publicDocumentToken = new URLSearchParams(window.location.search).get("village-document");
  if (publicDocumentToken) state.documentRuntime.openPublic(publicDocumentToken).catch((error) => toast(error.message));
  refreshAnnouncementBadge();
})();
