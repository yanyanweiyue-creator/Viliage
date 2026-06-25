/**
 * Capy Village -> Google Sheets webhook.
 *
 * 1. Open the user-record spreadsheet.
 * 2. Extensions -> Apps Script, paste this file, and save.
 * 3. Deploy -> New deployment -> Web app.
 * 4. Execute as: Me. Who has access: Anyone (or your organization, if the app is internal).
 * 5. Copy the /exec URL into USER_SHEET_WEBHOOK_URL on the server.
 * 6. Reuse the same /exec URL for ERROR_SHEET_WEBHOOK_URL when this project is
 *    attached to the spreadsheet that contains the Error database tab.
 *
 * Security: this endpoint intentionally refuses to write passwords.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");
    if (data.action === "send-password-reset") return sendPasswordResetCode_(data);
    if (data.action === "log-resource-error") return appendResourceError_(data);
    delete data.password;
    data["Password"] = "Not stored — secure hash only";

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    var lastColumn = Math.max(sheet.getLastColumn(), 1);
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

    // Support both a header in row 1 and the older sheet layout with a blank first row.
    if (!headers.some(String)) {
      headers = sheet.getRange(2, 1, 1, lastColumn).getDisplayValues()[0];
    }
    var headerRow = sheet.getRange(1, 1).getDisplayValue() ? 1 : 2;
    var normalizedHeaders = headers.map(function(header) { return String(header).trim().toLowerCase(); });
    var userIdIndex = normalizedHeaders.indexOf("userid");
    var emailIndex = normalizedHeaders.indexOf("email");
    var userNameIndex = normalizedHeaders.indexOf("user name");
    var existingRow = -1;

    if (sheet.getLastRow() > headerRow) {
      var identityColumn = userIdIndex >= 0 ? userIdIndex + 1 : emailIndex >= 0 ? emailIndex + 1 : userNameIndex + 1;
      if (identityColumn > 0) {
        var targetIdentity = userIdIndex >= 0 ? data.userId : emailIndex >= 0 ? data["Email"] : data["User name"];
        var values = sheet.getRange(headerRow + 1, identityColumn, sheet.getLastRow() - headerRow, 1).getDisplayValues();
        for (var i = 0; i < values.length; i++) {
          if (String(values[i][0]) === String(targetIdentity)) {
            existingRow = headerRow + 1 + i;
            break;
          }
        }
      }
    }

    var dataKeys = Object.keys(data);
    var writableKeys = dataKeys.filter(function(key) {
      return String(key).trim().toLowerCase() !== "userid";
    });
    var missingHeaders = writableKeys.filter(function(key) {
      return normalizedHeaders.indexOf(String(key).trim().toLowerCase()) < 0;
    });
    if (missingHeaders.length) {
      var startColumn = headers.length + 1;
      sheet.getRange(headerRow, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
      headers = headers.concat(missingHeaders);
      normalizedHeaders = headers.map(function(header) { return String(header).trim().toLowerCase(); });
    }
    var row = headers.map(function(header) {
      var normalizedHeader = String(header).trim().toLowerCase();
      if (normalizedHeader === "password") return "Not stored — secure hash only";
      var matchingKey = dataKeys.filter(function(key) { return String(key).trim().toLowerCase() === normalizedHeader; })[0];
      return matchingKey && Object.prototype.hasOwnProperty.call(data, matchingKey) ? data[matchingKey] : "";
    });

    var targetRow = existingRow > 0 ? existingRow : Math.max(sheet.getLastRow() + 1, headerRow + 1);
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(targetRow, 1, 1, row.length).setWrap(true).setVerticalAlignment("top");
    sheet.setRowHeight(targetRow, 72);
    for (var column = 1; column <= row.length; column++) {
      var header = String(headers[column - 1]).toLowerCase();
      var width = /history|survey|summary|personal record|feedback|like resource|save resource|dislike resource/.test(header) ? 280 : /user name|email/.test(header) ? 170 : 150;
      sheet.setColumnWidth(column, width);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
  var senderAddress = aliases.indexOf(requestedFrom) >= 0 ? requestedFrom : senderName;
  var subject = "Your It Takes a Village verification code";
  var plainText = "Your verification code is " + code + ". It expires in " + minutes + " minutes. If you did not request a password reset, you can ignore this email.";
  var html = '<div style="font-family:Arial,sans-serif;color:#243a35;max-width:520px;padding:24px">' +
    '<h2 style="margin:0 0 12px">It Takes a Village</h2>' +
    '<p>Use this verification code to reset your password:</p>' +
    '<p style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef5ef;padding:16px 20px;border-radius:12px;text-align:center">' + code + '</p>' +
    '<p>This code expires in ' + minutes + ' minutes. If you did not request it, you can safely ignore this email.</p>' +
    '<p style="font-size:12px;color:#6d7d78">Sent by ' + senderAddress + '</p></div>';
  var options = { htmlBody: html, name: senderName, replyTo: requestedFrom || senderAddress };
  if (aliases.indexOf(requestedFrom) >= 0) options.from = requestedFrom;
  GmailApp.sendEmail(email, subject, plainText + "\n\nSent by " + senderAddress, options);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, delivered: true, senderAddress: senderAddress }))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendResourceError_(data) {
  delete data.password;
  data["Helpful"] = "No";
  data.helpful = "No";

  var sheet = findTargetSheet_(data.sheetGid, data.spreadsheetId);
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
    sheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  }

  var dataKeys = Object.keys(data);
  var row = headers.map(function(header) {
    var normalizedHeader = normalizeHeader_(header);
    if (normalizedHeader === "helpful") return "No";
    var matchingKey = dataKeys.filter(function(key) {
      return normalizeHeader_(key) === normalizedHeader;
    })[0];
    return matchingKey && Object.prototype.hasOwnProperty.call(data, matchingKey) ? data[matchingKey] : "";
  });

  var targetRow = Math.max(sheet.getLastRow() + 1, headerRow + 1);
  sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
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

function findTargetSheet_(sheetGid, spreadsheetId) {
  var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(String(spreadsheetId).trim()) : SpreadsheetApp.getActiveSpreadsheet();
  var gid = String(sheetGid || "").trim();
  if (gid) {
    var sheets = spreadsheet.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (String(sheets[i].getSheetId()) === gid) return sheets[i];
    }
  }
  return spreadsheet.getSheets()[0];
}

function normalizeHeader_(value) {
  return String(value || "").trim().toLowerCase();
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "capy-village-user-records" }))
    .setMimeType(ContentService.MimeType.JSON);
}
