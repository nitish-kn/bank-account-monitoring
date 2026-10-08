const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { getDefaultFinYearRange } = require("../helpers/tallyHelper");

// Helper to fetch and parse a Tally report with clean JSON output
async function fetchReport(reportName, from, to) {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>${reportName}</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          ${from ? `<SVFROMDATE>${from}</SVFROMDATE>` : ''}
          ${to ? `<SVTODATE>${to}</SVTODATE>` : ''}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    return await sendToTally(xml);
}

// Helper to extract ledger rows from Tally DSPACCNAME/DSPDISPNAME format
function parseLedgerRows(messages) {
    const rows = [];
    if (!messages) return rows;
    const list = Array.isArray(messages) ? messages : [messages];
    for (const msg of list) {
        if (!msg) continue;
        const name = msg.DSPACCNAME?.DSPDISPNAME || msg.DSPACCNAME || null;
        const closingBal = msg.DSPCLBAL?.DSPDISPNAME || msg.DSPCLBAL || null;
        if (name) rows.push({ name: String(name).trim(), closingBalance: closingBal });
    }
    return rows;
}

// ─── GET /reports/trial-balance ─────────────────────────────
router.get("/reports/trial-balance", async (req, res) => {
    try {
        const data = await fetchReport("Trial Balance", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Trial Balance", data: body });
    } catch (err) {
        console.error("TRIAL BALANCE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/balance-sheet ─────────────────────────────
router.get("/reports/balance-sheet", async (req, res) => {
    try {
        const data = await fetchReport("Balance Sheet", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Balance Sheet", data: body });
    } catch (err) {
        console.error("BALANCE SHEET ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/profit-loss ───────────────────────────────
router.get("/reports/profit-loss", async (req, res) => {
    try {
        const data = await fetchReport("Profit and Loss A/c", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Profit and Loss", data: body });
    } catch (err) {
        console.error("P&L ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/cash-flow ─────────────────────────────────
router.get("/reports/cash-flow", async (req, res) => {
    try {
        const data = await fetchReport("Cash Flow", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Cash Flow", data: body });
    } catch (err) {
        console.error("CASH FLOW ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/stock-summary ─────────────────────────────
router.get("/reports/stock-summary", async (req, res) => {
    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;

    // Custom XML to force Item-wise explosion of Stock Summary
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Stock Summary</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ISITEMWISE>Yes</ISITEMWISE>
          <DSPShowAllLevels>Yes</DSPShowAllLevels>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
        const companyXml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <ACCOUNTTYPE>Companies</ACCOUNTTYPE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        const [data, companyData] = await Promise.all([
            sendToTally(xml),
            sendToTally(companyXml).catch(err => {
                console.error("Error fetching company name:", err.message);
                return null;
            })
        ]);

        console.log("DEBUG COMPANY DATA:", JSON.stringify(companyData));

        let companyName = "Unknown Company";
        if (companyData) {
            const body = companyData?.ENVELOPE?.BODY || {};
            // Direct extraction from Tally's echoed static variables
            companyName = body?.IMPORTDATA?.REQUESTDESC?.STATICVARIABLES?.SVCURRENTCOMPANY;

            // Fallback to checking the active company list details
            if (!companyName || typeof companyName !== "string") {
                const requestData = body?.IMPORTDATA?.REQUESTDATA || {};
                let messages = requestData.TALLYMESSAGE || [];
                if (!Array.isArray(messages)) messages = [messages];

                for (const msg of messages) {
                    if (msg.COMPANY) {
                        const list = msg.COMPANY["REMOTECMPINFO.LIST"];
                        const compList = Array.isArray(list) ? list : [list];
                        for (const item of compList) {
                            const name = item?.REMOTECMPNAME || item?.NAME;
                            if (name && typeof name === "string") {
                                companyName = name;
                                break;
                            }
                        }
                    }
                    if (companyName && typeof companyName === "string") break;
                }
            }

            if (typeof companyName === "object" || !companyName) {
                companyName = "Unknown Company";
            } else {
                companyName = String(companyName).trim();
            }
        }

        // console.log("DEBUG STOCK SUMMARY DATA:", JSON.stringify(data).slice(0, 1000));
        const envelope = data?.ENVELOPE || {};

        let names = envelope.DSPACCNAME || [];
        if (!Array.isArray(names)) names = [names];

        let info = envelope.DSPSTKINFO || [];
        if (!Array.isArray(info)) info = [info];

        const summary = [];
        const length = Math.max(names.length, info.length);

        for (let i = 0; i < length; i++) {
            const nameObj = names[i];
            const infoObj = info[i];

            const name = nameObj?.DSPDISPNAME || nameObj || null;
            if (!name) continue;

            const stockCl = infoObj?.DSPSTKCL || {};
            const quantity = stockCl.DSPCLQTY || null;
            const rate = stockCl.DSPCLRATE || null;
            const value = stockCl.DSPCLAMTA || stockCl.DSPCLVAL || null;

            // Clean value to represent absolute value as shown in Tally UI
            let cleanValue = value;
            if (value && !isNaN(Number(value))) {
                cleanValue = Math.abs(Number(value)).toString();
            }

            summary.push({
                name: String(name).trim(),
                quantity: quantity ? String(quantity).trim() : null,
                rate: rate ? String(rate).trim() : null,
                value: cleanValue ? String(cleanValue).trim() : null
            });
        }

        res.json({
            report: "Stock Summary",
            company: companyName,
            from,
            to,
            count: summary.length,
            items: summary,
            raw: envelope
        });
    } catch (err) {
        console.error("STOCK SUMMARY ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/stock-summary-by-godown ──────────────────
router.get("/reports/stock-summary-by-godown", async (req, res) => {
    try {
        // 1. Fetch active godowns from Tally
        const godownsXml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Godowns</ACCOUNTTYPE></STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        const godownsData = await sendToTally(godownsXml);
        let messages = godownsData?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];

        const godowns = [];
        for (const msg of messages) {
            if (!msg.GODOWN) continue;
            const g = msg.GODOWN;
            const name = g?.$?.NAME || g?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) godowns.push(name);
        }

        // 2. Build TDL collection request with computed godown values
        let computeBlocks = "";
        let fetchFields = "Name, ClosingBalance";

        godowns.forEach((gName, index) => {
            const tag = `G_${index}`;
            computeBlocks += `            <COMPUTE>${tag} : $$GodownItemValue:"${gName}":$Name:$ClosingBalance</COMPUTE>\n`;
            fetchFields += `, ${tag}`;
        });

        const collectionXml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>GodownWiseStock</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="GodownWiseStock">
            <TYPE>StockItem</TYPE>
${computeBlocks}            <FETCH>${fetchFields}</FETCH>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

        // 3. Query Tally & parse the response
        const responseData = await sendToTally(collectionXml);
        const collectionData = responseData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.STOCKITEM || [];
        const stockItemsList = Array.isArray(collectionData) ? collectionData : [collectionData];

        const summary = [];
        for (const item of stockItemsList) {
            if (!item) continue;

            const name = item?.$?.NAME || item?.NAME;
            if (!name) continue;

            let totalQty = "";
            if (item.CLOSINGBALANCE) {
                if (typeof item.CLOSINGBALANCE === "object") {
                    totalQty = item.CLOSINGBALANCE._ || "";
                } else {
                    totalQty = item.CLOSINGBALANCE;
                }
            }

            const breakdown = {};
            godowns.forEach((gName, index) => {
                const tag = `G_${index}`;
                let qty = item?.[tag.toUpperCase()] || "0";
                if (qty && typeof qty === "object") {
                    qty = qty._ || "0";
                }
                breakdown[gName] = String(qty).trim();
            });

            summary.push({
                name: String(name).trim(),
                totalQuantity: String(totalQty).trim(),
                breakdown
            });
        }

        res.json({
            report: "Stock Summary (Godown Wise)",
            count: summary.length,
            items: summary
        });
    } catch (err) {
        console.error("STOCK SUMMARY GODOWN-WISE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/day-book ──────────────────────────────────
router.get("/reports/day-book", async (req, res) => {
    // Dynamic default date range (current Indian Financial Year)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-indexed
    const currentDay = today.getDate();

    let finYearStartYear = today.getMonth() >= 3 ? currentYear : currentYear - 1; // April is index 3
    const defaultFrom = `${finYearStartYear}0401`;
    const defaultTo = `${currentYear}${String(currentMonth).padStart(2, "0")}${String(currentDay).padStart(2, "0")}`;

    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;
    try {
        const data = await fetchReport("Day Book", from, to);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];

        const vouchers = [];
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            vouchers.push({
                type: v.VOUCHERTYPENAME,
                number: v.VOUCHERNUMBER,
                date: v.DATE,
                narration: v.NARRATION || null
            });
        }
        res.json({ report: "Day Book", count: vouchers.length, vouchers });
    } catch (err) {
        console.error("DAY BOOK ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/outstanding/receivables ───────────────────
router.get("/reports/outstanding/receivables", async (req, res) => {
    try {
        const data = await fetchReport("Bills Receivable", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Outstanding Receivables", data: body });
    } catch (err) {
        console.error("RECEIVABLES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/outstanding/payables ──────────────────────
router.get("/reports/outstanding/payables", async (req, res) => {
    try {
        const data = await fetchReport("Bills Payable", req.query.from, req.query.to);
        const body = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA || data?.ENVELOPE?.BODY || {};
        res.json({ report: "Outstanding Payables", data: body });
    } catch (err) {
        console.error("PAYABLES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/ledger/:name ──────────────────────────────
router.get("/reports/ledger/:name", async (req, res) => {
    const ledgerName = decodeURIComponent(req.params.name);
    
    // Dynamic default date range (current Indian Financial Year)
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-indexed
    const currentDay = today.getDate();

    let finYearStartYear = today.getMonth() >= 3 ? currentYear : currentYear - 1; // April is index 3
    const defaultFrom = `${finYearStartYear}0401`;
    const defaultTo = `${currentYear}${String(currentMonth).padStart(2, "0")}${String(currentDay).padStart(2, "0")}`;

    const from = req.query.from || defaultFrom;
    const to = req.query.to || defaultTo;

    // 1. XML for ledger vouchers (transactions)
    const vouchersXml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledger Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
          <LEDGERNAME>${ledgerName}</LEDGERNAME>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    // 2. XML for period opening and closing balances
    const balancesXml = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>LedgerBalances</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>${from}</SVFROMDATE>
        <SVTODATE>${to}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="LedgerBalances">
            <TYPE>Ledger</TYPE>
            <FILTER>LedgerFilter</FILTER>
            <COMPUTE>PeriodOpBal: $OpeningBalance</COMPUTE>
            <COMPUTE>PeriodClBal: $ClosingBalance</COMPUTE>
            <FETCH>Name, PeriodOpBal, PeriodClBal</FETCH>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="LedgerFilter">$Name = "${ledgerName}"</SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    try {
        // Run both queries in parallel
        const [vouchersData, balancesData] = await Promise.all([
            sendToTally(vouchersXml),
            sendToTally(balancesXml).catch(err => {
                console.error("Error fetching ledger balances:", err.message);
                return null;
            })
        ]);

        // Parse Vouchers
        const envelope = vouchersData?.ENVELOPE || {};
        let dates = envelope.DSPVCHDATE || [];
        if (!Array.isArray(dates)) dates = [dates];

        let accounts = envelope.DSPVCHLEDACCOUNT || [];
        if (!Array.isArray(accounts)) accounts = [accounts];

        let types = envelope.DSPVCHTYPE || [];
        if (!Array.isArray(types)) types = [types];

        let drAmts = envelope.DSPVCHDRAMT || [];
        if (!Array.isArray(drAmts)) drAmts = [drAmts];

        let crAmts = envelope.DSPVCHCRAMT || [];
        if (!Array.isArray(crAmts)) crAmts = [crAmts];

        const transactions = [];
        const length = dates.length;

        let totalDebit = 0;
        let totalCredit = 0;

        for (let i = 0; i < length; i++) {
            if (!dates[i]) continue;
            
            const dr = drAmts[i] ? String(drAmts[i]).trim() : null;
            const cr = crAmts[i] ? String(crAmts[i]).trim() : null;

            if (dr && !isNaN(Number(dr))) totalDebit += Math.abs(Number(dr));
            if (cr && !isNaN(Number(cr))) totalCredit += Math.abs(Number(cr));

            transactions.push({
                date: dates[i],
                particulars: accounts[i] || null,
                voucherType: types[i] || null,
                debit: dr,
                credit: cr
            });
        }

        // Parse Balances
        const ledgerObj = balancesData?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || {};
        
        let opBal = ledgerObj?.PERIODOPBAL?._ || ledgerObj?.PERIODOPBAL || "0.00";
        if (typeof opBal === "object") opBal = opBal._ || "0.00";
        opBal = String(opBal).trim();

        let clBal = ledgerObj?.PERIODCLBAL?._ || ledgerObj?.PERIODCLBAL || "0.00";
        if (typeof clBal === "object") clBal = clBal._ || "0.00";
        clBal = String(clBal).trim();

        res.json({
            ledger: ledgerName,
            from,
            to,
            openingBalance: opBal,
            closingBalance: clBal,
            currentTotalDebit: totalDebit.toFixed(2),
            currentTotalCredit: totalCredit.toFixed(2),
            count: transactions.length,
            transactions
        });
    } catch (err) {
        console.error("LEDGER REPORT ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /reports/ledgers-summary-by-period ────────────────
router.get("/reports/ledgers-summary-by-period", async (req, res) => {
    try {
        const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
        const from = req.query.from || defaultFrom;
        const to = req.query.to || defaultTo;

        // 1. Fetch ledger names from List of Accounts (to establish the full list of ledgers)
        const ledgersXml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        // 2. Fetch detailed transaction/balance data from Trial Balance
        const tbXml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${from}</SVFROMDATE>
          <SVTODATE>${to}</SVTODATE>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <EXPLODEALLLEVELS>Yes</EXPLODEALLLEVELS>
          <DSPSHOWTRANS>Yes</DSPSHOWTRANS>
          <DSPSHOWOPENING>Yes</DSPSHOWOPENING>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        const [ledgersData, tbData] = await Promise.all([
            sendToTally(ledgersXml),
            sendToTally(tbXml)
        ]);

        // Parse Ledger Names and initialize the baseline map
        let messages = ledgersData?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || ledgersData?.ENVELOPE?.BODY?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];

        const summaryMap = new Map();
        for (const msg of messages) {
            if (msg.LEDGER) {
                const name = msg.LEDGER?.$?.NAME || msg.LEDGER?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME || msg.LEDGER?.NAME;
                if (name) {
                    const trimmedName = String(name).trim();
                    summaryMap.set(trimmedName, {
                        name: trimmedName,
                        openingBalance: "0.00",
                        closingBalance: "0.00",
                        currentTotalDebit: "0.00",
                        currentTotalCredit: "0.00"
                    });
                }
            }
        }

        // Parse Trial Balance
        const envelope = tbData?.ENVELOPE || {};
        let names = envelope.DSPACCNAME || [];
        if (!Array.isArray(names)) names = [names];

        let info = envelope.DSPACCINFO || [];
        if (!Array.isArray(info)) info = [info];

        const length = Math.max(names.length, info.length);

        for (let i = 0; i < length; i++) {
            const nameObj = names[i];
            const infoObj = info[i] || {};

            const name = nameObj?.DSPDISPNAME || nameObj || null;
            if (!name) continue;

            const trimmedName = String(name).trim();

            // Only update if this account name is in our list of ledgers
            if (summaryMap.has(trimmedName)) {
                // Parse Opening Balance
                let opAmt = infoObj.DSPOPAMT?.DSPOPAMTA || "0.00";
                if (typeof opAmt === "object") opAmt = opAmt._ || "0.00";

                // Parse Debit
                let drAmt = infoObj.DSPDRAMT?.DSPDRAMTA || "0.00";
                if (typeof drAmt === "object") drAmt = drAmt._ || "0.00";

                // Parse Credit
                let crAmt = infoObj.DSPCRAMT?.DSPCRAMTA || "0.00";
                if (typeof crAmt === "object") crAmt = crAmt._ || "0.00";

                // Parse Closing Balance
                let clAmt = infoObj.DSPCLAMT?.DSPCLAMTA || "0.00";
                if (typeof clAmt === "object") clAmt = clAmt._ || "0.00";

                // Clean Tally's potential minus sign on Debit/Credit transaction amounts
                const cleanDr = drAmt ? Math.abs(Number(drAmt)).toFixed(2) : "0.00";
                const cleanCr = crAmt ? Math.abs(Number(crAmt)).toFixed(2) : "0.00";

                summaryMap.set(trimmedName, {
                    name: trimmedName,
                    openingBalance: String(opAmt).trim() || "0.00",
                    closingBalance: String(clAmt).trim() || "0.00",
                    currentTotalDebit: cleanDr,
                    currentTotalCredit: cleanCr
                });
            }
        }

        const summary = Array.from(summaryMap.values());

        res.json({
            report: "All Ledgers Period Summary",
            from,
            to,
            count: summary.length,
            ledgers: summary
        });
    } catch (err) {
        console.error("LEDGERS PERIOD SUMMARY ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;