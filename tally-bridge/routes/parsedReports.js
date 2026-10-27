const express = require("express");
const router = express.Router();
const { sendToTally, clearCache } = require("../tallyClient");
const { getDefaultFinYearRange, getActiveCompany } = require("../helpers/tallyHelper");

// How long read-only report results are reused. Lists of masters change rarely; reports can move
// whenever someone posts a voucher in Tally, so they stay short. `?refresh=1` empties the cache first.
const REPORT_CACHE_MS = 30 * 1000;
const LIST_CACHE_MS = 5 * 60 * 1000;

router.use((req, res, next) => {
    if (req.query.refresh === "1") clearCache();
    next();
});

const escapeXml = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Helper to fetch and parse a Tally report with clean JSON output
async function fetchReport(reportName, from, to, extraVars = "", parserOptions, company) {
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
          ${company ? `<SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>` : ''}
          ${extraVars}
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    const data = await sendToTally(xml, parserOptions, reportName === "List of Accounts" ? LIST_CACHE_MS : REPORT_CACHE_MS);
    // Tally answers bad requests (e.g. a company that isn't loaded) with <RESPONSE><LINEERROR>.
    if (data?.RESPONSE?.LINEERROR) throw Object.assign(new Error(text(data.RESPONSE.LINEERROR)), { status: 400 });
    return data;
}

// Tally sends YYYYMMDD; anything else would make it silently fall back to its own period.
function dateRange(query) {
    const { from: defaultFrom, to: defaultTo } = getDefaultFinYearRange();
    const from = query.from || defaultFrom;
    const to = query.to || defaultTo;
    if (!/^\d{8}$/.test(from) || !/^\d{8}$/.test(to)) throw Object.assign(new Error("from/to must be YYYYMMDD"), { status: 400 });
    return { from, to };
}

const text = (v) => String((typeof v === "object" ? v?._ : v) ?? "").trim();
const amount = (v) => (text(v) === "" ? null : Number(text(v)));

// Balance Sheet / P&L come as flat name/amount pairs (BSNAME+BSAMT, DSPACCNAME+PLAMT) whose
// order is the hierarchy, so they are parsed with preserveChildrenOrder. Groups carry the
// main amount, the ledgers/sub-groups under them the sub amount. Tally amounts: Dr positive, Cr negative.
async function fetchStatement(reportName, from, to, company) {
    const data = await fetchReport(reportName, from, to, "<EXPLODEFLAG>Yes</EXPLODEFLAG>",
        { explicitChildren: true, preserveChildrenOrder: true }, company);
    const rows = [];
    let name = null;
    for (const node of data?.ENVELOPE?.$$ || []) {
        if (node["#name"] === "DSPACCNAME") name = text(node.DSPDISPNAME);
        else if (node["#name"] === "BSNAME") name = text(node.DSPACCNAME?.DSPDISPNAME);
        else if (name && (node["#name"] === "BSAMT" || node["#name"] === "PLAMT")) {
            const sub = amount(node.BSSUBAMT ?? node.PLSUBAMT);
            const main = amount(node.BSMAINAMT);
            // Lines with neither amount are empty (and can't be told apart as group or ledger).
            if (sub !== null || main !== null) rows.push({ name, amount: sub ?? main, isGroup: sub === null });
            name = null;
        }
    }
    return rows;
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

// ─── GET /reports/companies ─────────────────────────────────
// Every company loaded in Tally, plus the one currently open (what reports use when no `company` is given).
router.get("/reports/companies", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CmpList</ID></HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
      <TDL><TDLMESSAGE><COLLECTION NAME="CmpList" ISMODIFY="No"><TYPE>Company</TYPE><FETCH>Name</FETCH></COLLECTION></TDLMESSAGE></TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
    try {
        const [data, active] = await Promise.all([sendToTally(xml, {}, LIST_CACHE_MS), getActiveCompany(LIST_CACHE_MS)]);
        const companies = [].concat(data?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY || [])
            .map((c) => text(c?.NAME) || c?.$?.NAME).filter(Boolean);
        res.json({ companies, active: active === "Unknown Company" ? null : active });
    } catch (err) {
        console.error("COMPANIES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// Tally's XML export names its tags the opposite way round: the "...DR..." tags hold credits and the
// "...CR..." tags hold debits (verified against the Balance Sheet and cash/bank position). Balances
// (opening/closing/net) are Dr positive, Cr negative. These read a debit/credit pair as positive numbers.
const debitOf = (crTag) => Math.abs(amount(crTag) || 0);
const creditOf = (drTag) => Math.abs(amount(drTag) || 0);

// Names of the primary groups (no parent) - what the Trial Balance is totalled on.
async function fetchPrimaryGroups(company) {
    const data = await fetchReport("List of Accounts", null, null, "", undefined, company);
    return new Set([].concat(data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [])
        .filter((msg) => msg?.GROUP && !text(msg.GROUP.PARENT))
        .map(({ GROUP: g }) => g?.$?.NAME || text(g?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME)));
}

// Trial Balance is a flat DSPACCNAME + DSPACCINFO list: each primary group followed by what is under it.
async function fetchTrialBalance(from, to, company) {
    const [data, primary] = await Promise.all([
        fetchReport("Trial Balance", from, to, "", undefined, company),
        fetchPrimaryGroups(company),
    ]);
    const envelope = data?.ENVELOPE || {};
    const names = [].concat(envelope.DSPACCNAME || []);
    const info = [].concat(envelope.DSPACCINFO || []);
    return names
        .map((n, i) => {
            const name = text(n?.DSPDISPNAME ?? n);
            return {
                name,
                debit: debitOf(info[i]?.DSPCLCRAMT?.DSPCLCRAMTA),
                credit: creditOf(info[i]?.DSPCLDRAMT?.DSPCLDRAMTA),
                isGroup: primary.has(name),
            };
        })
        .filter((row) => row.debit || row.credit);
}

// Opening/closing balance of every ledger for a period, from the Trial Balance with openings shown.
// (The ledger collection's own $OpeningBalance/$ClosingBalance ignore the period.)
async function fetchLedgerBalances(from, to, company) {
    const data = await fetchReport("Trial Balance", from, to,
        "<EXPLODEFLAG>Yes</EXPLODEFLAG><EXPLODEALLLEVELS>Yes</EXPLODEALLLEVELS><DSPSHOWTRANS>Yes</DSPSHOWTRANS><DSPSHOWOPENING>Yes</DSPSHOWOPENING>",
        undefined, company);
    const envelope = data?.ENVELOPE || {};
    const names = [].concat(envelope.DSPACCNAME || []);
    const info = [].concat(envelope.DSPACCINFO || []);
    const balances = new Map();
    names.forEach((n, i) => balances.set(text(n?.DSPDISPNAME ?? n), {
        opening: amount(info[i]?.DSPOPAMT?.DSPOPAMTA) || 0,
        closing: amount(info[i]?.DSPCLAMT?.DSPCLAMTA) || 0,
    }));
    return balances;
}

// ─── GET /reports/trial-balance ─────────────────────────────
// Closing balances as on `to`; groups first, the rows under them after. Totals are the sums of the groups.
router.get("/reports/trial-balance", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        const rows = await fetchTrialBalance(from, to, req.query.company);
        const groups = rows.filter((row) => row.isGroup);
        const totalDebit = groups.reduce((sum, row) => sum + row.debit, 0);
        const totalCredit = groups.reduce((sum, row) => sum + row.credit, 0);
        res.json({ report: "Trial Balance", from, to, rows, totalDebit, totalCredit });
    } catch (err) {
        if (!err.status) console.error("TRIAL BALANCE ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/balance-sheet ─────────────────────────────
// Balance as on `to`; defaults to the current financial year.
router.get("/reports/balance-sheet", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        res.json({ report: "Balance Sheet", from, to, rows: await fetchStatement("Balance Sheet", from, to, req.query.company) });
    } catch (err) {
        if (!err.status) console.error("BALANCE SHEET ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/profit-loss ───────────────────────────────
router.get("/reports/profit-loss", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        res.json({ report: "Profit and Loss", from, to, rows: await fetchStatement("Profit and Loss", from, to, req.query.company) });
    } catch (err) {
        if (!err.status) console.error("P&L ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/cash-flow ─────────────────────────────────
// One row per month in the range: inflow = debits, outflow = credits, net = inflow - outflow.
router.get("/reports/cash-flow", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        const envelope = (await fetchReport("Cash Flow", from, to, "", undefined, req.query.company))?.ENVELOPE || {};
        const periods = [].concat(envelope.DSPPERIOD || []);
        const info = [].concat(envelope.DSPACCINFO || []);
        const rows = periods.map((period, i) => {
            const inflow = debitOf(info[i]?.DSPCRAMT?.DSPCRAMTA);
            const outflow = creditOf(info[i]?.DSPDRAMT?.DSPDRAMTA);
            return { period: text(period), inflow, outflow, net: inflow - outflow };
        });
        res.json({ report: "Cash Flow", from, to, rows });
    } catch (err) {
        if (!err.status) console.error("CASH FLOW ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/funds-flow ────────────────────────────────
// Same monthly layout as Tally's Funds Flow report: debit, credit and the net of the two.
router.get("/reports/funds-flow", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        const envelope = (await fetchReport("Funds Flow", from, to, "", undefined, req.query.company))?.ENVELOPE || {};
        const periods = [].concat(envelope.DSPPERIOD || []);
        const info = [].concat(envelope.DSPACCINFO || []);
        const rows = periods.map((period, i) => {
            const debit = debitOf(info[i]?.DSPCRAMT?.DSPCRAMTA);
            const credit = creditOf(info[i]?.DSPDRAMT?.DSPDRAMTA);
            return { period: text(period), debit, credit, net: debit - credit };
        });
        res.json({ report: "Funds Flow", from, to, rows });
    } catch (err) {
        if (!err.status) console.error("FUNDS FLOW ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/ratio-analysis ────────────────────────────
// RATIONAME/RATIOVALUE pairs. Values are display text ("1.53 : 1", "48.57 %", "14,74,508.00 Dr").
// Tally's Dr/Cr suffix on the amounts is the wrong way round (Cash-in-Hand, a debit balance on the Balance
// Sheet, comes back as "Cr"), so it is flipped here. Empty values and "(due till today)" notes are dropped.
router.get("/reports/ratio-analysis", async (req, res) => {
    try {
        const { from, to } = dateRange(req.query);
        const envelope = (await fetchReport("Ratio Analysis", from, to, "", undefined, req.query.company))?.ENVELOPE || {};
        const names = [].concat(envelope.RATIONAME || []);
        const values = [].concat(envelope.RATIOVALUE || []);
        const rows = [];
        names.forEach((n, i) => {
            const name = text(n);
            const value = text(values[i]);
            if (!name || name.startsWith("(") || !value) return;
            const isAmount = /\s(Dr|Cr)$/.test(value);
            rows.push({
                name,
                kind: isAmount ? "amount" : "ratio",
                value: isAmount ? value.replace(/(Dr|Cr)$/, (side) => (side === "Dr" ? "Cr" : "Dr")) : value,
            });
        });
        res.json({ report: "Ratio Analysis", from, to, rows });
    } catch (err) {
        if (!err.status) console.error("RATIO ANALYSIS ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/ledgers ───────────────────────────────────
// Ledger names + groups of one company (for ledger pickers).
router.get("/reports/ledgers", async (req, res) => {
    try {
        const data = await fetchReport("List of Accounts", null, null, "", undefined, req.query.company);
        const ledgers = [].concat(data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [])
            .filter((msg) => msg?.LEDGER)
            .map(({ LEDGER: l }) => ({
                name: l?.$?.NAME || text(l?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME),
                parent: text(l.PARENT) || null,
            }))
            .filter((l) => l.name)
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({ ledgers });
    } catch (err) {
        if (!err.status) console.error("LEDGERS ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
    }
});

// ─── GET /reports/stock-summary ─────────────────────────────
router.get("/reports/stock-summary", async (req, res) => {
    let from, to;
    try {
        ({ from, to } = dateRange(req.query));
    } catch (err) {
        return res.status(err.status).json({ error: err.message });
    }

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
// Statement of one ledger for a period. Opening/closing come from the Trial Balance (Dr positive, Cr
// negative); each transaction carries the running balance after it.
router.get("/reports/ledger/:name", async (req, res) => {
    const ledgerName = req.params.name;
    try {
        const { from, to } = dateRange(req.query);
        const { company } = req.query;
        const [vouchers, balances] = await Promise.all([
            fetchReport("Ledger Vouchers", from, to, `<LEDGERNAME>${escapeXml(ledgerName)}</LEDGERNAME>`, undefined, company),
            fetchLedgerBalances(from, to, company).catch((err) => {
                console.error("Error fetching ledger balances:", err.message);
                return new Map();
            }),
        ]);

        const envelope = vouchers?.ENVELOPE || {};
        const dates = [].concat(envelope.DSPVCHDATE || []);
        const accounts = [].concat(envelope.DSPVCHLEDACCOUNT || []);
        const types = [].concat(envelope.DSPVCHTYPE || []);
        const creditTags = [].concat(envelope.DSPVCHDRAMT || []);
        const debitTags = [].concat(envelope.DSPVCHCRAMT || []);

        const balance = balances.get(ledgerName);
        let running = balance ? balance.opening : null;
        let totalDebit = 0;
        let totalCredit = 0;
        const rows = dates.map((date, i) => {
            const debit = debitOf(debitTags[i]);
            const credit = creditOf(creditTags[i]);
            totalDebit += debit;
            totalCredit += credit;
            if (running !== null) running += debit - credit;
            return { date: text(date), particulars: text(accounts[i]) || null, voucherType: text(types[i]) || null, debit, credit, balance: running };
        });

        res.json({
            report: "Statement of Accounts",
            ledger: ledgerName,
            from,
            to,
            openingBalance: balance ? balance.opening : null,
            closingBalance: balance ? balance.closing : null,
            totalDebit,
            totalCredit,
            // Non-zero when Tally's Ledger Vouchers report left out vouchers its balances include.
            unlisted: balance ? Math.round((balance.closing - running) * 100) / 100 : 0,
            rows,
        });
    } catch (err) {
        if (!err.status) console.error("LEDGER REPORT ERROR:", err);
        res.status(err.status || 500).json({ error: err.message });
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