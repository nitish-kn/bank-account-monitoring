const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { sendToTally } = require("../tallyClient");
const { getActiveCompany } = require("./tallyHelper");

const STATE_FILE = path.join(__dirname, "stockState.json");
const WEBHOOK_URL = "http://localhost:8000/webhook/stock-summary";
const TARGET_COMPANY = process.env.TARGET_COMPANY || "SCMPL NARELA  - (from 1-Apr-25)";

function isTargetCompany(activeCompany) {
  if (!activeCompany) return false;
  if (activeCompany === TARGET_COMPANY) return true;
  const normalize = (s) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(activeCompany) === normalize(TARGET_COMPANY);
}

// Timezone check: 8:00 AM to 10:00 PM IST (inclusive)
function isISTWorkingHours() {
  const options = { timeZone: "Asia/Kolkata", hour12: false, hour: "numeric", minute: "numeric" };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const formatted = formatter.format(new Date());
  const parts = formatted.split(":");
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);

  const totalMinutes = hour * 60 + minute;
  const startMinutes = 8 * 60;   // 8:00 AM
  const endMinutes = 22 * 60;    // 10:00 PM

  return totalMinutes >= startMinutes && totalMinutes <= endMinutes;
}

// Dynamic Indian Financial Year calculations
function getFinYearDateRange() {
  const options = { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric", day: "numeric" };
  const formatter = new Intl.DateTimeFormat("en-US", options);
  const parts = formatter.formatToParts(new Date());

  let year = "";
  let month = "";
  let day = "";
  for (const part of parts) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
  }

  const currentYear = parseInt(year, 10);
  const currentMonth = parseInt(month, 10);
  const currentDay = parseInt(day, 10);

  let finYearStartYear;
  if (currentMonth >= 4) {
    finYearStartYear = currentYear;
  } else {
    finYearStartYear = currentYear - 1;
  }

  const fromDate = `${finYearStartYear}0401`;
  const toDate = `${currentYear}${String(currentMonth).padStart(2, "0")}${String(currentDay).padStart(2, "0")}`;

  return { from: fromDate, to: toDate };
}

async function fetchAndSyncStock() {
  if (!isISTWorkingHours()) {
    console.log(`[Stock Scheduler] Outside working hours (8:00 AM - 10:00 PM IST). Skipping sync.`);
    return;
  }

  let activeCompany = null;
  try {
    activeCompany = await getActiveCompany();
  } catch (err) {
    console.error(`[Stock Scheduler] Could not determine active company from Tally:`, err.message);
    return;
  }

  if (!isTargetCompany(activeCompany)) {
    console.log(`[Stock Scheduler] Active company is "${activeCompany}". Target company is "${TARGET_COMPANY}". Skipping sync.`);
    return;
  }

  const { from, to } = getFinYearDateRange();
  console.log(`[Stock Scheduler] Active company verified: "${activeCompany}". Starting sync for period: ${from} to ${to}...`);

  const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Stock Summary</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ISITEMWISE>Yes</ISITEMWISE>
          <DSPShowAllLevels>Yes</DSPShowAllLevels>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const envelope = data?.ENVELOPE || {};

    let names = envelope.DSPACCNAME || [];
    if (!Array.isArray(names)) names = [names];

    let info = envelope.DSPSTKINFO || [];
    if (!Array.isArray(info)) info = [info];

    const currentItems = [];
    const length = Math.max(names.length, info.length);

    for (let i = 0; i < length; i++) {
      const nameObj = names[i];
      const infoObj = info[i];

      const name = nameObj?.DSPDISPNAME || nameObj || null;
      if (!name) continue;

      const stockCl = infoObj?.DSPSTKCL || {};
      const quantity = stockCl.DSPCLQTY || null;
      const rate = stockCl.DSPCLRATE || null;
      const value = stockCl.DSPCLAMTA || stockCl.DSPCLVAL || null;

      let cleanValue = value;
      if (value && !isNaN(Number(value))) {
        cleanValue = Math.abs(Number(value)).toString();
      }

      currentItems.push({
        name: String(name).trim(),
        quantity: quantity ? String(quantity).trim() : null,
        rate: rate ? String(rate).trim() : null,
        value: cleanValue ? String(cleanValue).trim() : null
      });
    }

    // Load previous state
    let previousState = {};
    if (fs.existsSync(STATE_FILE)) {
      try {
        previousState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      } catch (e) {
        console.error(`[Stock Scheduler] Error reading state file, starting fresh:`, e.message);
      }
    }

    // Detect changes
    const changedItems = [];
    const currentItemNames = new Set(currentItems.map(item => item.name));

    // 1. Check for new or updated items
    for (const item of currentItems) {
      const prev = previousState[item.name];
      if (!prev) {
        // New item
        changedItems.push(item);
      } else if (
        prev.quantity !== item.quantity ||
        prev.rate !== item.rate ||
        prev.value !== item.value
      ) {
        // Updated item
        changedItems.push(item);
      }
    }

    // 2. Check for deleted/removed items (exist in previousState but not in currentItems)
    for (const prevName of Object.keys(previousState)) {
      if (!currentItemNames.has(prevName)) {
        // Item removed from active stock summary
        const prev = previousState[prevName];
        changedItems.push({
          name: prevName,
          quantity: "0",
          rate: prev ? prev.rate : null,
          value: "0"
        });
      }
    }

    console.log(`[Stock Scheduler] Synced: ${currentItems.length} items. Changes detected: ${changedItems.length}`);

    // If changes detected, trigger Webhook
    if (changedItems.length > 0) {
      console.log(`[Stock Scheduler] Posting changes to webhook...`);
      try {
        await axios.post(WEBHOOK_URL, changedItems, {
          headers: { "Content-Type": "application/json" }
        });
        console.log(`[Stock Scheduler] Webhook successfully triggered with changes.`);
      } catch (webhookErr) {
        console.error(`[Stock Scheduler] Webhook trigger failed:`, webhookErr.message);
      }
    } else {
      console.log(`[Stock Scheduler] No changes detected. Webhook skipped.`);
    }

    // Save the new state back to the persisted state file
    const newState = {};
    for (const item of currentItems) {
      newState[item.name] = {
        quantity: item.quantity,
        rate: item.rate,
        value: item.value
      };
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), "utf8");

  } catch (err) {
    console.error(`[Stock Scheduler] Sync error:`, err.message);
  }
}

function startStockScheduler() {
  console.log(`[Stock Scheduler] Background sync worker started. Checking every 5 minutes.`);
  // Run once immediately on start
  fetchAndSyncStock();

  // Set interval (5 minutes = 300,000 ms)
  setInterval(fetchAndSyncStock, 5 * 60 * 1000);
}

module.exports = { startStockScheduler };
