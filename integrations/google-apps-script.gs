/**
 * Capy Village -> Google Sheets webhook.
 *
 * 1. Open the user-record spreadsheet.
 * 2. Extensions -> Apps Script, paste this file, and save.
 * 3. Deploy -> New deployment -> Web app.
 * 4. Execute as: Me. Who has access: Anyone (or your organization, if the app is internal).
 * 5. Copy the /exec URL into USER_SHEET_WEBHOOK_URL on the server.
 *
 * Security: this endpoint intentionally refuses to write passwords.
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");
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
    var userNameIndex = headers.indexOf("User name");
    var userIdIndex = headers.indexOf("userId");
    var existingRow = -1;

    if (sheet.getLastRow() > headerRow) {
      var identityColumn = userIdIndex >= 0 ? userIdIndex + 1 : userNameIndex + 1;
      if (identityColumn > 0) {
        var targetIdentity = userIdIndex >= 0 ? data.userId : data["User name"];
        var values = sheet.getRange(headerRow + 1, identityColumn, sheet.getLastRow() - headerRow, 1).getDisplayValues();
        for (var i = 0; i < values.length; i++) {
          if (String(values[i][0]) === String(targetIdentity)) {
            existingRow = headerRow + 1 + i;
            break;
          }
        }
      }
    }

    var row = headers.map(function(header) {
      if (String(header).toLowerCase() === "password") return "Not stored — secure hash only";
      return Object.prototype.hasOwnProperty.call(data, header) ? data[header] : "";
    });

    var targetRow = existingRow > 0 ? existingRow : Math.max(sheet.getLastRow() + 1, headerRow + 1);
    sheet.getRange(targetRow, 1, 1, row.length).setValues([row]);
    sheet.getRange(targetRow, 1, 1, row.length).setWrap(true).setVerticalAlignment("top");
    sheet.setRowHeight(targetRow, 72);
    for (var column = 1; column <= row.length; column++) {
      var header = String(headers[column - 1]).toLowerCase();
      var width = /history|survey|summary|personal record|feedback/.test(header) ? 280 : /user name|email/.test(header) ? 170 : 150;
      sheet.setColumnWidth(column, width);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, row: targetRow }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "capy-village-user-records" }))
    .setMimeType(ContentService.MimeType.JSON);
}
