function cellValue(cell) {
  return String(cell?.f ?? cell?.v ?? "").trim();
}

function headerKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function deriveName(description, url) {
  const first = String(description || "").split(/[—–-]/)[0].trim();
  if (first.length > 3 && first.length < 90) return first;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Community resource"; }
}

export function normalizeSheetRows(table) {
  const columns = (table.cols || []).map((column, index) => ({ key: headerKey(column.label), index }));
  const hasHeaders = columns.some(({ key }) => key);
  const indexByName = new Map(columns.filter(({ key }) => key).map(({ key, index }) => [key, index]));
  const valueAt = (values, labels, legacyIndex = -1) => {
    for (const label of labels) {
      const index = indexByName.get(headerKey(label));
      if (index !== undefined && values[index]) return values[index];
    }
    // Positional fallback is only safe for the original, entirely unlabeled layout.
    return !hasHeaders ? values[legacyIndex] || "" : "";
  };
  const groupIndexes = (pattern) => columns.filter(({ key }) => pattern.test(key))
    .sort((a, b) => Number(a.key.match(/\d+$/)?.[0] || 0) - Number(b.key.match(/\d+$/)?.[0] || 0))
    .map(({ index }) => index);
  const categoryIndexes = groupIndexes(/^category\d*$/);
  const tagIndexes = groupIndexes(/^tags?\d*$/);
  const locationIndexes = groupIndexes(/^location\d*$/);
  const issueIndexes = groupIndexes(/^issues?\d*$/);
  const valuesAt = (values, indexes, legacyIndexes = []) =>
    (hasHeaders ? indexes : legacyIndexes).map((index) => values[index]).filter(Boolean);
  const splitList = (values) => [...new Set(values.flatMap((value) => value.split(/[,;/]/)).map((value) => value.trim()).filter(Boolean))];

  return (table.rows || []).map((row) => {
    const values = (row.c || []).map(cellValue);
    const url = valueAt(values, ["URL"], 0);
    const description = valueAt(values, ["Description"], 1);
    const age = valueAt(values, ["Age"], 5) || "All ages";
    const categories = splitList(valuesAt(values, categoryIndexes, [3, 4]));
    const tags = [...new Set(valuesAt(values, tagIndexes, [6, 7, 8, 9, 10]))];
    const locations = valuesAt(values, locationIndexes, [12, 13, 14, 15]);
    return {
      url,
      name: valueAt(values, ["Resource Name", "Name"]) || deriveName(description, url),
      description,
      diagnosis: valueAt(values, ["Diagnosis"], 2) || "Both",
      categories,
      age,
      ageRange: valueAt(values, ["Age Range"]) || age,
      lifeStage: valueAt(values, ["Life Stage"]),
      tags,
      issues: splitList(valuesAt(values, issueIndexes)),
      location: locations[0] || "See website",
      price: valueAt(values, ["Price"], 17) || "See website"
    };
  }).filter((row) => /^https?:\/\//.test(row.url));
}
