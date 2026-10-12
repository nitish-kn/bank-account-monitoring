const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { getDefaultFinYearRange } = require("../helpers/tallyHelper");

// ─── GET /gst/gstr1 ─────────────────────────────────────────
router.get("/gst/gstr1", async (req, res) => {
    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

        const salesVouchers = [];
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            if (v.VOUCHERTYPENAME !== "Sales") continue;
            const invoice = {
                number: v.VOUCHERNUMBER,
                date: v.DATE,
                partyLedger: v.PARTYLEDGERNAME,
                partyGstin: v.PARTYGSTIN || null,
                placeOfSupply: v.PLACEOFSUPPLY || null,
                entries: []
            };
            const ledgers = v["ALLLEDGERENTRIES.LIST"] || v["LEDGERENTRIES.LIST"];
            const list = Array.isArray(ledgers) ? ledgers : (ledgers ? [ledgers] : []);
            for (const e of list) {
                if (!e) continue;
                invoice.entries.push({
                    ledger: e.LEDGERNAME,
                    amount: Number(e.AMOUNT || 0)
                });
            }
            salesVouchers.push(invoice);
        }
        res.json({ report: "GSTR-1 Data", period: `${from}-${to}`, count: salesVouchers.length, salesVouchers });
    } catch (err) {
        console.error("GSTR1 ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /gst/gstr2 ─────────────────────────────────────────
router.get("/gst/gstr2", async (req, res) => {
    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

        const purchaseVouchers = [];
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            if (v.VOUCHERTYPENAME !== "Purchase") continue;
            const invoice = {
                number: v.VOUCHERNUMBER,
                date: v.DATE,
                partyLedger: v.PARTYLEDGERNAME,
                partyGstin: v.PARTYGSTIN || null,
                entries: []
            };
            const ledgers = v["ALLLEDGERENTRIES.LIST"] || v["LEDGERENTRIES.LIST"];
            const list = Array.isArray(ledgers) ? ledgers : (ledgers ? [ledgers] : []);
            for (const e of list) {
                if (!e) continue;
                invoice.entries.push({
                    ledger: e.LEDGERNAME,
                    amount: Number(e.AMOUNT || 0)
                });
            }
            purchaseVouchers.push(invoice);
        }
        res.json({ report: "GSTR-2 Data", period: `${from}-${to}`, count: purchaseVouchers.length, purchaseVouchers });
    } catch (err) {
        console.error("GSTR2 ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /gst/gstr3b ────────────────────────────────────────
router.get("/gst/gstr3b", async (req, res) => {
    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

        let totalSales = 0, totalPurchases = 0, totalCGST = 0, totalSGST = 0, totalIGST = 0;

        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            const ledgers = v["ALLLEDGERENTRIES.LIST"] || v["LEDGERENTRIES.LIST"];
            const list = Array.isArray(ledgers) ? ledgers : (ledgers ? [ledgers] : []);

            for (const e of list) {
                if (!e) continue;
                const ledgerName = (e.LEDGERNAME || "").toUpperCase();
                const amount = Math.abs(Number(e.AMOUNT || 0));

                if (v.VOUCHERTYPENAME === "Sales" && ledgerName.includes("SALES")) totalSales += amount;
                if (v.VOUCHERTYPENAME === "Purchase" && ledgerName.includes("PURCHASE")) totalPurchases += amount;
                if (ledgerName.includes("CGST")) totalCGST += amount;
                if (ledgerName.includes("SGST")) totalSGST += amount;
                if (ledgerName.includes("IGST")) totalIGST += amount;
            }
        }

        res.json({
            report: "GSTR-3B Summary",
            period: `${from}-${to}`,
            summary: {
                totalSales: totalSales.toFixed(2),
                totalPurchases: totalPurchases.toFixed(2),
                totalCGST: totalCGST.toFixed(2),
                totalSGST: totalSGST.toFixed(2),
                totalIGST: totalIGST.toFixed(2),
                totalTax: (totalCGST + totalSGST + totalIGST).toFixed(2),
                netTaxPayable: (totalCGST + totalSGST + totalIGST).toFixed(2)
            }
        });
    } catch (err) {
        console.error("GSTR3B ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /gst/e-invoice ────────────────────────────────────
router.post("/gst/e-invoice", async (req, res) => {
    const { voucherNumber } = req.body;
    if (!voucherNumber) return res.status(400).json({ error: "voucherNumber is required" });

    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

        let targetVoucher = null;
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            if (msg.VOUCHER.VOUCHERNUMBER === voucherNumber && msg.VOUCHER.VOUCHERTYPENAME === "Sales") {
                targetVoucher = msg.VOUCHER;
                break;
            }
        }

        if (!targetVoucher) return res.status(404).json({ error: `Sales voucher ${voucherNumber} not found` });

        const eInvoiceData = {
            docNumber: targetVoucher.VOUCHERNUMBER,
            docDate: targetVoucher.DATE,
            supplierGstin: targetVoucher.GSTIN || null,
            buyerName: targetVoucher.PARTYLEDGERNAME,
            buyerGstin: targetVoucher.PARTYGSTIN || null,
            placeOfSupply: targetVoucher.PLACEOFSUPPLY || null,
            items: [],
            totalValue: 0
        };

        const invEntries = targetVoucher["ALLINVENTORYENTRIES.LIST"];
        const invList = Array.isArray(invEntries) ? invEntries : (invEntries ? [invEntries] : []);
        for (const inv of invList) {
            if (!inv) continue;
            const amount = Math.abs(Number(inv.AMOUNT || 0));
            eInvoiceData.totalValue += amount;
            eInvoiceData.items.push({
                name: inv.STOCKITEMNAME,
                qty: inv.BILLEDQTY,
                rate: inv.RATE,
                amount
            });
        }

        res.json({ report: "E-Invoice Data", eInvoiceData });
    } catch (err) {
        console.error("E-INVOICE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /gst/e-waybill ───────────────────────────────────
router.post("/gst/e-waybill", async (req, res) => {
    const { voucherNumber, transporterId, vehicleNumber, transportMode } = req.body;
    if (!voucherNumber) return res.status(400).json({ error: "voucherNumber is required" });

    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

        let targetVoucher = null;
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            if (msg.VOUCHER.VOUCHERNUMBER === voucherNumber) {
                targetVoucher = msg.VOUCHER;
                break;
            }
        }

        if (!targetVoucher) return res.status(404).json({ error: `Voucher ${voucherNumber} not found` });

        const eWayBillData = {
            docNumber: targetVoucher.VOUCHERNUMBER,
            docDate: targetVoucher.DATE,
            docType: targetVoucher.VOUCHERTYPENAME,
            supplierGstin: targetVoucher.GSTIN || null,
            buyerName: targetVoucher.PARTYLEDGERNAME,
            buyerGstin: targetVoucher.PARTYGSTIN || null,
            transporterId: transporterId || null,
            vehicleNumber: vehicleNumber || null,
            transportMode: transportMode || "Road",
            items: [],
            totalValue: 0
        };

        const invEntries = targetVoucher["ALLINVENTORYENTRIES.LIST"];
        const invList = Array.isArray(invEntries) ? invEntries : (invEntries ? [invEntries] : []);
        for (const inv of invList) {
            if (!inv) continue;
            const amount = Math.abs(Number(inv.AMOUNT || 0));
            eWayBillData.totalValue += amount;
            eWayBillData.items.push({
                name: inv.STOCKITEMNAME,
                qty: inv.BILLEDQTY,
                amount
            });
        }

        res.json({ report: "E-Way Bill Data", eWayBillData });
    } catch (err) {
        console.error("E-WAYBILL ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
