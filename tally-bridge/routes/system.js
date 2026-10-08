const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getActiveCompany } = require("../helpers/tallyHelper");

// ─── GET /company ───────────────────────────────────────────
router.get("/company", async (req, res) => {
  try {
    const companyName = await getActiveCompany();
    res.json({ company: companyName });
  } catch (err) {
    console.error("COMPANY INFO ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /health ────────────────────────────────────────────
router.get("/health", async (req, res) => {
  const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY/>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
  try {
    const data = await sendToTally(xml);
    // Tally answers this probe with <RESPONSE>, not <ENVELOPE>; any reply means it's up
    // (when it's down, sendToTally throws and we land in the catch).
    const isConnected = Boolean(data);
    res.json({
      status: isConnected ? "connected" : "error",
      tallyRunning: isConnected,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.json({
      status: "disconnected",
      tallyRunning: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ─── POST /sync ─────────────────────────────────────────────
router.post("/sync", async (req, res) => {
  const { masters, vouchers } = req.body;
  if (!masters && !vouchers) {
    return res.status(400).json({ error: "Provide masters and/or vouchers arrays" });
  }

  const results = { masters: [], vouchers: [] };

  // Bulk import masters
  if (masters && Array.isArray(masters)) {
    let mastersXml = "";
    for (const m of masters) {
      const tag = m.type || "LEDGER";
      const action = m.action || "Create";
      let innerXml = "";
      if (m.name) innerXml += `<NAME.LIST><NAME>${m.name}</NAME></NAME.LIST>`;
      if (m.parent) innerXml += `<PARENT>${m.parent}</PARENT>`;
      if (m.openingBalance) innerXml += `<OPENINGBALANCE>${m.openingBalance}</OPENINGBALANCE>`;
      // Add any extra fields
      if (m.extra) {
        for (const [key, val] of Object.entries(m.extra)) {
          innerXml += `<${key}>${val}</${key}>`;
        }
      }
      mastersXml += `<${tag} NAME="${m.name}" ACTION="${action}">${innerXml}</${tag}>`;
    }

    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          ${mastersXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
      const data = await sendToTally(xml);
      const result = parseTallyImportResponse(data);
      results.masters = { success: result.success, created: result.created, altered: result.altered, error: result.error };
    } catch (err) {
      results.masters = { success: false, error: err.message };
    }
  }

  // Bulk import vouchers
  if (vouchers && Array.isArray(vouchers)) {
    let vouchersXml = "";
    for (const v of vouchers) {
      let ledgersXml = "";
      if (v.entries && Array.isArray(v.entries)) {
        for (const e of v.entries) {
          ledgersXml += `
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>${e.ledger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>${e.isDebit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
                <AMOUNT>${e.isDebit ? '-' : ''}${Math.abs(e.amount)}</AMOUNT>
              </ALLLEDGERENTRIES.LIST>`;
        }
      }
      vouchersXml += `
          <VOUCHER VCHTYPE="${v.type}" ACTION="Create">
            <DATE>${v.date}</DATE>
            <VOUCHERTYPENAME>${v.type}</VOUCHERTYPENAME>
            ${v.narration ? `<NARRATION>${v.narration}</NARRATION>` : ''}
            ${ledgersXml}
          </VOUCHER>`;
    }

    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          ${vouchersXml}
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
      const data = await sendToTally(xml);
      const result = parseTallyImportResponse(data);
      results.vouchers = { success: result.success, created: result.created, error: result.error };
    } catch (err) {
      results.vouchers = { success: false, error: err.message };
    }
  }

  res.json({ message: "Bulk sync completed", results });
});

module.exports = router;
