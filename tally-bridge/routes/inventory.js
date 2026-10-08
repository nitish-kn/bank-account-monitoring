const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse } = require("../helpers/tallyHelper");

// ─── GET /units ─────────────────────────────────────────────
router.get("/units", async (req, res) => {
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
          <ACCOUNTTYPE>Units</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const units = [];
    for (const msg of messages) {
      if (!msg.UNIT) continue;
      const unit = msg.UNIT;
      const name = unit?.NAME;
      if (name) {
        units.push({ name, originalName: unit.ORIGINALNAME || null });
      }
    }

    res.json({ count: units.length, units });
  } catch (err) {
    console.error("UNIT API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /units ────────────────────────────────────────────
router.post("/units", async (req, res) => {
  const { name, originalName } = req.body;
  if (!name || !originalName) {
    return res.status(400).json({ error: "Name and originalName are required" });
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
          <UNIT NAME="${name}" ACTION="Create">
            <NAME>${name}</NAME>
            <ORIGINALNAME>${originalName}</ORIGINALNAME>
            <ISSIMPLEUNIT>Yes</ISSIMPLEUNIT>
          </UNIT>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Unit creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST UNIT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /stock-items ───────────────────────────────────────
router.get("/stock-items", async (req, res) => {
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
          <ACCOUNTTYPE>Stock Items</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
    if (!Array.isArray(messages)) messages = [messages];

    const stockItems = [];
    for (const msg of messages) {
      if (!msg.STOCKITEM) continue;
      const item = msg.STOCKITEM;
      const name =
        item?.$?.NAME ||
        (item?.["LANGUAGENAME.LIST"] && item?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME);
      if (name) {
        stockItems.push({
          name,
          parent: item.PARENT || null,
          baseUnit: item.BASEUNITS || null,
          openingBalance: item.OPENINGBALANCE || null
        });
      }
    }

    res.json({ count: stockItems.length, stockItems });
  } catch (err) {
    console.error("STOCK ITEM API ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /stock-items ──────────────────────────────────────
router.post("/stock-items", async (req, res) => {
  const { name, parent, baseUnit, openingBalance } = req.body;
  if (!name || !baseUnit) {
    return res.status(400).json({ error: "Name and baseUnit are required" });
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
          <STOCKITEM NAME="${name}" ACTION="Create">
            <NAME.LIST>
              <NAME>${name}</NAME>
            </NAME.LIST>
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
            <BASEUNITS>${baseUnit}</BASEUNITS>
            ${openingBalance ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
          </STOCKITEM>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Stock item creation requested", created: result.created, tally: result.tally });
  } catch (err) {
    console.error("POST STOCK ITEM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /units/:name ───────────────────────────────────────
router.put("/units/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName, originalName } = req.body;

  if (!newName && !originalName) {
    return res.status(400).json({ error: "Provide newName and/or originalName to update" });
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
          <UNIT NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME>${newName}</NAME>` : ''}
            ${originalName ? `<ORIGINALNAME>${originalName}</ORIGINALNAME>` : ''}
          </UNIT>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Unit updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT UNIT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /units/:name ────────────────────────────────────
router.delete("/units/:name", async (req, res) => {
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
          <UNIT NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Unit deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE UNIT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /stock-items/:name ─────────────────────────────────
router.put("/stock-items/:name", async (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { newName, parent, baseUnit, openingBalance } = req.body;

  if (!newName && !parent && !baseUnit && openingBalance === undefined) {
    return res.status(400).json({ error: "Provide at least one field to update" });
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
          <STOCKITEM NAME="${oldName}" ACTION="Alter">
            ${newName ? `<NAME.LIST><NAME>${newName}</NAME></NAME.LIST>` : ''}
            ${parent ? `<PARENT>${parent}</PARENT>` : ''}
            ${baseUnit ? `<BASEUNITS>${baseUnit}</BASEUNITS>` : ''}
            ${openingBalance !== undefined ? `<OPENINGBALANCE>${openingBalance}</OPENINGBALANCE>` : ''}
          </STOCKITEM>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Stock item updated", altered: result.altered, tally: result.tally });
  } catch (err) {
    console.error("PUT STOCK ITEM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /stock-items/:name ──────────────────────────────
router.delete("/stock-items/:name", async (req, res) => {
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
          <STOCKITEM NAME="${name}" ACTION="Delete"/>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const data = await sendToTally(xml);
    const result = parseTallyImportResponse(data);
    if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
    res.json({ message: "Stock item deleted", tally: result.tally });
  } catch (err) {
    console.error("DELETE STOCK ITEM ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

