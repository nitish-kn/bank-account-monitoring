const { sendToTally } = require("../tallyClient");

// Helper: extract Tally import errors from the response
function parseTallyImportResponse(data) {
    const resp = data?.RESPONSE || data?.ENVELOPE?.RESPONSE;
    if (!resp) return { success: true, raw: data };
    const exceptions = parseInt(resp.EXCEPTIONS || "0", 10);
    const errors = parseInt(resp.ERRORS || "0", 10);
    const lineError = resp.LINEERROR || null;
    if (exceptions > 0 || errors > 0 || lineError) {
        return {
            success: false,
            error: lineError || `Tally returned ${exceptions} exception(s), ${errors} error(s)`,
            tally: resp
        };
    }
    return { success: true, created: parseInt(resp.CREATED || "0", 10), altered: parseInt(resp.ALTERED || "0", 10), tally: resp };
}

// Helper: fetch active company name from Tally
async function getActiveCompany() {
    const xml = `
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

    const data = await sendToTally(xml);
    const body = data?.ENVELOPE?.BODY || {};
    let companyName = body?.IMPORTDATA?.REQUESTDESC?.STATICVARIABLES?.SVCURRENTCOMPANY;
    
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

    return companyName;
}

// Helper: calculate the current Indian Financial Year (from April 1st to March 31st)
function getDefaultFinYearRange() {
    const today = new Date();
    // Using Asia/Kolkata time zone for consistent Indian Financial Year calculation
    const options = { timeZone: "Asia/Kolkata", year: "numeric", month: "numeric" };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(today);

    let yearStr = "";
    let monthStr = "";
    for (const part of parts) {
        if (part.type === "year") yearStr = part.value;
        if (part.type === "month") monthStr = part.value;
    }

    const currentYear = parseInt(yearStr, 10);
    const currentMonth = parseInt(monthStr, 10); // 1-indexed (1-12)

    let startYear;
    if (currentMonth >= 4) { // April (4) to December (12)
        startYear = currentYear;
    } else { // January (1) to March (3)
        startYear = currentYear - 1;
    }

    const endYear = startYear + 1;
    const fromDate = `${startYear}0401`;
    const toDate = `${endYear}0331`;

    return { from: fromDate, to: toDate };
}

module.exports = { parseTallyImportResponse, getActiveCompany, getDefaultFinYearRange };

