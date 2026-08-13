import test from "node:test";
import assert from "node:assert/strict";
import { buildReachPlan, createStoredDocument, generateAboutMe, PERSONAL_RECORD_IMPORTS_ENABLED, personalRecordSignals, sanitizeJourney, scanPersonalRecordDocument, updateStoredDocument, validateJourney, validateRecordDocumentInput } from "../personal-record.mjs";

const journey = {
  pathway: "young-person",
  strengths: ["Creative", "Persistent"],
  goal: "Feeling more confident at school",
  helps: {
    learnBetterWhen: "instructions are clear",
    overwhelmedWhen: "there is too much information",
    helpsMe: "a short break",
    wishPeopleUnderstood: "I need time to process"
  }
};

const resource = (name, category, tags) => ({
  name,
  url: `https://example.com/${name.toLowerCase().replace(/\s+/g, "-")}`,
  diagnosis: "Both",
  categories: [category],
  tags,
  description: `${tags.join(" ")} support for students and families`,
  age: "All ages",
  issues: [],
  price: "Accepts Medicaid"
});

test("journey validation and About Me generation stay strengths-based", () => {
  const sanitized = validateJourney(sanitizeJourney(journey));
  const aboutMe = generateAboutMe(sanitized);
  assert.match(aboutMe, /^I’m creative and persistent\./);
  assert.match(aboutMe, /clear instructions|instructions are clear/i);
  assert.match(aboutMe, /working toward feeling more confident at school/i);
  assert.throws(() => validateJourney(sanitizeJourney({ pathway: "young-person" })), /strength/i);
});

test("REACH Plan always returns one Learn, Advocate, and Connect step", () => {
  const profile = { responses: { age: "13-18" }, journey: { ...journey, aboutMe: generateAboutMe(journey) }, documents: [] };
  const plan = buildReachPlan([
    resource("Learning supports", "Education", ["learning", "school", "strategies"]),
    resource("Student rights", "Legal", ["advocacy", "rights", "accommodations"]),
    resource("Peer activities", "Recreation", ["community", "peer", "activities"])
  ], profile);
  assert.deepEqual(plan.steps.map((step) => step.type), ["Learn", "Advocate", "Connect"]);
  assert.equal(plan.steps.length, 3);
  assert.ok(plan.steps.every((step) => step.resource?.url.startsWith("https://")));
});

test("document-derived facts stay out of matching while imports are suspended", () => {
  const document = createStoredDocument({
    id: "doc-1",
    file: { name: "record.pdf", mime: "application/pdf", size: 200, kind: "diagnosis" },
    extracted: { diagnoses: [{ name: "Autism", status: "confirmed" }], insurance: { provider: "Medi-Cal", planType: "Medicaid" }, accommodations: ["Extra processing time"] }
  });
  assert.deepEqual(personalRecordSignals({ documents: [document] }).confirmedDiagnoses, []);
  const reviewed = updateStoredDocument(document, { reviewed: true });
  const signals = personalRecordSignals({ documents: [reviewed] });
  assert.equal(PERSONAL_RECORD_IMPORTS_ENABLED, false);
  assert.deepEqual(signals, { diagnosisNames: [], confirmedDiagnoses: [], insuranceKeywords: [], supportKeywords: [] });
});

test("document scan sends ephemeral image input and strips direct identifiers from stored fields", async () => {
  const dataUrl = `data:image/png;base64,${Buffer.from("not-a-real-image").toString("base64")}`;
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
      documentType: "insurance",
      summary: "An active Medicaid managed-care plan.",
      diagnoses: [],
      insurance: { provider: "Example Health", planName: "Community Plan", planType: "Medicaid", networkType: "HMO", coveragePrograms: ["Behavioral health"], effectiveDate: "2026-01-01", expirationDate: "" },
      accommodations: [],
      supportNeeds: [],
      confidence: "high",
      warnings: []
    }) }] }] });
  };
  const result = await scanPersonalRecordDocument({ apiKey: "test-key", model: "test-model", input: { name: "card.png", mime: "image/png", size: 16, kind: "insurance", dataUrl }, fetchImpl });
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.input[0].content[1].type, "input_image");
  assert.match(requestBody.instructions, /Do not return names, birth dates, addresses, member IDs/);
  assert.equal(result.extracted.insurance.provider, "Example Health");
  const stored = createStoredDocument({ id: "doc-2", file: result.file, extracted: result.extracted });
  assert.equal("dataUrl" in stored, false);
  assert.equal(JSON.stringify(stored).includes("not-a-real-image"), false);
});

test("document validation enforces supported type and size", () => {
  const dataUrl = `data:application/pdf;base64,${Buffer.from("pdf").toString("base64")}`;
  assert.equal(validateRecordDocumentInput({ name: "assessment.pdf", mime: "application/pdf", size: 3, dataUrl }).mime, "application/pdf");
  assert.throws(() => validateRecordDocumentInput({ name: "script.exe", mime: "application/octet-stream", size: 3, dataUrl: "data:application/octet-stream;base64,AAAA" }), /JPG/);
});
