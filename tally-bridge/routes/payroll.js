const express = require("express");
const router = express.Router();
const { sendToTally } = require("../tallyClient");
const { parseTallyImportResponse, getDefaultFinYearRange } = require("../helpers/tallyHelper");

// ─── GET /employees ─────────────────────────────────────────
router.get("/employees", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Employees</ACCOUNTTYPE></STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.COSTCENTRE) continue;
            const e = msg.COSTCENTRE;
            const name = e?.$?.NAME || e?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({ name, category: e.CATEGORY || null });
        }
        res.json({ count: items.length, employees: items });
    } catch (err) {
        console.error("GET EMPLOYEES ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /employees ────────────────────────────────────────
router.post("/employees", async (req, res) => {
    const { name, category, designation, dateOfJoining } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COSTCENTRE NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
            <CATEGORY>${category || 'Primary Cost Category'}</CATEGORY>
            <FORPAYROLL>Yes</FORPAYROLL>
            ${designation ? `<DESIGNATION>${designation}</DESIGNATION>` : ''}
            ${dateOfJoining ? `<DATEOFJOINING>${dateOfJoining}</DATEOFJOINING>` : ''}
          </COSTCENTRE>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Employee created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST EMPLOYEE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /pay-heads ─────────────────────────────────────────
router.get("/pay-heads", async (req, res) => {
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES><ACCOUNTTYPE>Pay Heads</ACCOUNTTYPE></STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        let messages = data?.ENVELOPE?.BODY?.IMPORTDATA?.REQUESTDATA?.TALLYMESSAGE || [];
        if (!Array.isArray(messages)) messages = [messages];
        const items = [];
        for (const msg of messages) {
            if (!msg.PAYHEAD) continue;
            const p = msg.PAYHEAD;
            const name = p?.$?.NAME || p?.["LANGUAGENAME.LIST"]?.["NAME.LIST"]?.NAME;
            if (name) items.push({
                name,
                payType: p.PAYTYPE || null,
                computationType: p.COMPUTATIONTYPE || null
            });
        }
        res.json({ count: items.length, payHeads: items });
    } catch (err) {
        console.error("GET PAY HEADS ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /pay-heads ────────────────────────────────────────
router.post("/pay-heads", async (req, res) => {
    const { name, payType, computationType } = req.body;
    if (!name || !payType) return res.status(400).json({ error: "name and payType are required" });
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>All Masters</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <PAYHEAD NAME="${name}" ACTION="Create">
            <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
            <PAYTYPE>${payType}</PAYTYPE>
            ${computationType ? `<COMPUTATIONTYPE>${computationType}</COMPUTATIONTYPE>` : ''}
          </PAYHEAD>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
    try {
        const data = await sendToTally(xml);
        const result = parseTallyImportResponse(data);
        if (!result.success) return res.status(400).json({ error: result.error, tally: result.tally });
        res.json({ message: "Pay Head created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST PAY HEAD ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /attendance ────────────────────────────────────────
router.get("/attendance", async (req, res) => {
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
        const records = [];
        for (const msg of messages) {
            if (!msg.VOUCHER) continue;
            const v = msg.VOUCHER;
            if (v.VOUCHERTYPENAME !== "Attendance") continue;
            records.push({
                date: v.DATE,
                number: v.VOUCHERNUMBER,
                narration: v.NARRATION || null
            });
        }
        res.json({ count: records.length, attendance: records });
    } catch (err) {
        console.error("GET ATTENDANCE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /attendance ───────────────────────────────────────
router.post("/attendance", async (req, res) => {
    const { date, employee, attendanceType, value } = req.body;
    if (!date || !employee || !attendanceType) {
        return res.status(400).json({ error: "date, employee, and attendanceType are required" });
    }
    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Attendance" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Attendance</VOUCHERTYPENAME>
            <ATTENDANCEENTRIES.LIST>
              <EMPLOYEENAME>${employee}</EMPLOYEENAME>
              <ATTENDANCETYPE>${attendanceType}</ATTENDANCETYPE>
              <ATTENDANCEVALUE>${value || 1}</ATTENDANCEVALUE>
            </ATTENDANCEENTRIES.LIST>
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
        res.json({ message: "Attendance recorded", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST ATTENDANCE ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /payroll-vouchers ─────────────────────────────────
router.post("/payroll-vouchers", async (req, res) => {
    const { date, employee, payHeadEntries, narration } = req.body;
    if (!date || !employee || !payHeadEntries || !Array.isArray(payHeadEntries)) {
        return res.status(400).json({ error: "date, employee, and payHeadEntries array are required" });
    }

    let entriesXml = "";
    for (const entry of payHeadEntries) {
        entriesXml += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${entry.payHead}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${entry.isEarning ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${entry.isEarning ? '-' : ''}${Math.abs(entry.amount)}</AMOUNT>
              <EMPLOYEENAME>${employee}</EMPLOYEENAME>
            </ALLLEDGERENTRIES.LIST>`;
    }

    const xml = `
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payroll" ACTION="Create">
            <DATE>${date}</DATE>
            <VOUCHERTYPENAME>Payroll</VOUCHERTYPENAME>
            ${narration ? `<NARRATION>${narration}</NARRATION>` : ''}
            ${entriesXml}
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
        res.json({ message: "Payroll voucher created", created: result.created, tally: result.tally });
    } catch (err) {
        console.error("POST PAYROLL VOUCHER ERROR:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
