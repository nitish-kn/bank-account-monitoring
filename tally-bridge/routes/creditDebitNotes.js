const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// Helper to build GET route for credit/debit notes
function buildNoteGetRoute(path, voucherType) {
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

            const notes = [];
            for (const msg of messages) {
                if (!msg.VOUCHER) continue;
                const v = msg.VOUCHER;
                if (v.VOUCHERTYPENAME !== voucherType) continue;

                const note = {
                    type: v.VOUCHERTYPENAME,
                    number: v.VOUCHERNUMBER,
                    date: v.DATE,
                    partyLedger: v.PARTYLEDGERNAME,
                    items: [],
                    ledgers: []
                };

                const inventoryEntries = v["ALLINVENTORYENTRIES.LIST"];
                const invList = Array.isArray(inventoryEntries) ? inventoryEntries : (inventoryEntries ? [inventoryEntries] : []);
                for (const inv of invList) {
                    if (!inv) continue;
                    note.items.push({
                        stockItem: inv.STOCKITEMNAME,
                        billedQty: inv.BILLEDQTY,
                        rate: inv.RATE,
                        amount: inv.AMOUNT
                    });
                }

                const ledgerEntries = v["ALLLEDGERENTRIES.LIST"] || v["LEDGERENTRIES.LIST"];
                const ledgList = Array.isArray(ledgerEntries) ? ledgerEntries : (ledgerEntries ? [ledgerEntries] : []);
                for (const e of ledgList) {
                    if (!e) continue;
                    note.ledgers.push({
                        ledger: e.LEDGERNAME || null,
                        amount: Number(e.AMOUNT || 0),
                        isDebit: e.ISDEEMEDPOSITIVE === "Yes"
                    });
                }

                notes.push(note);
            }

            const key = path.slice(1).replace(/-/g, '');
            res.json({ count: notes.length, [key]: notes });
        } catch (err) {
            console.error(`GET ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// ─── GET /credit-notes ──────────────────────────────────────
buildNoteGetRoute("/credit-notes", "Credit Note");

// ─── POST /credit-notes ─────────────────────────────────────
router.post("/credit-notes", async (req, res) => {
    const { date, partyLedger, salesLedger, items, narration } = req.body;
    if (!date || !partyLedger || !salesLedger || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "date, partyLedger, salesLedger, and items array are required" });
    }

    let totalValue = 0;
    let inventoryXml = "";
    for (const item of items) {
        const itemAmount = item.amount || (item.qty * item.rate);
        totalValue += itemAmount;
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate}</RATE>
              <AMOUNT>-${itemAmount}</AMOUNT>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${salesLedger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${itemAmount}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
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
          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${totalValue}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${inventoryXml}
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
        res.json({ message: "Credit Note creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST CREDIT NOTE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /debit-notes ───────────────────────────────────────
buildNoteGetRoute("/debit-notes", "Debit Note");

// ─── POST /debit-notes ──────────────────────────────────────
router.post("/debit-notes", async (req, res) => {
    const { date, partyLedger, purchaseLedger, items, narration } = req.body;
    if (!date || !partyLedger || !purchaseLedger || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "date, partyLedger, purchaseLedger, and items array are required" });
    }

    let totalValue = 0;
    let inventoryXml = "";
    for (const item of items) {
        const itemAmount = item.amount || (item.qty * item.rate);
        totalValue += itemAmount;
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate}</RATE>
              <AMOUNT>${itemAmount}</AMOUNT>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${purchaseLedger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>${itemAmount}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
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
          <VOUCHER VCHTYPE="Debit Note" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Debit Note</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${totalValue}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${inventoryXml}
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
        res.json({ message: "Debit Note creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST DEBIT NOTE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
