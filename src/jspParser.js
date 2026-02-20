function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFirstValue(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return undefined;
}

function tryJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function extractEmbeddedJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return tryJsonParse(text.slice(start, end + 1));
}

function findObjectByCartId(node, cartId) {
  if (!node) {
    return null;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findObjectByCartId(item, cartId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof node === "object") {
    const value = readFirstValue(node, ["cartid", "cartId", "cart_id", "courseCode", "course_code"]);
    if (value !== undefined && String(value).trim() === String(cartId).trim()) {
      return node;
    }
    for (const nested of Object.values(node)) {
      const found = findObjectByCartId(nested, cartId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function parseFromObject(obj) {
  const osValue = readFirstValue(obj, ["os", "openSeats", "open_seats"]);
  const codeValue = readFirstValue(obj, ["code", "courseName", "course_name", "name"]);
  const os = parseNumber(osValue);
  const courseName = codeValue ? String(codeValue).trim() : null;

  if (os === null) {
    return null;
  }

  return {
    os,
    courseName: courseName || "UNKNOWN_COURSE"
  };
}

function parseWithRegex(jspBody, cartId) {
  const cartIdText = String(cartId).trim();
  const cartIdIndex = jspBody.indexOf(cartIdText);
  if (cartIdIndex === -1) {
    return null;
  }

  const windowStart = Math.max(0, cartIdIndex - 1800);
  const windowEnd = Math.min(jspBody.length, cartIdIndex + 1800);
  const windowBody = jspBody.slice(windowStart, windowEnd);

  const osMatch = windowBody.match(/["']?os["']?\s*[:=]\s*["']?(-?\d+)/i);
  const codeMatch = windowBody.match(/["']?code["']?\s*[:=]\s*["']([^"']+)["']/i);
  if (!osMatch) {
    return null;
  }

  return {
    os: Number.parseInt(osMatch[1], 10),
    courseName: codeMatch ? codeMatch[1].trim() : "UNKNOWN_COURSE"
  };
}

function parseCourseFromJsp(jspBody, cartId) {
  const raw = String(jspBody || "");
  if (!raw.trim()) {
    throw new Error("JSP payload is empty.");
  }

  const direct = tryJsonParse(raw);
  const embedded = direct ? null : extractEmbeddedJsonArray(raw);
  const candidateJson = direct || embedded;
  if (candidateJson) {
    const matchObject = findObjectByCartId(candidateJson, cartId);
    if (matchObject) {
      const parsed = parseFromObject(matchObject);
      if (parsed) {
        return parsed;
      }
    }
  }

  const regexParsed = parseWithRegex(raw, cartId);
  if (regexParsed) {
    return regexParsed;
  }

  throw new Error(`Could not locate cartid ${cartId} with os in getClassData.jsp payload.`);
}

module.exports = {
  parseCourseFromJsp
};
