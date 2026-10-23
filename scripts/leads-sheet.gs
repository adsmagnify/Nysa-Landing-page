var HEADERS = ['Submitted at', 'Name', 'Phone', 'Course', 'Campus', 'Qualification', 'Who decides', 'Best time for a call', 'Landing page', 'Referrer', 'Source', 'Medium', 'Campaign'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SECRET');
    if (!secret || data.secret !== secret) {
      return json({ ok: false });
    }
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    } else {
      var current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
      var mismatch = false;
      for (var i = 0; i < HEADERS.length; i++) {
        if (current[i] !== HEADERS[i]) mismatch = true;
      }
      if (mismatch) {
        if (current[0] !== HEADERS[0]) sheet.insertRowBefore(1);
        if (current[5] === 'Landing page') sheet.insertColumnsBefore(6, 3);
        sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
        sheet.setFrozenRows(1);
      }
    }
    var row = sheet.getLastRow() + 1;
    sheet.getRange(row, 3).setNumberFormat('@');
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      data.submitted_at || '',
      data.name || '',
      data.phone || '',
      data.course || '',
      data.campus || '',
      data.qualification || '',
      data.decision || '',
      data.call_time || '',
      data.page || '',
      data.referrer || '',
      data.utm_source || '',
      data.utm_medium || '',
      data.utm_campaign || ''
    ]]);
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
