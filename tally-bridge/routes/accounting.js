const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// ─── GET /groups ────────────────────────────────────────────
router.get("/groups", async (req, res) => {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);

    const body = data?.ENVELOPE?.BODY || {};
    let messages = body?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const groups = [];
    for (const msg of messages) {
      if (!msg.GROUP) continue;
      const grp = msg.GROUP;
      const name = grp?.$?.NAME || grp?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
      if (name) {
        groups.push({ name, parent: grp.PARENT || null });
      }
    }

    res.json({ count: groups.length, groups });
  } catch (err) {
    console.error("GROUP API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /groups ───────────────────────────────────────────
router.post("/groups", async (req, res) => {
  const { name, parent } = req.body;
  if (!name || !parent) {
    return res.status(400).json({ error: "Name and parent are required" });
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GROUP NAME="${name}" ACTION="Create">
            <NAME.LIST>
              <NAME>${name}</NAME>
            </NAME.LIST>
            <PARENT>${parent}</PARENT>
          </GROUP>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Group creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST GROUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /ledgers ───────────────────────────────────────────
router.get("/ledgers", async (req, res) => {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const ledgers = [];
    for (const msg of messages) {
      if (!msg.LEDGER) continue;
      const ledger = msg.LEDGER;
      const name = ledger?.$?.NAME || ledger?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
      if (name) {
        ledgers.push({
          name,
          parent: ledger.PARENT || null,
          openingBalance: ledger.OPENINGBALANCE || null
        });
      }
    }

    res.json({ count: ledgers.length, ledgers });
  } catch (err) {
    console.error("LEDGER API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /ledger?name= ──────────────────────────────────────
// One ledger's group and bank details. Asks Tally for just these fields
// (not the full master), so it stays cheap on Tally's limited bandwidth.
router.get("/ledger", async (req, res) => {
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });
  // A double quote can't be expressed inside the TDL string filter below.
  if (name.includes('"')) return res.json({ found: false, name });

  const xmlName = name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const xml = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>BridgeLedgerInfo</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="BridgeLedgerInfo">
            <TYPE>Ledger</TYPE>
            <FETCH>Name, Parent, BankAccHolderName, BankDetails, IFSCode, BankingConfigBank, BranchName</FETCH>
            <COMPUTE>IsBank : $$IsBelongsTo:$$GroupBank OR $$IsBelongsTo:$$GroupBankOD</COMPUTE>
            <FILTER>BridgeLedgerByName</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="BridgeLedgerByName">$Name = "${xmlName}"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let ledger = data?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER;
    if (Array.isArray(ledger)) ledger = ledger[0];
    if (!ledger) return res.json({ found: false, name });

    // xml2js gives { _: value, $: attrs } for tags with attributes like TYPE="String".
    const text = (value) => {
      const raw = value && typeof value === "object" ? value._ : value;
      return typeof raw === "string" && raw.trim() ? raw.trim() : null;
    };
    res.json({
      found: true,
      name: ledger?.$?.NAME || name,
      parent: text(ledger.PARENT),
      isBank: text(ledger.ISBANK) === "Yes",
      accountNumber: text(ledger.BANKDETAILS),
      holderName: text(ledger.BANKACCHOLDERNAME),
      ifsc: text(ledger.IFSCODE),
      bankName: text(ledger.BANKINGCONFIGBANK),
      branch: text(ledger.BRANCHNAME),
    });
  } catch (err) {
    console.error("GET LEDGER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /ledgers ──────────────────────────────────────────
router.post("/ledgers", async (req, res) => {
  const { name, parent, openingBalance } = req.body;
  if (!name || !parent) {
    return res.status(400).json({ error: "Name and parent are required" });
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${name}" ACTION="Create">
            <NAME.LIST>
              <NAME>${name}</NAME>
            </NAME.LIST>
            <PARENT>${parent}</PARENT>
            ${openingBalance ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Ledger creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST LEDGER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /vouchers ──────────────────────────────────────────
router.get("/vouchers", async (req, res) => {
  const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
  const from = req.query.from || defaultFrom;
  const to = req.query.to || defaultTo;
  console.log(from, to);

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const vouchers = [];
    for (const msg of messages) {
      if (!msg.VOUCHER) continue;
      const v = msg.VOUCHER;

      const voucher = {
        type: v.VOUCHERTYPENAME || null,
        number: v.VOUCHERNUMBER || null,
        date: v.DATE || null,
        narration: v.NARRATION || null,
        entries: []
      };

      const entries = v["ALLLEDGERENTRIES.LIST"];
      const list = Array.isArray(entries) ? entries : [entries];
      for (const e of list) {
        if (!e) continue;
        voucher.entries.push({
          ledger: e.LEDGERNAME || null,
          amount: Number(e.AMOUNT || 0),
          isDebit: e.ISDEEMEDPOSITIVE === "Yes"
        });
      }

      vouchers.push(voucher);
    }

    res.json({ count: vouchers.length, vouchers });
  } catch (err) {
    console.error("VOUCHER API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /vouchers ─────────────────────────────────────────
router.post("/vouchers", async (req, res) => {
  const { date, type, narration, entries } = req.body;
  if (!date || !type || !entries || !Array.isArray(entries)) {
    return res.status(400).json({ error: "Date, type, and entries array are required" });
  }

  const voucherDate = String(date).trim();
  const isoDate = `${voucherDate.slice(0, 4)}-${voucherDate.slice(4, 6)}-${voucherDate.slice(6, 8)}`;
  const parsedDate = new Date(`${isoDate}T00:00:00Z`);
  if (!/^\d{8}$/.test(voucherDate) || !Number.isFinite(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== isoDate) {
    return res.status(400).json({ error: "Voucher date must be a valid calendar date in YYYYMMDD format" });
  }

  let ledgersXml = "";
  for (const entry of entries) {
    ledgersXml += `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${entry.ledger}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${entry.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${entry.isDebit ? '-' : ''}${Math.abs(entry.amount)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`;
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">
            <DATE>${voucherDate}</DATE>
            <EFFECTIVEDATE>${voucherDate}</EFFECTIVEDATE>
            <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <ISINVOICE>No</ISINVOICE>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
            ${ledgersXml}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Voucher creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST VOUCHER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /groups/:name ──────────────────────────────────────
router.put("/groups/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName, parent } = req.body;

  if (!newName && !parent) {
    return res.status(400).json({ error: "Provide newName and/or parent to update" });
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GROUP NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
          </GROUP>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Group updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT GROUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /groups/:name ───────────────────────────────────
router.delete("/groups/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name);

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GROUP NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Group deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE GROUP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /ledgers/:name ─────────────────────────────────────
router.put("/ledgers/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName, parent, openingBalance } = req.body;

  if (!newName && !parent && openingBalance === undefined) {
    return res.status(400).json({ error: "Provide newName, parent, and/or openingBalance to update" });
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
            ${openingBalance !== undefined ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Ledger updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT LEDGER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /ledgers/:name ──────────────────────────────────
router.delete("/ledgers/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name);

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Ledger deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE LEDGER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /vouchers/:voucherNumber ───────────────────────────
router.put("/vouchers/:voucherNumber", async (req, res) => {
  const voucherNumber = decodeURIComponent(req.params.voucherNumber);
  const { date, type, narration, entries } = req.body;

  if (!type) {
    return res.status(400).json({ error: "type (voucher type) is required to identify the voucher" });
  }

  let ledgersXml = "";
  if (entries && Array.isArray(entries)) {
    for (const entry of entries) {
      ledgersXml += `
      <ALLLEDGERENTRIES.LIST>
        <LEDGERNAME>${entry.ledger}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>${entry.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
        <AMOUNT>${entry.isDebit ? '-' : ''}${Math.abs(entry.amount)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`;
    }
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${type}" ACTION="Alter" VCHKEY="${voucherNumber}">
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
            ${date ? `<DATE>${date}</DATE>` : ''}
            ${narration !== undefined ? `<NARRATION>${narration}</NARRATION>` : ''}
            ${ledgersXml}
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Voucher updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT VOUCHER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /vouchers/:voucherNumber ────────────────────────
router.delete("/vouchers/:voucherNumber", async (req, res) => {
  const voucherNumber = decodeURIComponent(req.params.voucherNumber);
  const type = req.query.type;

  if (!type) {
    return res.status(400).json({ error: "Query param 'type' (voucher type) is required, e.g. ?type=Sales" });
  }

  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${type}" ACTION="Delete" VCHKEY="${voucherNumber}">
            <VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>
            <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Voucher deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE VOUCHER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
