const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse } = require("../helpers/tallyHelper");

// ─── GET /cost-centres ──────────────────────────────────────
router.get("/cost-centres", async (req, res) => {
  const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const costCentres = [];
    for (const msg of messages) {
      if (!msg.COSTCENTRE) continue;
      const cc = msg.COSTCENTRE;
      const name = cc?.$?.NAME || cc?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
      if (name) {
        costCentres.push({ name, category: cc.CATEGORY || null });
      }
    }

    res.json({ count: costCentres.length, costCentres });
  } catch (err) {
    console.error("COST CENTRE API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /cost-centres ─────────────────────────────────────
router.post("/cost-centres", async (req, res) => {
  const { name, category } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Name is required" });
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
          <COSTCENTRE NAME="${name}" ACTION="Create">
            <NAME.LIST>
              <NAME>${name}</NAME>
            </NAME.LIST>
            ${category ? `<CATEGORY>${category}</CATEGORY>` : `<CATEGORY>Primary Cost Category</CATEGORY>`}
          </COSTCENTRE>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Cost centre creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST COST CENTRE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /cost-centres/:name ────────────────────────────────
router.put("/cost-centres/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName, category } = req.body;

  if (!newName && !category) {
    return res.status(400).json({ error: "Provide newName and/or category to update" });
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
          <COSTCENTRE NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${category ? `<CATEGORY>${category}</CATEGORY>` : ''}
          </COSTCENTRE>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Cost centre updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT COST CENTRE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /cost-centres/:name ─────────────────────────────
router.delete("/cost-centres/:name", async (req, res) => {
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
          <COSTCENTRE NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Cost centre deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE COST CENTRE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

