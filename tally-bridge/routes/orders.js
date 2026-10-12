const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// Helper to build GET for order types
function buildOrderGetRoute(path, voucherType) {
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

            const orders = [];
            for (const msg of messages) {
                if (!msg.VOUCHER) continue;
                const v = msg.VOUCHER;
                if (v.VOUCHERTYPENAME !== voucherType) continue;

                const order = {
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
                    order.items.push({
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
                    order.ledgers.push({
                        ledger: e.LEDGERNAME || null,
                        amount: Number(e.AMOUNT || 0),
                        isDebit: e.ISDEEMEDPOSITIVE === "Yes"
                    });
                }

                orders.push(order);
            }

            const key = path.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) + 's';
            res.json({ count: orders.length, [key]: orders });
        } catch (err) {
            console.error(`GET ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// Helper to build POST for order types
function buildOrderPostRoute(path, voucherType, ledgerField) {
    router.post(path, async (req, res) => {
        const { date, partyLedger, items, narration } = req.body;
        if (!date || !partyLedger || !items || !Array.isArray(items)) {
            return res.status(400).json({ error: "date, partyLedger, and items array are required" });
        }

        let inventoryXml = "";
        for (const item of items) {
            const itemAmount = item.amount || (item.qty * item.rate);
            inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate}</RATE>
              <AMOUNT>${itemAmount}</AMOUNT>
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
          <VOUCHER VCHTYPE="${voucherType}" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
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
            res.json({ message: `${voucherType} creation requested`, created: result.created, tally: result.tally });
        } catch (err) {
            console.error(`POST ${path} ERROR:`, err);
            res.status(500).json({ error: err.message });
        }
    });
}

// ─── Sales Orders ───────────────────────────────────────────
buildOrderGetRoute("/sales-orders", "Sales Order");
buildOrderPostRoute("/sales-orders", "Sales Order");

// ─── Purchase Orders ────────────────────────────────────────
buildOrderGetRoute("/purchase-orders", "Purchase Order");
buildOrderPostRoute("/purchase-orders", "Purchase Order");

module.exports = router;
