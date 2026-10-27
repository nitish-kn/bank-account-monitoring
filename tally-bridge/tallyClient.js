const http = require("http");
const xml2js = require("xml2js");

const REQUEST_TIMEOUT_MS = 60000;

function send(xml, parserOptions = {}) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(xml, "utf8");

    const options = {
      hostname: "127.0.0.1",
      port: process.env.TALLY_PORT || 9000,
      path: "/",
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "Content-Length": payload.length
      }
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", async () => {
        const buffer = Buffer.concat(chunks);

        console.log("─── RAW TALLY RESPONSE DEBUG ───");
        console.log("Buffer Length:", buffer.length);
        console.log("Hex (first 40 bytes):", buffer.slice(0, 40).toString("hex"));

        let data = "";
        let isUtf16 = false;
        let isUtf16be = false;

        if (buffer.length >= 2) {
          if (buffer[0] === 0xff && buffer[1] === 0xfe) {
            isUtf16 = true;
          } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
            isUtf16be = true;
          } else if (buffer[1] === 0x00) {
            isUtf16 = true;
          } else if (buffer[0] === 0x00) {
            isUtf16be = true;
          }
        }

        console.log("Detected isUtf16:", isUtf16, "isUtf16be:", isUtf16be);

        if (isUtf16) {
          data = buffer.toString("utf16le");
        } else if (isUtf16be) {
          data = buffer.swap16().toString("utf16le");
        } else {
          data = buffer.toString("utf8");
        }

        data = data
          .replace(/^\uFEFF/, "")
          .replace(/^\uFFFE/, "")
          .replace(/\0/g, "")
          .trim();

        const firstTagIndex = data.indexOf("<");
        if (firstTagIndex !== -1) {
          data = data.substring(firstTagIndex);
        } else {
          return reject(new Error(`Tally returned non-XML response: "${data.slice(0, 150)}"`));
        }

        const parser = new xml2js.Parser({
          explicitArray: false,
          ignoreAttrs: false,
          ...parserOptions
        });


        try {
          const result = await parser.parseStringPromise(data);
          resolve(result);
        } catch (err) {
          console.error("─── TALLY XML PARSE ERROR DEBUG ───");
          console.error("Buffer Length:", buffer.length);
          console.error("Decoded Data Length:", data.length);
          console.error("Data Start (first 200 chars):", JSON.stringify(data.slice(0, 200)));
          console.error("Data End (last 200 chars):", JSON.stringify(data.slice(-200)));
          console.error("───────────────────────────────────");
          reject(err);
        }
      });
    });

    // Without this a hung Tally would block every request queued behind it.
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`Tally did not respond within ${REQUEST_TIMEOUT_MS / 1000}s`)));
    req.on("error", (err) => reject(err));
    req.write(payload);
    req.end();
  });
}

// Tally answers one request at a time, so requests wait here in order instead of piling up on it.
let queue = Promise.resolve();

// Results of read-only requests, kept in memory by request XML (so company, report and dates are all
// part of the key). The promise is stored, so identical requests made meanwhile share one Tally call.
// Lost on restart; ponytail: per-process, so run a single bridge instance.
const cache = new Map();

function clearCache() {
  cache.clear();
}

// `cacheMs` > 0 caches an Export request for that long. Import requests change Tally, so they empty the cache.
function sendToTally(xml, parserOptions = {}, cacheMs = 0) {
  const isExport = xml.includes("<TALLYREQUEST>Export");
  const key = cacheMs > 0 && isExport ? `${xml}|${JSON.stringify(parserOptions)}` : null;

  if (key) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.promise;
  }

  const run = () => send(xml, parserOptions);
  const promise = queue.then(run, run);
  queue = promise.catch(() => {});

  if (key) {
    cache.set(key, { expires: Date.now() + cacheMs, promise });
    promise.catch(() => cache.delete(key));
    // Drop expired entries so the map can't grow without bound.
    if (cache.size > 200) for (const [k, v] of cache) if (v.expires <= Date.now()) cache.delete(k);
  } else if (!isExport) {
    promise.finally(clearCache).catch(() => {});
  }
  return promise;
}

module.exports = { sendToTally, clearCache };
