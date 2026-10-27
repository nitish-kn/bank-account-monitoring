const assert = require("node:assert/strict");
const http = require("node:http");
const { test, before, after } = require("node:test");

// A fake Tally that counts requests and how many run at once.
let server;
let hits = 0;
let running = 0;
let maxRunning = 0;
let client;

before(async () => {
  server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      hits += 1;
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      setTimeout(() => {
        running -= 1;
        res.end("<ENVELOPE><OK>1</OK></ENVELOPE>");
      }, 20);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.TALLY_PORT = server.address().port;
  client = require("../tallyClient");
});

after(() => server.close());

const exportXml = (name) => `<ENVELOPE><HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER><BODY>${name}</BODY></ENVELOPE>`;
const importXml = "<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER></ENVELOPE>";

test("identical cached requests share one Tally call", async () => {
  client.clearCache();
  hits = 0;
  await Promise.all([1, 2, 3, 4, 5].map(() => client.sendToTally(exportXml("a"), {}, 1000)));
  await client.sendToTally(exportXml("a"), {}, 1000);
  assert.equal(hits, 1);
});

test("different requests (e.g. another company) are not mixed up", async () => {
  client.clearCache();
  hits = 0;
  await client.sendToTally(exportXml("company-1"), {}, 1000);
  await client.sendToTally(exportXml("company-2"), {}, 1000);
  assert.equal(hits, 2);
});

test("requests without cacheMs are never cached", async () => {
  client.clearCache();
  hits = 0;
  await client.sendToTally(exportXml("b"));
  await client.sendToTally(exportXml("b"));
  assert.equal(hits, 2);
});

test("an Import request empties the cache", async () => {
  client.clearCache();
  await client.sendToTally(exportXml("c"), {}, 1000);
  hits = 0;
  await client.sendToTally(importXml);
  await new Promise((resolve) => setImmediate(resolve));
  await client.sendToTally(exportXml("c"), {}, 1000);
  assert.equal(hits, 2);
});

test("Tally only ever gets one request at a time", async () => {
  client.clearCache();
  maxRunning = 0;
  await Promise.all(["d", "e", "f", "g"].map((name) => client.sendToTally(exportXml(name))));
  assert.equal(maxRunning, 1);
});
