// This is the main non-code editing surface for the project.
// Replace URLs, text, image paths, and building coordinates here.
window.CAPY_CONFIG = {
  brand: {
    name: "Capy Village",
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
    { date: "Jul 27", title: "Volunteer orientation", meta: "Online · 45 minutes", description: "Learn how to support future Capy Village events and resource reviews." },
    { date: "Aug 09", title: "IEP preparation workshop", meta: "San Jose · Free", description: "Bring your questions and leave with a one-page meeting plan." }
  ],
  buildings: [
    { id: "autism-support", island: "autism", type: "support", label: "Support & Contact", short: "Support", icon: "❤", x: 17, y: 42 },
    { id: "autism-settings", island: "autism", type: "settings", label: "Settings Studio", short: "Settings", icon: "Aa", x: 29, y: 25 },
    { id: "autism-education", island: "autism", type: "ai", topic: "Education", label: "Education Exchange", short: "Education", icon: "✦", x: 39, y: 43 },
    { id: "autism-legal", island: "autism", type: "ai", topic: "Legal", label: "Rights & Advocacy", short: "Legal", icon: "§", x: 18, y: 64 },
    { id: "autism-activity", island: "autism", type: "activity", label: "Volunteer & Activity", short: "Activities", icon: "☀", x: 33, y: 63 },
    { id: "adhd-support", island: "adhd", type: "support", label: "Support & Contact", short: "Support", icon: "❤", x: 65, y: 27 },
    { id: "adhd-settings", island: "adhd", type: "settings", label: "Settings Studio", short: "Settings", icon: "Aa", x: 80, y: 39 },
    { id: "adhd-education", island: "adhd", type: "ai", topic: "Education", label: "Education Exchange", short: "Education", icon: "✦", x: 65, y: 53 },
    { id: "adhd-legal", island: "adhd", type: "ai", topic: "Legal", label: "Rights & Advocacy", short: "Legal", icon: "§", x: 80, y: 61 },
    { id: "adhd-activity", island: "adhd", type: "activity", label: "Volunteer & Activity", short: "Activities", icon: "☀", x: 71, y: 71 }
  ]
};
