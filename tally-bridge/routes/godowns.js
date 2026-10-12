const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse } = require("../helpers/tallyHelper");

// ─── GET /godowns ───────────────────────────────────────────
router.get("/godowns", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Godowns</ACCOUNTTYPE></STATICVARIABLES>
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
            if (!msg.GODOWN) continue;
            const g = msg.GODOWN;
            const name = g?.$?.NAME || g?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name, parent: g.PARENT || null, address: g.ADDRESS || null });
        }
        res.json({ count: items.length, godowns: items });
    } catch (err) {
        console.error("GET GODOWNS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /godowns ──────────────────────────────────────────
router.post("/godowns", async (req, res) => {
    const { name, parent, address } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GODOWN NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
            ${address ? `<ADDRESS>${address}</ADDRESS>` : ''}
          </GODOWN>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Godown created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST GODOWN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /godowns/:name ─────────────────────────────────────
router.put("/godowns/:name", async (req, res) => {
    const oldName = decodeURIComponent(req.params.name);
    const { newName, parent, address } = req.body;
    if (!newName && !parent && !address) return res.status(400).json({ error: "Provide at least one field" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GODOWN NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
            ${address ? `<ADDRESS>${address}</ADDRESS>` : ''}
          </GODOWN>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Godown updated", altered: result.altered, tally: result.tally });
    } catch (err) {
        console.error("PUT GODOWN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /godowns/:name ──────────────────────────────────
router.delete("/godowns/:name", async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <GODOWN NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Godown deleted", tally: result.tally });
    } catch (err) {
        console.error("DELETE GODOWN ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
