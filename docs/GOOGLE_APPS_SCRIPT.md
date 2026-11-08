# 🚀 Google Apps Script Webhook Integration for Toolbox

This guide provides the complete Google Apps Script code to automatically sync job listings from your Google Sheet to your live **Toolbox** application hosted on Fermyon Cloud.

---

## 📌 Webhook Configuration

| Parameter | Value |
| :--- | :--- |
| **Endpoint URL** | `https://<YOUR_APP>.fermyon.app/api/webhook` |
| **HTTP Method** | `POST` |
| **Content-Type** | `application/json` |
| **Authorization** | `Bearer YOUR_WEBHOOK_SECRET_HERE` |

---

## 📊 Expected Google Sheet Column Order

By default, the script reads columns **A through J** (columns 0 through 9):

| Col Index | Column Header | Example Value |
| :---: | :--- | :--- |
| **A** (0) | `slNo` | `1` or `SL-101` |
| **B** (1) | `jobTitle` | `Senior Rust Engineer` |
| **C** (2) | `company` | `Fermyon Technologies` |
| **D** (3) | `salaryPackage` | `$130k - $160k` or `₹25 - 35 LPA` |
| **E** (4) | `location` | `Remote / Bengaluru` |
| **F** (5) | `skillsRequired` | `Rust, WebAssembly, SQLite` |
| **G** (6) | `matchedSkills` | `Rust, SQLite` |
| **H** (7) | `type` | `Full-Time` or `Contract` |
| **I** (8) | `experience` | `2+ years` |
| **J** (9) | `linkToApply` | `https://example.com/apply` |

*(Note: Row 1 is treated as the Header row. Data begins on Row 2).*

---

## 📜 Full Google Apps Script Code (`Code.gs`)

Copy and paste the entire script below into your Google Apps Script editor:

```javascript
/**
 * ============================================================================
 * Toolbox Job Webhook Sync Script
 * ============================================================================
 * Sends job opportunities collected by Gemini Spark / Google Sheets directly 
 * to your personal Toolbox app on Fermyon Cloud.
 */

// ---- Configuration ----
const TOOLBOX_CONFIG = {
  WEBHOOK_URL: "https://<YOUR_APP>.fermyon.app/api/webhook",
  WEBHOOK_SECRET: "YOUR_WEBHOOK_SECRET_HERE",
  SHEET_NAME: "", // Leave blank to target the first/active sheet, or specify e.g. "Jobs"
  BATCH_SIZE: 50, // Max jobs per POST request
};

/**
 * Creates a custom "Toolbox" menu in the Google Sheets toolbar when opened.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🚀 Toolbox")
    .addItem("Sync New Jobs (Incremental)", "syncNewJobs")
    .addItem("Sync All Jobs (Full Overwrite)", "syncAllJobs")
    .addSeparator()
    .addItem("Setup 15-Min Auto Trigger", "setupAutoTrigger")
    .addToUi();
}

/**
 * Sends all rows in the sheet to the Toolbox webhook.
 */
function syncAllJobs() {
  syncJobs({ incremental: false });
}

/**
 * Sends only rows added since the last successful sync.
 */
function syncNewJobs() {
  syncJobs({ incremental: true });
}

/**
 * Core synchronization function.
 */
function syncJobs(options) {
  const isIncremental = options && options.incremental;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = TOOLBOX_CONFIG.SHEET_NAME 
    ? ss.getSheetByName(TOOLBOX_CONFIG.SHEET_NAME) 
    : ss.getActiveSheet();

  if (!sheet) {
    Logger.log("Error: Target sheet not found.");
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Logger.log("No data rows found to sync.");
    return;
  }

  const props = PropertiesService.getScriptProperties();
  const lastProcessedRow = isIncremental 
    ? parseInt(props.getProperty("LAST_SYNCED_ROW") || "1", 10) 
    : 1;

  const jobs = [];
  const startRow = isIncremental ? Math.max(1, lastProcessedRow) : 1;

  for (let i = startRow; i < data.length; i++) {
    const row = data[i];
    const title = String(row[1] || "").trim();
    const company = String(row[2] || "").trim();

    // Skip empty rows
    if (!title && !company) continue;

    jobs.push({
      slNo: row[0] !== undefined && row[0] !== null ? row[0] : (i),
      jobTitle: title,
      company: company,
      salaryPackage: String(row[3] || "").trim(),
      location: String(row[4] || "").trim(),
      skillsRequired: String(row[5] || "").trim(),
      matchedSkills: String(row[6] || "").trim(),
      type: String(row[7] || "Full-Time").trim(),
      experience: String(row[8] || "").trim(),
      linkToApply: String(row[9] || "").trim()
    });
  }

  if (jobs.length === 0) {
    Logger.log("No new jobs to transmit.");
    return;
  }

  Logger.log(`Dispatching ${jobs.length} jobs to Toolbox webhook...`);

  // Batching to prevent payload overflow
  let successCount = 0;
  for (let i = 0; i < jobs.length; i += TOOLBOX_CONFIG.BATCH_SIZE) {
    const batch = jobs.slice(i, i + TOOLBOX_CONFIG.BATCH_SIZE);
    const success = sendBatchToWebhook(batch);
    if (success) {
      successCount += batch.length;
    } else {
      Logger.log("Stopping sync due to network/server failure.");
      break;
    }
  }

  if (isIncremental && successCount > 0) {
    const newLastRow = lastProcessedRow + successCount;
    props.setProperty("LAST_SYNCED_ROW", String(newLastRow));
    Logger.log(`Updated LAST_SYNCED_ROW pointer to ${newLastRow}`);
  }

  Logger.log(`Sync completed: ${successCount}/${jobs.length} jobs delivered.`);
}

/**
 * Sends a single batch of job objects via HTTP POST to the Fermyon Spin app.
 */
function sendBatchToWebhook(batch) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + TOOLBOX_CONFIG.WEBHOOK_SECRET,
      "X-Webhook-Source": "GoogleAppsScript"
    },
    payload: JSON.stringify(batch),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(TOOLBOX_CONFIG.WEBHOOK_URL, options);
    const statusCode = response.getResponseCode();
    const content = response.getContentText();

    if (statusCode === 200) {
      Logger.log(`Batch success (HTTP 200): ${content}`);
      return true;
    } else {
      Logger.log(`Batch failed (HTTP ${statusCode}): ${content}`);
      return false;
    }
  } catch (err) {
    Logger.log(`Error calling webhook: ${err.message}`);
    return false;
  }
}

/**
 * Helper to install a background time-driven trigger that runs every 15 minutes.
 */
function setupAutoTrigger() {
  // Clear any pre-existing triggers to prevent duplicates
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "syncNewJobs") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("syncNewJobs")
    .timeBased()
    .everyMinutes(15)
    .create();

  SpreadsheetApp.getUi().alert("✅ 15-Minute Auto Sync trigger configured successfully!");
}
```

---

## 🛠️ Step-by-Step Installation Instructions

1. **Open your Google Sheet** where your jobs data is located.
2. In the top navigation menu, select **Extensions** > **Apps Script**.
3. Clear any existing code in the editor, and paste the script above.
4. Verify the `TOOLBOX_CONFIG` at the top:
   - `WEBHOOK_URL`: Your live Toolbox Webhook URL (from Webhook Setup in the Jobs tab)
   - `WEBHOOK_SECRET`: Your generated Webhook Secret (from Webhook Setup in the Jobs tab)
5. Click the **💾 Save** button (or press `Ctrl + S`).
6. In the function dropdown at the top, select **`syncAllJobs`** and click **Run**.
7. If prompted, grant authorization permissions for the script to access your spreadsheet and external URLs.
8. Check the **Execution log** at the bottom: you will see `HTTP 200: {"status": "received", "count": ...}`!
9. Refresh your Google Sheet: a new **"🚀 Toolbox"** menu will appear in your top toolbar with one-click sync and trigger options.

---

## 🔄 Setting Up Automatic Background Triggers

To have Google Apps Script automatically check for new rows and send them to your Toolbox app without manual intervention:

* **Method 1 (Toolbar Button)**:
  Click **🚀 Toolbox** > **Setup 15-Min Auto Trigger** in your spreadsheet.
* **Method 2 (Google Apps Script Triggers Console)**:
  1. In the Apps Script editor, click the **⏰ Triggers** icon on the left sidebar.
  2. Click **+ Add Trigger** in the bottom right corner.
  3. Select `syncNewJobs` as the function to run.
  4. Select **Time-driven** as the event source.
  5. Select **Minutes timer** (e.g. Every 10 or 15 minutes) or **On change**.
  6. Click **Save**.
