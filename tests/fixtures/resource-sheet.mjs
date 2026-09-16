// Mirrors the live sheet's headers, including its leading Resource ID and 15 tags.
export const resourceColumns = [
  "Resource ID", "URL", "Description", "Diagnosis", "Category", "Category2", "Age",
  ...Array.from({ length: 15 }, (_, index) => `Tag${index + 1}`),
  "Error1", "Location", "Location2", "Location3", "Location4", "Price"
];

export function resourceTable(columns = resourceColumns) {
  const records = [
    { "Resource ID": "R000070", URL: "https://example.com/tennis", Description: "Adaptive Tennis — tennis clinics for children with autism", Diagnosis: "Autism", Category: "Recreation", Age: "5–18", Tag1: "Adaptive Tennis", Tag6: "Social Skills Development", Tag10: "Tennis Instruction", Tag15: "Volunteer Coaching", Location: "Santa Clara, CA", Location2: "Palo Alto, CA", Price: "Scholarships available" },
    { "Resource ID": "R000064", URL: "https://example.com/sports", Description: "Inclusive Sports — tennis and swimming", Diagnosis: "Both", Category: "Recreation", Age: "All ages", Tag1: "Inclusive Sports", Tag15: "Tennis", Location: "Santa Clara County, CA", Price: "Free" },
    { "Resource ID": "wrong-category", URL: "https://example.com/education", Description: "Tennis teaching materials", Diagnosis: "Autism", Category: "Education", Tag15: "Tennis" },
    { "Resource ID": "wrong-diagnosis", URL: "https://example.com/adhd", Description: "Tennis clinics", Diagnosis: "ADHD", Category: "Recreation", Tag15: "Tennis" }
  ];
  return { cols: columns.map((label) => ({ label })), rows: records.map((record) => ({ c: columns.map((label) => ({ v: record[label] || "" })) })) };
}

export function scoringTable() {
  const columns = ["URL", "Description", "Diagnosis", "Category", "Age", "Tag1", "Error1"];
  const records = [
    ...[1, 2, 3].map((id) => [`https://example.com/tennis-${id}`, "Community tennis clinics", "Autism", "Recreation", "All ages", "", ""]),
    ["https://example.com/iep", "", "Autism", "Legal", "All ages", "IEP", ""],
    ["https://example.com/504", "", "Autism", "Legal", "All ages", "504", ""],
    ["https://example.com/wrong-island", "Community tennis clinics", "ADHD", "Recreation", "All ages", "Tennis", ""],
    ["https://example.com/wrong-building", "Community tennis clinics", "Autism", "Education", "All ages", "Tennis", ""],
    ["https://example.com/warning", "", "Autism", "Legal", "All ages", "IEP", "⚠️ Waitlist"]
  ];
  return { cols: columns.map((label) => ({ label })), rows: records.map((values) => ({ c: values.map((v) => ({ v })) })) };
}

export function researchFetch(url, options = {}) {
  if (String(url).includes("docs.google.com/spreadsheets")) {
    return new Response(`google.visualization.Query.setResponse(${JSON.stringify({ table: scoringTable() })});`);
  }
  if (String(url) === "https://api.openai.com/v1/responses") {
    const input = JSON.parse(options.body);
    if (input.text?.format?.name === "research_query_translation") return Response.json({ output_text: '{"searchText":"tennis"}' });
    return new Response("Summary unavailable", { status: 503 });
  }
  throw new Error(`Unexpected request: ${url}`);
}
