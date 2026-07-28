import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../integrations/google-apps-script.gs", import.meta.url), "utf8");

function mockSheet(gid, rows) {
  const state = rows.map((row) => [...row]);
  return {
    state,
    getSheetId() { return gid; },
    getLastColumn() { return state[0]?.length || 0; },
    getLastRow() { return state.length; },
    getMaxRows() { return Math.max(state.length, 100); },
    insertRowsAfter() {},
    setRowHeight() {},
    setColumnWidth() {},
    getRange(startRow, startColumn, rowCount = 1, columnCount = 1) {
      const read = () => Array.from({ length: rowCount }, (_, rowOffset) =>
        Array.from({ length: columnCount }, (_, columnOffset) =>
          state[startRow - 1 + rowOffset]?.[startColumn - 1 + columnOffset] ?? ""
        )
      );
      return {
        getDisplayValues: read,
        getValues: read,
        getDisplayValue() { return read()[0][0]; },
        setValues(values) {
          values.forEach((row, rowOffset) => {
            const targetRow = startRow - 1 + rowOffset;
            if (!state[targetRow]) state[targetRow] = [];
            row.forEach((value, columnOffset) => {
              state[targetRow][startColumn - 1 + columnOffset] = value;
            });
          });
          return this;
        },
        setNumberFormat() { return this; },
        setWrap() { return this; },
        setVerticalAlignment() { return this; }
      };
    }
  };
}

function appsScriptContext(spreadsheets) {
  const locks = { waited: 0, released: 0 };
  const context = {
    SpreadsheetApp: {
      openById(id) {
        if (!spreadsheets[id]) throw new Error(`Unknown spreadsheet ${id}`);
        return spreadsheets[id];
      }
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() { locks.waited += 1; },
          releaseLock() { locks.released += 1; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(value) {
        return {
          value,
          setMimeType() { return this; }
        };
      }
    }
  };
  vm.runInNewContext(source, context);
  return { context, locks };
}

test("Apps Script user upsert preserves headers and accepts a trailing-space survey header", () => {
  const headers = [
    "Unique User ID",
    "Email",
    "Username",
    "Password",
    "Summary of Survey Response",
    "Survey Response (Unedited) ",
    "Summary of Search History",
    "Save Resource",
    "Dislike Resource"
  ];
  const sheet = mockSheet(697062702, [
    headers,
    ["", "person@example.com", "Old name", "old", "", "{}", "[]", "[]", "[]"]
  ]);
  const { context, locks } = appsScriptContext({
    "sheet-id": { getSheets() { return [sheet]; } }
  });

  const result = JSON.parse(context.upsertUser_({
    spreadsheetId: "sheet-id",
    sheetGid: "697062702",
    "Unique User ID": "user-123",
    "Email": "PERSON@example.com",
    "Username": "New name",
    "Password": "must not be written",
    "Summary of Survey Response": "Survey summary",
    "Survey Response (Unedited)": "{\"interest\":\"Autism\"}",
    "Summary of Search History": "[{\"topic\":\"Education\"}]",
    "Save Resource": "[{\"name\":\"Saved\"}]",
    "Dislike Resource": "[]"
  }).value);

  assert.equal(result.row, 2);
  assert.deepEqual(sheet.state[0], headers);
  assert.equal(sheet.state.length, 2);
  assert.deepEqual(sheet.state[1], [
    "user-123",
    "PERSON@example.com",
    "New name",
    "Not stored — secure hash only",
    "Survey summary",
    "{\"interest\":\"Autism\"}",
    "[{\"topic\":\"Education\"}]",
    "[{\"name\":\"Saved\"}]",
    "[]"
  ]);
  assert.deepEqual(locks, { waited: 1, released: 1 });
  assert.throws(() => context.findTargetSheet_("999", "sheet-id"), /was not found/);
});

test("Apps Script feedback aliases populate the current A:G headers without changing them", () => {
  const headers = [
    "Time Stamp",
    "Unique User ID (N/A if guest)) ",
    "Email (N/A if guest)",
    "Username (if applicable)",
    "Feedback",
    "Star(1-5)",
    "Helpful / Nonhelpful"
  ];
  const sheet = mockSheet(981733839, [headers]);
  const { context, locks } = appsScriptContext({
    "sheet-id": { getSheets() { return [sheet]; } }
  });

  context.appendFeedback_({
    spreadsheetId: "sheet-id",
    sheetGid: "981733839",
    "Time Stamp": "2026-07-28T12:00:00.000Z",
    "Unique User ID (if applicable)": "user-456",
    "Email (if applicable)": "person@example.com",
    "Username (if applicable)": "Village User",
    Feedback: "Too broad",
    "Star(1-5)": 2,
    "Helpful / Nonhelpful": "Nonhelpful"
  });

  assert.deepEqual(sheet.state[0], headers);
  assert.deepEqual(sheet.state[1], [
    "2026-07-28T12:00:00.000Z",
    "user-456",
    "person@example.com",
    "Village User",
    "Nonhelpful: Too broad",
    2,
    "Nonhelpful"
  ]);
  assert.deepEqual(locks, { waited: 1, released: 1 });
});
