const path = require("path");

function toDate(input) {
  if (!input) {
    return new Date(0);
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return new Date(0);
  }
  return parsed;
}

function pickLatestJspFile(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }

  return files
    .slice()
    .sort((a, b) => toDate(b.generatedAt) - toDate(a.generatedAt))[0];
}

function mapDbJspRowToCandidate(row) {
  if (!row) {
    return null;
  }
  return {
    fileName: row.file_name,
    jspBody: row.jsp_body,
    sourcePath: row.source_path,
    payloadHash: row.payload_hash,
    generatedAt: row.generated_at || row.updated_at
  };
}

function isWithinRefreshWindow(dateLike, refreshWindowMs) {
  const ts = toDate(dateLike).getTime();
  if (ts <= 0) {
    return false;
  }
  return Date.now() - ts < refreshWindowMs;
}

function createVsbBrowserSource(db, config) {
  let context = null;
  let page = null;

  function requirePlaywright() {
    try {
      return require("playwright");
    } catch (_) {
      throw new Error(
        "Playwright is not installed. Run: npm install && npx playwright install chromium"
      );
    }
  }

  async function ensureBrowser() {
    if (context && page) {
      return;
    }
    if (!config.vsbUrl) {
      throw new Error("VSB_URL is required for browser automation mode.");
    }

    const { chromium } = requirePlaywright();
    const userDataDir = path.resolve(config.vsbUserDataDir);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: config.vsbHeadless
    });

    page = context.pages()[0] || (await context.newPage());
    if (page.url() === "about:blank") {
      await page.goto(config.vsbUrl, { waitUntil: "domcontentloaded" });
    }
  }

  async function isLoggedOutScreenVisible() {
    if (!config.vsbLoggedOutSelector) {
      return false;
    }
    try {
      return await page
        .locator(config.vsbLoggedOutSelector)
        .first()
        .isVisible({ timeout: 1000 });
    } catch (_) {
      return false;
    }
  }

  async function ensureSessionReady() {
    await ensureBrowser();
    if (!page.url().includes("http")) {
      await page.goto(config.vsbUrl, { waitUntil: "domcontentloaded" });
    }
    try {
      await page
        .locator(config.vsbSearchSelector)
        .first()
        .waitFor({ state: "visible", timeout: config.vsbSearchTimeoutMs });
    } catch (_) {
      if (await isLoggedOutScreenVisible()) {
        throw new Error("VSB session/login expired: login UI detected.");
      }
      throw new Error("VSB session/login required: search field not available.");
    }
  }

  async function withGetClassCapture(runActions) {
    const captured = [];
    const onResponse = async (response) => {
      const responseUrl = response.url();
      if (!responseUrl.toLowerCase().includes("getclassdata.jsp")) {
        return;
      }
      try {
        const jspBody = await response.text();
        captured.push({
          fileName: `getClassData-${Date.now()}.jsp`,
          jspBody,
          sourcePath: responseUrl,
          payloadHash: null,
          generatedAt: new Date()
        });
      } catch (error) {
        console.error(`[vsb] failed to read response body: ${error.message}`);
      }
    };

    page.on("response", onResponse);
    try {
      await runActions();
      await page.waitForTimeout(config.vsbCaptureWaitMs);
    } finally {
      page.off("response", onResponse);
    }
    return captured;
  }

  async function searchSelectAndRefresh(cartId) {
    const searchInput = page.locator(config.vsbSearchSelector).first();
    const cartIdText = String(cartId).trim();

    await searchInput.click({ timeout: config.vsbSearchTimeoutMs });
    await searchInput.fill("");
    await searchInput.fill(cartIdText);
    await page.waitForTimeout(350);

    const options = page.locator(config.vsbDropdownOptionSelector);
    try {
      await options
        .first()
        .waitFor({ state: "visible", timeout: config.vsbDropdownTimeoutMs });

      const matchingOption = options.filter({ hasText: cartIdText }).first();
      if ((await matchingOption.count()) > 0) {
        await matchingOption.click();
      } else {
        await options.first().click();
      }
    } catch (_) {
      await searchInput.press("Enter");
    }

    await page.waitForTimeout(300);
    await page.reload({ waitUntil: "domcontentloaded" });
  }

  async function collectGetClassDataCandidates({ cartId, forceRefresh = false } = {}) {
    const refreshWindowMs = config.vsbRefreshIntervalMinutes * 60 * 1000;
    const latestStored = await db.getSharedLatestJspFile();
    const latestStoredCandidate = mapDbJspRowToCandidate(latestStored);
    const hasFreshStoredFile =
      latestStoredCandidate &&
      isWithinRefreshWindow(latestStoredCandidate.generatedAt, refreshWindowMs);

    if (!forceRefresh && hasFreshStoredFile) {
      return [latestStoredCandidate];
    }

    await ensureSessionReady();

    const candidates = await withGetClassCapture(async () => {
      await searchSelectAndRefresh(cartId);
    });

    if (candidates.length === 0) {
      if (latestStoredCandidate) {
        return [latestStoredCandidate];
      }
      throw new Error("No getClassData.jsp response captured from VSB network.");
    }

    await db.markSharedSessionOk({
      sessionDurationMinutes: config.sessionDurationMinutes
    });

    return candidates;
  }

  async function initLoginSession() {
    await ensureBrowser();
    await page.goto(config.vsbUrl, { waitUntil: "domcontentloaded" });
    console.log(
      `[vsb] Login required. Please login in the opened browser window. Waiting up to ${config.vsbLoginWaitSeconds} seconds.`
    );

    await page
      .locator(config.vsbSearchSelector)
      .first()
      .waitFor({
        state: "visible",
        timeout: config.vsbLoginWaitSeconds * 1000
      });

    await db.markSharedSessionOk({
      sessionDurationMinutes: config.sessionDurationMinutes
    });
    return { status: "session_ok" };
  }

  async function close() {
    if (!context) {
      return;
    }
    await context.close();
    context = null;
    page = null;
  }

  return {
    collectGetClassDataCandidates,
    pickLatestJspFile,
    initLoginSession,
    close
  };
}

module.exports = {
  createVsbBrowserSource,
  pickLatestJspFile
};
