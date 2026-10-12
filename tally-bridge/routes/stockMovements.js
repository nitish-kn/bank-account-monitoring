const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// Helper for stock movement GET routes
function buildMovementGetRoute(path, voucherType) {
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

            const movements = [];
            for (const msg of messages) {
                if (!msg.VOUCHER) continue;
                const v = msg.VOUCHER;
                if (v.VOUCHERTYPENAME !== voucherType) continue;

                const movement = {
                    type: v.VOUCHERTYPENAME,
                    number: v.VOUCHERNUMBER,
                    date: v.DATE,
                    narration: v.NARRATION || null,
                    items: []
                };

                const inventoryEntries = v["ALLINVENTORYENTRIES.LIST"];
                const invList = Array.isArray(inventoryEntries) ? inventoryEntries : (inventoryEntries ? [inventoryEntries] : []);
                for (const inv of invList) {
                    if (!inv) continue;
                    movement.items.push({
                        stockItem: inv.STOCKITEMNAME,
                        qty: inv.BILLEDQTY || inv.ACTUALQTY,
                        rate: inv.RATE,
                        amount: inv.AMOUNT,
                        godown: inv.GODOWNNAME || null
                    });
                }

                movements.push(movement);
            }

            const key = path.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 's';
            res.json({ count: movements.length, [key]: movements });
        } catch (err) {
            console.error(`GET ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// ─── GET /delivery-notes ────────────────────────────────────
buildMovementGetRoute("/delivery-notes", "Delivery Note");

// ─── POST /delivery-notes ───────────────────────────────────
router.post("/delivery-notes", async (req, res) => {
    const { date, partyLedger, items, narration } = req.body;
    if (!date || !partyLedger || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "date, partyLedger, and items array are required" });
    }

    let inventoryXml = "";
    for (const item of items) {
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate || 0}</RATE>
              <AMOUNT>${item.amount || (item.qty * (item.rate || 0))}</AMOUNT>
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
          <VOUCHER VCHTYPE="Delivery Note" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
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
        res.json({ message: "Delivery Note creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST DELIVERY NOTE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /receipt-notes ─────────────────────────────────────
buildMovementGetRoute("/receipt-notes", "Receipt Note");

// ─── POST /receipt-notes ────────────────────────────────────
router.post("/receipt-notes", async (req, res) => {
    const { date, partyLedger, items, narration } = req.body;
    if (!date || !partyLedger || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "date, partyLedger, and items array are required" });
    }

    let inventoryXml = "";
    for (const item of items) {
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate || 0}</RATE>
              <AMOUNT>-${item.amount || (item.qty * (item.rate || 0))}</AMOUNT>
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
          <VOUCHER VCHTYPE="Receipt Note" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Receipt Note</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
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
        res.json({ message: "Receipt Note creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST RECEIPT NOTE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /stock-journals ────────────────────────────────────
buildMovementGetRoute("/stock-journals", "Stock Journal");

// ─── POST /stock-journals ───────────────────────────────────
router.post("/stock-journals", async (req, res) => {
    const { date, sourceItems, destinationItems, narration } = req.body;
    if (!date || !sourceItems || !destinationItems) {
        return res.status(400).json({ error: "date, sourceItems, and destinationItems arrays are required" });
    }

    let inventoryXml = "";
    // Source (consumed/transferred out)
    for (const item of sourceItems) {
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate || 0}</RATE>
              <AMOUNT>${item.amount || (item.qty * (item.rate || 0))}</AMOUNT>
              ${item.godown ? `<GODOWNNAME>${item.godown}</GODOWNNAME>` : ''}
            </ALLINVENTORYENTRIES.LIST>`;
    }
    // Destination (received/transferred in)
    for (const item of destinationItems) {
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate || 0}</RATE>
              <AMOUNT>-${item.amount || (item.qty * (item.rate || 0))}</AMOUNT>
              ${item.godown ? `<GODOWNNAME>${item.godown}</GODOWNNAME>` : ''}
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
          <VOUCHER VCHTYPE="Stock Journal" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
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
        res.json({ message: "Stock Journal creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST STOCK JOURNAL ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
