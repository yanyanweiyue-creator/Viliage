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
