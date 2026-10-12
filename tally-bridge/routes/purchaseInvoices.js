const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// ─── GET /purchase-invoices ─────────────────────────────────
router.get("/purchase-invoices", async (req, res) => {
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

        const invoices = [];
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            if (v.VOUCHERTYPENAME !== "Purchase") continue;

            const invoice = {
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
                invoice.items.push({
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
                invoice.ledgers.push({
                    ledger: e.LEDGERNAME || null,
                    amount: Number(e.AMOUNT || 0),
                    isDebit: e.ISDEEMEDPOSITIVE === "Yes"
                });
            }

            invoices.push(invoice);
        }

        res.json({ count: invoices.length, purchaseInvoices: invoices });
    } catch (err) {
        console.error("GET PURCHASE INVOICES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /purchase-invoices ────────────────────────────────
router.post("/purchase-invoices", async (req, res) => {
    const { date, partyLedger, purchaseLedger, items, taxLedgers } = req.body;
    if (!date || !partyLedger || !purchaseLedger || !items || !Array.isArray(items)) {
        return res.status(400).json({ error: "date, partyLedger, purchaseLedger, and items array are required" });
    }

    let totalItemValue = 0;
    let inventoryXml = "";
    for (const item of items) {
        const itemAmount = item.amount || (item.qty * item.rate);
        totalItemValue += itemAmount;
        inventoryXml += `
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>${item.stockItem}</STOCKITEMNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <BILLEDQTY>${item.qty}</BILLEDQTY>
              <RATE>${item.rate}</RATE>
              <AMOUNT>-${itemAmount}</AMOUNT>
              <ACCOUNTINGALLOCATIONS.LIST>
                <LEDGERNAME>${purchaseLedger}</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-${itemAmount}</AMOUNT>
              </ACCOUNTINGALLOCATIONS.LIST>
            </ALLINVENTORYENTRIES.LIST>`;
    }

    let totalTaxValue = 0;
    let taxesXml = "";
    if (taxLedgers && Array.isArray(taxLedgers)) {
        for (const tax of taxLedgers) {
            totalTaxValue += tax.amount;
            taxesXml += `
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${tax.ledger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${tax.amount}</AMOUNT>
            </LEDGERENTRIES.LIST>`;
        }
    }

    const invoiceTotal = totalItemValue + totalTaxValue;

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
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyLedger}</PARTYLEDGERNAME>
            <LEDGERENTRIES.LIST>
              <LEDGERNAME>${partyLedger}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${invoiceTotal}</AMOUNT>
            </LEDGERENTRIES.LIST>
            ${inventoryXml}
            ${taxesXml}
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
        res.json({ message: "Purchase Invoice creation requested", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST PURCHASE INVOICE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
