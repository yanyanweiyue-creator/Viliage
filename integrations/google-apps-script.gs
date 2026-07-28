/**
 * Capy Village -> Google Sheets webhook.
 *
 * 1. Open the user-record spreadsheet.
 * 2. Extensions -> Apps Script, paste this file, and save.
 * 3. Deploy -> New deployment -> Web app.
 * 4. Execute as: Me. Who has access: Anyone (or your organization, if the app is internal).
 * 5. Add a long random WEBHOOK_SECRET in Project Settings -> Script properties.
 * 6. Set the same value as server-only SHEET_WEBHOOK_SECRET.
 * 7. Copy the /exec URL into USER_SHEET_WEBHOOK_URL on the server.
 * 8. Reuse the same /exec URL for ERROR_SHEET_WEBHOOK_URL when this project is
 *    attached to the spreadsheet that contains the Error database tab.
 * 9. Reuse it for FEEDBACK_SHEET_WEBHOOK_URL and USER_COUNT_SHEET_WEBHOOK_URL.
 *
 * Security: this endpoint intentionally refuses to write passwords.
 */

var USER_DATA_HEADERS_ = [
  "Unique User ID",
  "Email",
  "Username",
  "Password",
  "Summary of Survey Response",
  "Survey Response (Unedited)",
  "Summary of Search History",
  "Save Resource",
  "Dislike Resource"
];

var DATABASE_SPREADSHEET_ID_ = "1e2424AmLESZRYQKy7g3Lhcx0LtTDtYRXH2_m03lVIA0";
var USER_DATA_SHEET_GID_ = "697062702";
var ERROR_SHEET_GID_ = "1952899933";
var USER_COUNT_SHEET_GID_ = "1958570867";
var FEEDBACK_SHEET_GID_ = "981733839";
var MAX_SHEET_TEXT_LENGTH_ = 45000;

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");
    authenticateWebhook_(data);
    if (data.action === "send-password-reset") return sendPasswordResetCode_(data);
    if (data.action === "log-resource-error") return appendResourceError_(data);
    if (data.action === "record-feedback") return appendFeedback_(data);
    if (data.action === "record-user-count") return updateUserCount_(data);
    if (data.action === "upsert-user") return upsertUser_(data);
    throw new Error("Unsupported action.");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function authenticateWebhook_(data) {
  var expected = String(PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET") || "");
  var provided = String(data.webhookSecret || "");
  if (!expected) throw new Error("WEBHOOK_SECRET is not configured.");
  if (!provided || !constantTimeStringEqual_(expected, provided)) {
    throw new Error("Webhook authentication failed.");
  }
  delete data.webhookSecret;
}

function constantTimeStringEqual_(left, right) {
  left = String(left || "");
  right = String(right || "");
  var difference = left.length ^ right.length;
  var length = Math.max(left.length, right.length);
  for (var i = 0; i < length; i++) {
    difference |= (left.charCodeAt(i % Math.max(left.length, 1)) || 0)
      ^ (right.charCodeAt(i % Math.max(right.length, 1)) || 0);
  }
  return difference === 0;
}

function upsertUser_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = findTargetSheet_(data.sheetGid, data.spreadsheetId, USER_DATA_SHEET_GID_);
    var lastColumn = sheet.getLastColumn();
    if (lastColumn < 1) throw new Error("User Data sheet needs row-1 headers.");

    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    if (!headers.some(String)) throw new Error("User Data sheet needs row-1 headers.");
    var normalizedHeaders = headers.map(normalizeHeader_);
    var missingHeaders = USER_DATA_HEADERS_.filter(function(header) {
      return normalizedHeaders.indexOf(normalizeHeader_(header)) < 0;
    });
    if (missingHeaders.length) {
      throw new Error("User Data sheet is missing required row-1 headers: " + missingHeaders.join(", "));
    }

    var userId = String(data["Unique User ID"] || "").trim();
    var email = String(data["Email"] || "").trim().toLowerCase();
    if (!userId && !email) throw new Error("Unique User ID or Email is required.");

    var userIdIndex = normalizedHeaders.indexOf(normalizeHeader_("Unique User ID"));
    var emailIndex = normalizedHeaders.indexOf(normalizeHeader_("Email"));
    var existingRow = -1;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var identityRows = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
      if (userId) {
        for (var i = 0; i < identityRows.length; i++) {
          if (String(identityRows[i][userIdIndex] || "").trim() === userId) {
            existingRow = i + 2;
            break;
          }
        }
      }
      if (existingRow < 0 && email) {
        for (var j = 0; j < identityRows.length; j++) {
          if (String(identityRows[j][emailIndex] || "").trim().toLowerCase() === email) {
            existingRow = j + 2;
            break;
          }
        }
      }
    }

    var targetRow = existingRow > 0 ? existingRow : Math.max(lastRow + 1, 2);
    var row = existingRow > 0
      ? sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0]
      : headers.map(function() { return ""; });
    var userData = {};
    USER_DATA_HEADERS_.forEach(function(header) {
      userData[normalizeHeader_(header)] = header === "Password"
        ? "Not stored — secure hash only"
        : data[header];
    });
    normalizedHeaders.forEach(function(header, index) {
      if (Object.prototype.hasOwnProperty.call(userData, header)) {
        row[index] = userData[header] === undefined || userData[header] === null ? "" : userData[header];
      }
    });

    sheet.getRange(targetRow, 1, 1, row.length).setValues([safeSheetRow_(row)]);
    sheet.getRange(targetRow, 1, 1, row.length).setWrap(true).setVerticalAlignment("top");
    sheet.setRowHeight(targetRow, 72);
    for (var column = 1; column <= row.length; column++) {
      var header = normalizedHeaders[column - 1];
      var width = /history|survey|summary|resource/.test(header) ? 280 : /unique user id|username|email/.test(header) ? 170 : 150;
      sheet.setColumnWidth(column, width);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function updateUserCount_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = findTargetSheet_(data.sheetGid, data.spreadsheetId, USER_COUNT_SHEET_GID_);
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    if (!headers.some(String)) throw new Error("User Count sheet needs row-1 headers.");

    var metrics = data.metrics || {};
    var metricKeys = Object.keys(metrics);
    var targetRow = 2;
    if (targetRow > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), targetRow - sheet.getMaxRows());

    var row = headers.map(function(header) {
      var normalizedHeader = normalizeHeader_(header);
      if (!normalizedHeader) return "";
      var matchingKey = metricKeys.filter(function(metricKey) {
        return normalizeHeader_(metricKey) === normalizedHeader;
      })[0];
      if (!matchingKey) return "";
      var value = Number(metrics[matchingKey] || 0);
      return isFinite(value) ? value : 0;
    });
    sheet.getRange(targetRow, 1, 1, row.length).setValues([safeSheetRow_(row)]).setNumberFormat("0.##");
    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function appendFeedback_(data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = findTargetSheet_(data.sheetGid, data.spreadsheetId, FEEDBACK_SHEET_GID_);
    var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getDisplayValues()[0];
    if (!headers.some(String)) throw new Error("Feedback sheet needs row-1 headers.");

    var dataKeys = Object.keys(data);
    var row = headers.map(function(header) {
      var normalizedHeader = feedbackHeaderKey_(header);
      var matchingKey = dataKeys.filter(function(key) {
        return feedbackHeaderKey_(key) === normalizedHeader;
      })[0];
      if (normalizedHeader === "feedback") {
        var status = String(data["Helpful / Nonhelpful"] || "").trim();
        var details = matchingKey && Object.prototype.hasOwnProperty.call(data, matchingKey)
          ? String(data[matchingKey] || "").trim()
          : "";
        return status && details ? status + ": " + details : status || details;
      }
      return matchingKey && Object.prototype.hasOwnProperty.call(data, matchingKey) ? data[matchingKey] : "";
    });

    var targetRow = Math.max(sheet.getLastRow() + 1, 2);
    sheet.getRange(targetRow, 1, 1, row.length).setValues([safeSheetRow_(row)]);
    sheet.getRange(targetRow, 1, 1, row.length).setWrap(true).setVerticalAlignment("top");
    sheet.setRowHeight(targetRow, 72);
    for (var column = 1; column <= row.length; column++) {
      var normalizedHeader = normalizeHeader_(headers[column - 1]);
      var width = /feedback/.test(normalizedHeader) ? 320 : /email|username|user name/.test(normalizedHeader) ? 180 : 150;
      sheet.setColumnWidth(column, width);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function feedbackHeaderKey_(value) {
  var header = normalizeHeader_(value).replace(/\s+/g, " ");
  if (/^unique user id \((?:if applicable|n\/a if guest)\)\)?$/.test(header)) return "feedback-user-id";
  if (/^email \((?:if applicable|n\/a if guest)\)\)?$/.test(header)) return "feedback-email";
  if (/^(?:username|user name) \((?:if applicable|n\/a if guest)\)\)?$/.test(header)) return "feedback-username";
  return header;
}

function sendPasswordResetCode_(data) {
  var email = String(data.email || "").trim().toLowerCase();
  var code = String(data.code || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code)) {
    throw new Error("Invalid password-reset email or code.");
  }
  var minutes = Math.max(1, Math.min(30, Number(data.expiresInMinutes || 10)));
  var requestedFrom = String(data.fromAddress || "").trim().toLowerCase();
  var senderName = String(data.fromName || "It Takes a Village").trim() || "It Takes a Village";
  var aliases = GmailApp.getAliases().map(function(alias) { return String(alias).toLowerCase(); });
  var canUseRequestedFrom = requestedFrom && aliases.indexOf(requestedFrom) >= 0;
  var accountEmail = "";
  try { accountEmail = Session.getEffectiveUser().getEmail(); } catch (error) {}
  var senderAddress = canUseRequestedFrom ? requestedFrom : (accountEmail || "the It Takes a Village Gmail account");
  var subject = "Your It Takes a Village verification code";
  var plainText = "Your verification code is " + code + ". It expires in " + minutes + " minutes. If you did not request a password reset, you can ignore this email.";
  var html = '<div style="font-family:Arial,sans-serif;color:#243a35;max-width:520px;padding:24px">' +
    '<h2 style="margin:0 0 12px">It Takes a Village</h2>' +
    '<p>Use this verification code to reset your password:</p>' +
    '<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef5ef;padding:16px 20px;border-radius:12px;text-align:center">' + code + '</p>' +
    '<p>This code expires in ' + minutes + ' minutes. If you did not request it, you can safely ignore this email.</p>' +
    '<p style="font-size:12px;color:#6d7d78">Sent by ' + senderAddress + '</p></div>';
  var options = { htmlBody: html, name: senderName };
  if (canUseRequestedFrom) {
    options.from = requestedFrom;
    options.replyTo = requestedFrom;
  }
  GmailApp.sendEmail(email, subject, plainText + "\n\nSent by " + senderAddress, options);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, delivered: true, senderAddress: senderAddress }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendResourceError_(data) {
  delete data.password;
  data["Helpful?"] = "No";
  data["Helpful"] = "No";
  data.helpful = "No";

  var sheet = findTargetSheet_(data.sheetGid, data.spreadsheetId, ERROR_SHEET_GID_);
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var headerRow = 1;

  if (!headers.some(String) && sheet.getLastRow() >= 2) {
    headerRow = 2;
    headers = sheet.getRange(2, 1, 1, lastColumn).getDisplayValues()[0];
  }
  if (!headers.some(String)) {
    headers = Object.keys(data).filter(function(key) {
      return ["action", "sheetGid", "password"].indexOf(String(key)) < 0;
    });
    sheet.getRange(headerRow, 1, 1, headers.length).setValues([safeSheetRow_(headers)]);
  }

  var dataKeys = Object.keys(data);
  var row = headers.map(function(header) {
    var normalizedHeader = normalizeHeader_(header);
    if (normalizedHeader === "helpful" || normalizedHeader === "helpful?") return "No";
    var matchingKey = dataKeys.filter(function(key) {
      return normalizeHeader_(key) === normalizedHeader;
    })[0];
    return matchingKey && Object.prototype.hasOwnProperty.call(data, matchingKey) ? data[matchingKey] : "";
  });

  var targetRow = Math.max(sheet.getLastRow() + 1, headerRow + 1);
  sheet.getRange(targetRow, 1, 1, row.length).setValues([safeSheetRow_(row)]);
  sheet.getRange(targetRow, 1, 1, row.length).setWrap(true).setVerticalAlignment("top");
  sheet.setRowHeight(targetRow, 72);
  for (var column = 1; column <= row.length; column++) {
    var header = normalizeHeader_(headers[column - 1]);
    var width = /reason|description|resource|search/.test(header) ? 280 : /email|user name/.test(header) ? 170 : 150;
    sheet.setColumnWidth(column, width);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
    .setMimeType(ContentService.MimeType.JSON);
}

function findTargetSheet_(sheetGid, spreadsheetId, expectedGid) {
  var id = String(spreadsheetId || "").trim();
  var gid = String(sheetGid || "").trim();
  if (!id) throw new Error("spreadsheetId is required.");
  if (!gid) throw new Error("sheetGid is required.");
  if (id !== DATABASE_SPREADSHEET_ID_) {
    throw new Error("This webhook only writes to the configured database spreadsheet.");
  }
  if (String(expectedGid || "").trim() !== gid) {
    throw new Error("This action cannot write to sheet gid " + gid + ".");
  }
  var spreadsheet = SpreadsheetApp.openById(id);
  var sheets = spreadsheet.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (String(sheets[i].getSheetId()) === gid) return sheets[i];
  }
  throw new Error("Sheet gid " + gid + " was not found in spreadsheet " + id + ".");
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase();
}

function safeSheetRow_(row) {
  return row.map(safeSheetCellValue_);
}

function safeSheetCellValue_(value) {
  if (typeof value !== "string") return value;
  var safeText = /^[\t\r\n ]*[=+\-@]/.test(value) ? "'" + value : value;
  return safeText.slice(0, MAX_SHEET_TEXT_LENGTH_);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "capy-village-user-records" }))
    .setMimeType(ContentService.MimeType.JSON);
}
