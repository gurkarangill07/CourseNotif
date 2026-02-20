function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed;
}

function parseBoolEnv(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function readRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function loadConfig() {
  const sourceMode = (process.env.VSB_SOURCE_MODE || "db").trim().toLowerCase();
  if (!["browser", "filesystem", "db"].includes(sourceMode)) {
    throw new Error("VSB_SOURCE_MODE must be one of: browser, filesystem, db");
  }

  return {
    databaseUrl: readRequiredEnv("DATABASE_URL"),
    monitorIntervalSeconds: parseIntEnv(process.env.MONITOR_INTERVAL_SECONDS, 60),
    ownerAlertEmail: process.env.OWNER_ALERT_EMAIL || process.env.ADMIN_ALERT_EMAIL || null,
    sessionDurationMinutes: parseIntEnv(process.env.SESSION_DURATION_MINUTES, 90),
    vsbSourceMode: sourceMode,
    jspSourceDir: process.env.JSP_SOURCE_DIR || null,
    vsbUrl: process.env.VSB_URL || null,
    vsbUserDataDir: process.env.VSB_USER_DATA_DIR || ".data/vsb-profile",
    vsbHeadless: parseBoolEnv(process.env.VSB_HEADLESS, false),
    vsbSearchSelector:
      process.env.VSB_SEARCH_SELECTOR ||
      "input[type='search'], input[name*='search'], input[id*='search']",
    vsbDropdownOptionSelector:
      process.env.VSB_DROPDOWN_OPTION_SELECTOR ||
      "[role='option'], .dropdown-item, .ui-menu-item, li",
    vsbLoggedOutSelector:
      process.env.VSB_LOGGED_OUT_SELECTOR ||
      "input[type='password'], form[action*='login'], button[type='submit']",
    vsbSearchTimeoutMs: parseIntEnv(process.env.VSB_SEARCH_TIMEOUT_MS, 15000),
    vsbDropdownTimeoutMs: parseIntEnv(process.env.VSB_DROPDOWN_TIMEOUT_MS, 10000),
    vsbCaptureWaitMs: parseIntEnv(process.env.VSB_CAPTURE_WAIT_MS, 2000),
    vsbLoginWaitSeconds: parseIntEnv(process.env.VSB_LOGIN_WAIT_SECONDS, 600),
    vsbRefreshIntervalMinutes: parseIntEnv(
      process.env.VSB_REFRESH_INTERVAL_MINUTES,
      15
    )
  };
}

module.exports = {
  loadConfig
};
