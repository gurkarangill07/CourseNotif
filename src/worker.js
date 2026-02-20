const { loadConfig } = require("./config");
const { createDb } = require("./db");
const notifier = require("./notification");
const { createVsbSource } = require("./vsbSource");
const {
  monitorOnce,
  runImmediateCheckForNewCourse
} = require("./monitorService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCliArgs(argv) {
  const args = {
    once: false,
    initLogin: false,
    checkNewCourse: null
  };

  if (argv.includes("--once")) {
    args.once = true;
  }
  if (argv.includes("--init-login")) {
    args.initLogin = true;
  }

  const idx = argv.indexOf("--check-new-course");
  if (idx !== -1) {
    const userId = argv[idx + 1];
    const cartId = argv[idx + 2];
    if (!userId || !cartId) {
      throw new Error("Usage: --check-new-course <userId> <cartId>");
    }
    const parsedUserId = Number.parseInt(userId, 10);
    if (Number.isNaN(parsedUserId) || parsedUserId <= 0) {
      throw new Error("userId must be a positive integer.");
    }
    args.checkNewCourse = {
      userId: parsedUserId,
      cartId: String(cartId).trim()
    };
  }

  return args;
}

async function run() {
  const config = loadConfig();
  const db = createDb({ databaseUrl: config.databaseUrl });
  await db.ensureCompatibility();
  const vsbSource = createVsbSource(db, config);
  const args = parseCliArgs(process.argv.slice(2));

  try {
    if (args.initLogin) {
      const result = await vsbSource.initLoginSession();
      console.log(`[worker] init-login result=${JSON.stringify(result)}`);
      return;
    }

    if (args.checkNewCourse) {
      const result = await runImmediateCheckForNewCourse({
        db,
        vsbSource,
        notifier,
        ownerAlertEmail: config.ownerAlertEmail,
        userId: args.checkNewCourse.userId,
        cartId: args.checkNewCourse.cartId
      });
      console.log(`[worker] immediate-check result=${JSON.stringify(result)}`);
      return;
    }

    if (args.once) {
      const summary = await monitorOnce({
        db,
        vsbSource,
        notifier,
        ownerAlertEmail: config.ownerAlertEmail
      });
      console.log(`[worker] once summary=${JSON.stringify(summary)}`);
      return;
    }

    while (true) {
      const summary = await monitorOnce({
        db,
        vsbSource,
        notifier,
        ownerAlertEmail: config.ownerAlertEmail
      });
      console.log(`[worker] loop summary=${JSON.stringify(summary)}`);
      await sleep(config.monitorIntervalSeconds * 1000);
    }
  } finally {
    if (typeof vsbSource.close === "function") {
      await vsbSource.close();
    }
    await db.close();
  }
}

run().catch((error) => {
  console.error(`[worker] fatal: ${error.message}`);
  process.exit(1);
});
