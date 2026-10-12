const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");

// ─── POST /report ───────────────────────────────────────────
router.post("/report", async (req, res) => {
    const { reportName, fromDate, toDate } = req.body;
    if (!reportName) {
        return res.status(400).json({ error: "reportName is required" });
    }

    const staticVariablesXml = `
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          ${fromDate ? `<SVFROMDATE>${fromDate}</SVFROMDATE>` : ''}
          ${toDate ? `<SVTODATE>${toDate}</SVTODATE>` : ''}
        </STATICVARIABLES>`;

    const xml = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>${staticVariablesXml}
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
        const data = await sendToTally(xml);
        res.json({ report: reportName, response: data });
    } catch (err) {
        console.error("POST REPORT ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
