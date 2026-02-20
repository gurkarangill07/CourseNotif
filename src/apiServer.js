const express = require("express");
const path = require("path");
const { loadConfig } = require("./config");
const { createDb } = require("./db");

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email || !email.includes("@") || !email.includes(".")) {
    return null;
  }
  return email;
}

function normalizeCartId(value) {
  const cartId = String(value || "").trim().toUpperCase();
  if (!cartId) {
    return null;
  }
  return cartId;
}

function mapTrackedCourseRow(row) {
  return {
    id: row.user_course_id,
    cartId: row.cart_id,
    courseName: row.course_name || row.cart_id,
    os: Number.isFinite(Number(row.os)) ? Number(row.os) : 0,
    createdAt: row.created_at
  };
}

async function main() {
  const config = loadConfig();
  const db = createDb({ databaseUrl: config.databaseUrl });
  const app = express();
  const port = Number.parseInt(process.env.PORT || "3000", 10);

  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/users/resolve", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body && req.body.email);
      if (!email) {
        return res.status(400).json({ error: "Valid email is required." });
      }

      const user = await db.getOrCreateUserByEmail(email);
      return res.json({
        user: {
          id: user.id,
          email: user.email
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/tracked-courses", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.query.email);
      if (!email) {
        return res.status(400).json({ error: "Valid email query is required." });
      }

      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.json({ items: [] });
      }

      const items = await db.listTrackedCoursesByUser(user.id);
      return res.json({ items: items.map(mapTrackedCourseRow) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/tracked-courses", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.body && req.body.email);
      const cartId = normalizeCartId(req.body && req.body.cartId);
      if (!email) {
        return res.status(400).json({ error: "Valid email is required." });
      }
      if (!cartId) {
        return res.status(400).json({ error: "cartId is required." });
      }

      const user = await db.getOrCreateUserByEmail(email);
      await db.ensureCourseExists(cartId);
      const inserted = await db.trackCourseForUser({ userId: user.id, cartId });
      const tracked = await db.getTrackedCourseByUserAndCart(user.id, cartId);

      return res.status(inserted ? 201 : 200).json({
        created: Boolean(inserted),
        item: {
          id: tracked.user_course_id,
          cartId: tracked.cart_id,
          courseName: tracked.course_name || tracked.cart_id,
          os: Number.isFinite(Number(tracked.os)) ? Number(tracked.os) : 0
        }
      });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/tracked-courses/:id", async (req, res, next) => {
    try {
      const email = normalizeEmail(req.query.email);
      const userCourseId = Number.parseInt(req.params.id, 10);
      if (!email) {
        return res.status(400).json({ error: "Valid email query is required." });
      }
      if (Number.isNaN(userCourseId) || userCourseId <= 0) {
        return res.status(400).json({ error: "Valid user course id is required." });
      }

      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      const deletedRows = await db.stopTrackingUserCourseForUser({
        userCourseId,
        userId: user.id
      });
      if (!deletedRows) {
        return res.status(404).json({ error: "Tracked course not found." });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  });

  app.get("/", (_req, res) => {
    res.sendFile(path.join(process.cwd(), "index.html"));
  });

  app.use("/src", express.static(path.join(process.cwd(), "src"), { index: false }));

  app.use((err, _req, res, _next) => {
    console.error(`[api] ${err.stack || err.message}`);
    res.status(500).json({ error: "Internal server error." });
  });

  const server = app.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });

  async function shutdown() {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(`[api] fatal: ${error.message}`);
  process.exit(1);
});
