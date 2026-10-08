const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// Factory for simple voucher type GET endpoints
function createGetRoute(path, voucherType) {
    router.get(path, async (req, res) => {
        const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
        const from = req.query.from || defaultFrom;
        const to = req.query.to || defaultTo;

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
                if (v.VOUCHERTYPENAME !== voucherType) continue;

                const voucher = {
                    type: v.VOUCHERTYPENAME,
                    number: v.VOUCHERNUMBER || null,
                    date: v.DATE || null,
                    narration: v.NARRATION || null,
                    entries: []
                };

                const entries = v["ALLLEDGERENTRIES.LIST"];
                const list = Array.isArray(entries) ? entries : (entries ? [entries] : []);
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

            res.json({ count: vouchers.length, [path.slice(1)]: vouchers });
        } catch (err) {
            console.error(`GET ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// Factory for simple voucher type POST endpoints
function createPostRoute(path, voucherType) {
    router.post(path, async (req, res) => {
        const { date, narration, entries } = req.body;
        if (!date || !entries || !Array.isArray(entries)) {
            return res.status(400).json({ error: "date and entries array are required" });
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
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
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
            res.json({ message: `${voucherType} creation requested`, created: result.created, tally: result.tally });
        } catch (err) {
            console.error(`POST ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// ─── Payments ───────────────────────────────────────────────
createGetRoute("/payments", "Payment");
createPostRoute("/payments", "Payment");

// ─── Receipts ───────────────────────────────────────────────
createGetRoute("/receipts", "Receipt");
createPostRoute("/receipts", "Receipt");

// ─── Contra ─────────────────────────────────────────────────
createGetRoute("/contra", "Contra");
createPostRoute("/contra", "Contra");

// ─── Journals ───────────────────────────────────────────────
createGetRoute("/journals", "Journal");
createPostRoute("/journals", "Journal");

module.exports = router;
