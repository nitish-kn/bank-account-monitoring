const crypto = require("crypto");

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to keep constant-time execution
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware for HTTP Basic Authentication.
 */
function basicAuth(req, res, next) {
  // Lets apps check Tally is up before the user has entered credentials; it exposes nothing else.
  if (req.method === "GET" && req.path === "/health") return next();

  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Tally Bridge API", charset="UTF-8"');
    return res.status(401).json({
      error: "Unauthorized: Missing or invalid Authorization header"
    });
  }

  try {
    const base64Credentials = authHeader.slice(6).trim();
    const decoded = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const colonIndex = decoded.indexOf(":");

    if (colonIndex === -1) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Tally Bridge API", charset="UTF-8"');
      return res.status(401).json({
        error: "Unauthorized: Invalid Authorization format"
      });
    }

    const username = decoded.substring(0, colonIndex);
    const password = decoded.substring(colonIndex + 1);

    const expectedUser = process.env.BASIC_AUTH_USER || process.env.AUTH_USER || "admin";
    const expectedPass = process.env.BASIC_AUTH_PASS || process.env.AUTH_PASS || "tally$7905";

    const isUserValid = safeCompare(username, expectedUser);
    const isPassValid = safeCompare(password, expectedPass);

    if (!isUserValid || !isPassValid) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Tally Bridge API", charset="UTF-8"');
      return res.status(401).json({
        error: "Unauthorized: Invalid username or password"
      });
    }

    // Attach authenticated user info to request
    req.user = { username };
    next();
  } catch (err) {
    res.setHeader("WWW-Authenticate", 'Basic realm="Tally Bridge API", charset="UTF-8"');
    return res.status(401).json({
      error: "Unauthorized: Failed to authenticate request"
    });
  }
}

module.exports = { basicAuth };
