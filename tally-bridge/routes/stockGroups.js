const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse } = require("../helpers/tallyHelper");

// ─── GET /stock-groups ──────────────────────────────────────
router.get("/stock-groups", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Stock Groups</ACCOUNTTYPE></STATICVARIABLES>
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
            if (!msg.STOCKGROUP) continue;
            const g = msg.STOCKGROUP;
            const name = g?.$?.NAME || g?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name, parent: g.PARENT || null });
        }
        res.json({ count: items.length, stockGroups: items });
    } catch (err) {
        console.error("GET STOCK GROUPS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /stock-groups ─────────────────────────────────────
router.post("/stock-groups", async (req, res) => {
    const { name, parent } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKGROUP NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
          </STOCKGROUP>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Stock Group created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST STOCK GROUP ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /stock-groups/:name ────────────────────────────────
router.put("/stock-groups/:name", async (req, res) => {
    const oldName = decodeURIComponent(req.params.name);
    const { newName, parent } = req.body;
    if (!newName && !parent) return res.status(400).json({ error: "Provide newName and/or parent" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKGROUP NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
          </STOCKGROUP>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Stock Group updated", altered: result.altered, tally: result.tally });
    } catch (err) {
        console.error("PUT STOCK GROUP ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /stock-groups/:name ─────────────────────────────
router.delete("/stock-groups/:name", async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKGROUP NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Stock Group deleted", tally: result.tally });
    } catch (err) {
        console.error("DELETE STOCK GROUP ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
