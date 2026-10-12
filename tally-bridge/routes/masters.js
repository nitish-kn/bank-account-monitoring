const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse } = require("../helpers/tallyHelper");

// ─── GET /currencies ────────────────────────────────────────
router.get("/currencies", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>Currencies</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.CURRENCY) continue;
            const c = msg.CURRENCY;
            const name = c?.$?.NAME || c?.NAME;
            if (name) items.push({
                name,
                originalName: c.ORIGINALNAME || null,
                mailingName: c.MAILINGNAME || null,
                decimalPlaces: c.DECIMALPLACES || null
            });
        }
        res.json({ count: items.length, currencies: items });
    } catch (err) {
        console.error("GET CURRENCIES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /currencies ───────────────────────────────────────
router.post("/currencies", async (req, res) => {
    const { name, originalName, decimalPlaces } = req.body;
    if (!name || !originalName) return res.status(400).json({ error: "name and originalName required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <CURRENCY NAME="${name}" ACTION="Create">
            <NAME>${name}</NAME>
            <ORIGINALNAME>${originalName}</ORIGINALNAME>
            ${decimalPlaces ? `<DECIMALPLACES>${decimalPlaces}</DECIMALPLACES>` : '<DECIMALPLACES>2</DECIMALPLACES>'}
          </CURRENCY>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Currency created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST CURRENCY ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /voucher-types ─────────────────────────────────────
router.get("/voucher-types", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>Voucher Types</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.VOUCHERTYPE) continue;
            const vt = msg.VOUCHERTYPE;
            const name = vt?.$?.NAME || vt?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name, parent: vt.PARENT || null, numberingMethod: vt.NUMBERINGMETHOD || null });
        }
        res.json({ count: items.length, voucherTypes: items });
    } catch (err) {
        console.error("GET VOUCHER TYPES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /voucher-types ────────────────────────────────────
router.post("/voucher-types", async (req, res) => {
    const { name, parent, numberingMethod } = req.body;
    if (!name || !parent) return res.status(400).json({ error: "name and parent are required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHERTYPE NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
            <PARENT>${parent}</PARENT>
            ${numberingMethod ? `<NUMBERINGMETHOD>${numberingMethod}</NUMBERINGMETHOD>` : ''}
          </VOUCHERTYPE>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Voucher Type created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST VOUCHER TYPE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /budgets ───────────────────────────────────────────
router.get("/budgets", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Budgets</ACCOUNTTYPE></STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.BUDGET) continue;
            const b = msg.BUDGET;
            const name = b?.$?.NAME || b?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name });
        }
        res.json({ count: items.length, budgets: items });
    } catch (err) {
        console.error("GET BUDGETS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /budgets ──────────────────────────────────────────
router.post("/budgets", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <BUDGET NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
          </BUDGET>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Budget created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST BUDGET ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /cost-categories ───────────────────────────────────
router.get("/cost-categories", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Cost Categories</ACCOUNTTYPE></STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.COSTCATEGORY) continue;
            const c = msg.COSTCATEGORY;
            const name = c?.$?.NAME || c?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name });
        }
        res.json({ count: items.length, costCategories: items });
    } catch (err) {
        console.error("GET COST CATEGORIES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /cost-categories ──────────────────────────────────
router.post("/cost-categories", async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCATEGORY NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
          </COSTCATEGORY>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Cost Category created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST COST CATEGORY ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
