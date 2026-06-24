// This is the main non-code editing surface for the project.
// Replace URLs, text, image paths, and building coordinates here.
window.CAPY_CONFIG = {
  brand: {
    name: "It Takes a Village",
    eyebrow: "Your caregiver village",
    tagline: "A calmer way to find the next useful step."
  },
  survey: {
    title: "Community Compass",
    url: "https://docs.google.com/forms/d/e/1FAIpQLSeV0rk3KrwYr7deym26eDH92z6VCzJkXcoPVFYz7R8y1d_D3g/viewform?embedded=true",
    sourceLabel: "Open the original Google Form"
  },
  map: {
    image: "/assets/islands-placeholder.png",
    replacementNote: "Replace the image above with your own exported island art. Keep the same aspect ratio, then update building x/y percentages below."
  },
  support: {
    intro: "You do not have to figure everything out alone. Choose the kind of support that feels manageable today.",
    contacts: [
      { title: "Immediate danger", detail: "Call 911 or your local emergency service.", href: "tel:911", action: "Call 911" },
      { title: "988 Lifeline", detail: "24/7 call, text, or chat support in the United States.", href: "https://988lifeline.org", action: "Open 988" },
      { title: "Project team", detail: "Replace this card with your own email, hours, and contact process.", href: "mailto:hello@example.org", action: "Email us" }
    ],
    options: [
      "Make a short list of questions before calling a provider.",
      "Ask for written next steps or accommodations.",
      "Invite a trusted person to join an appointment."
    ]
  },
  activities: [
    { date: "Jul 12", title: "Quiet family picnic", meta: "Palo Alto · Low-stimulation area available", description: "A relaxed community meet-up with optional activities and a calm corner." },
    { date: "Jul 27", title: "Volunteer orientation", meta: "Online · 45 minutes", description: "Learn how to support future It Takes a Village events and resource reviews." },
    { date: "Aug 09", title: "IEP preparation workshop", meta: "San Jose · Free", description: "Bring your questions and leave with a one-page meeting plan." }
  ],
  ecosystem: {
    // Every land route is deliberately drawn over one island. When the map art
    // changes, adjust only these percentages; the movement engine stays intact.
    routes: {
      autismMeadow: [
        { x: 11, y: 55 }, { x: 15, y: 66 }, { x: 22, y: 72 }, { x: 30, y: 66 },
        { x: 37, y: 55 }, { x: 35, y: 43 }, { x: 28, y: 34 }, { x: 19, y: 39 }
      ],
      adhdMeadow: [
        { x: 60, y: 43 }, { x: 66, y: 34 }, { x: 75, y: 34 }, { x: 84, y: 42 },
        { x: 89, y: 56 }, { x: 83, y: 68 }, { x: 73, y: 69 }, { x: 64, y: 59 }
      ],
      villagePath: [
        { x: 17, y: 44, building: "autism-support" }, { x: 29, y: 27 },
        { x: 39, y: 45, building: "autism-education" }, { x: 29, y: 50, building: "autism-recreation" }, { x: 34, y: 64, building: "autism-activity" },
        { x: 20, y: 65, building: "autism-legal" }, { x: 39, y: 55 }, { x: 45, y: 53 },
        { x: 50, y: 54, bridge: true }, { x: 55, y: 53 }, { x: 61, y: 55 },
        { x: 66, y: 54, building: "adhd-education" }, { x: 72, y: 43, building: "adhd-recreation" }, { x: 72, y: 70, building: "adhd-activity" },
        { x: 81, y: 62, building: "adhd-legal" }, { x: 81, y: 41 },
        { x: 66, y: 29, building: "adhd-support" }
      ],
      skyLoop: [
        { x: 6, y: 24 }, { x: 25, y: 15 }, { x: 47, y: 22 }, { x: 70, y: 12 }, { x: 94, y: 25 }
      ]
    },
    animals: [
      { id: "moon-bunny", species: "rabbit", label: "Moon bunny", island: "autism", route: "autismMeadow", start: 0 },
      { id: "quiet-deer", species: "deer", label: "Quiet deer", island: "autism", route: "autismMeadow", start: 5 },
      { id: "woolly-sheep", species: "sheep", label: "Woolly sheep", island: "autism", route: "autismMeadow", start: 2, livestock: true, grazePoint: 3, waterPoint: 4 },
      { id: "trail-fox", species: "fox", label: "Trail fox", island: "adhd", route: "adhdMeadow", start: 2 },
      { id: "meadow-cow", species: "cow", label: "Meadow cow", island: "adhd", route: "adhdMeadow", start: 6, livestock: true, grazePoint: 7, waterPoint: 5 },
      { id: "village-gull", species: "gull", label: "Village gull", island: "sky", route: "skyLoop", start: 1, flying: true },
      { id: "songbird", species: "bird", label: "Songbird", island: "sky", route: "skyLoop", start: 3, flying: true },
      { id: "walker-one", species: "villager", label: "Village visitor", artVariant: 0, island: "village", route: "villagePath", start: 0, villager: true, home: 0 },
      { id: "walker-two", species: "villager", label: "Village visitor", artVariant: 1, island: "village", route: "villagePath", start: 8, villager: true, home: 11 },
      { id: "walker-three", species: "villager", label: "Village visitor", artVariant: 2, island: "village", route: "villagePath", start: 15, villager: true, home: 16 }
    ],
    events: {
      dragon: { label: "Azure dawn dragon", probability: 0.12, dawnBeforeMinutes: 20, dawnAfterMinutes: 40 },
      sunsetFlock: { count: 9, beforeMinutes: 8, afterMinutes: 6 }
    },
    timings: { grazeEveryMinutes: 5, drinkEveryMinutes: 10 },
    audio: {
      // Add owned/licensed day and night OGG/MP3 files here later. Empty values
      // use the built-in gentle procedural score instead of failing silently.
      music: { day: "", night: "" },
      proceduralMusic: {
        day: { title: "Garden Footsteps", tempo: 82, mood: "bright pentatonic, soft wooden pulse" },
        night: { title: "Starlit Current", tempo: 56, mood: "slow airy bells, water-like ambient pad" }
      },
      samples: {
        bird: { src: "/audio/sfx/morning-birds.mp3", volume: 0.1, maximumDuration: 3.2 },
        cow: { src: "/audio/sfx/cow.ogg", volume: 0.48 },
        sheep: { src: "/audio/sfx/sheep.ogg", volume: 0.42 },
        deer: { src: "/audio/sfx/deer.ogg", volume: 0.3 }
      },
      ambience: {
        summerInsects: { src: "/audio/ambience/summer-insects.mp3", volume: 0.12, seasons: ["summer"], startMinute: 600, endMinute: 960 },
        sunriseFarm: { src: "/audio/ambience/sunrise-farm.mp3", volume: 0.16, sunriseOffsetStart: -15, sunriseOffsetEnd: 45 }
      },
      replacementNote: "Replace files or URLs in this manifest without changing the audio engine. See AUDIO_CREDITS.md."
    }
  },
  buildings: [
    { id: "autism-support", island: "autism", type: "support", label: "Support & Contact", short: "Support", icon: "❤", x: 17, y: 42, x3d: 18, y3d: 46 },
    { id: "autism-education", island: "autism", type: "ai", topic: "Education", label: "Education Exchange", short: "Education", icon: "✦", x: 39, y: 43, x3d: 39, y3d: 48 },
    { id: "autism-recreation", island: "autism", type: "ai", topic: "Recreation", label: "Recreation Grove", short: "Recreation", icon: "◇", x: 29, y: 50, x3d: 30, y3d: 55 },
    { id: "autism-legal", island: "autism", type: "ai", topic: "Legal", label: "Rights & Advocacy", short: "Legal", icon: "§", x: 18, y: 64, x3d: 18, y3d: 66 },
    { id: "autism-activity", island: "autism", type: "activity", label: "Volunteer & Activity", short: "Activities", icon: "☀", x: 33, y: 63, x3d: 34, y3d: 68 },
    { id: "adhd-support", island: "adhd", type: "support", label: "Support & Contact", short: "Support", icon: "❤", x: 65, y: 27, x3d: 66, y3d: 42 },
    { id: "adhd-education", island: "adhd", type: "ai", topic: "Education", label: "Education Exchange", short: "Education", icon: "✦", x: 65, y: 53, x3d: 66, y3d: 57 },
    { id: "adhd-recreation", island: "adhd", type: "ai", topic: "Recreation", label: "Recreation Grove", short: "Recreation", icon: "◇", x: 72, y: 43, x3d: 74, y3d: 48 },
    { id: "adhd-legal", island: "adhd", type: "ai", topic: "Legal", label: "Rights & Advocacy", short: "Legal", icon: "§", x: 80, y: 61, x3d: 82, y3d: 64 },
    { id: "adhd-activity", island: "adhd", type: "activity", label: "Volunteer & Activity", short: "Activities", icon: "☀", x: 71, y: 71, x3d: 74, y3d: 72 }
  ]
};
