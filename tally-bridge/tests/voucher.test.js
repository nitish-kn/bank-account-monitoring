const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseStringPromise } = require("xml2js");
const client = require("../tallyClient");

let sentXml;
client.sendToTally = async (xml) => {
  sentXml = xml;
  return { RESPONSE: { CREATED: "1" } };
};
const router = require("../routes/accounting");
const createVoucher = router.stack.find((layer) => layer.route?.path === "/vouchers" && layer.route.methods.post).route.stack[0].handle;

async function request(date) {
  sentXml = null;
  const response = {
    code: 200,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await createVoucher({ body: {
    date, type: "Receipt", narration: "Test",
    entries: [
      { ledger: "Bank", amount: 500, isDebit: true },
      { ledger: "Sales", amount: 500, isDebit: false },
    ],
  } }, response);
  return response;
}

test("Receipt XML preserves voucher and effective dates and accounting view", async () => {
  const response = await request("20240401");
  assert.equal(response.code, 200);
  assert.equal(response.body.created, 1);
  const parsed = await parseStringPromise(sentXml, { explicitArray: false });
  const voucher = parsed.ENVELOPE.BODY.IMPORTDATA.REQUESTDATA.TALLYMESSAGE.VOUCHER;
  assert.equal(voucher.DATE, "20240401");
  assert.equal(voucher.EFFECTIVEDATE, "20240401");
  assert.equal(voucher.$.OBJVIEW, "Accounting Voucher View");
  assert.equal(voucher.PERSISTEDVIEW, "Accounting Voucher View");
  assert.equal(voucher.ISINVOICE, "No");
});

test("Invalid dates are rejected before reaching Tally", async () => {
  for (const date of [undefined, "2026-10-01", "20260230", "20261301", "20260000"]) {
    assert.equal((await request(date)).code, 400);
    assert.equal(sentXml, null);
  }
  assert.equal((await request("20240229")).code, 200);
});
