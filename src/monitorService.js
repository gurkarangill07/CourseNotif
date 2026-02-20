const { parseCourseFromJsp } = require("./jspParser");

function isSessionFailure(error) {
  const message = (error && error.message ? error.message : "").toLowerCase();
  return (
    message.includes("session") ||
    message.includes("login") ||
    message.includes("auth") ||
    message.includes("unauthorized")
  );
}

async function notifySessionFailureIfNeeded({
  db,
  notifier,
  ownerAlertEmail,
  reason
}) {
  const { wasAlreadyExpired } = await db.markSharedSessionExpired(reason);
  if (wasAlreadyExpired) {
    return;
  }
  if (!ownerAlertEmail) {
    return;
  }
  await notifier.sendSessionExpiredEmail({
    toEmail: ownerAlertEmail,
    reason
  });
}

async function processTrackedCourse({
  target,
  db,
  vsbSource,
  notifier,
  forceRefresh = false
}) {
  async function loadLatestFile({ refreshNow }) {
    const candidates = await vsbSource.collectGetClassDataCandidates({
      cartId: target.cart_id,
      forceRefresh: refreshNow
    });
    const latestFile = vsbSource.pickLatestJspFile(candidates);
    if (!latestFile) {
      throw new Error("No getClassData.jsp file available.");
    }
    await db.saveSharedLatestJspFile(latestFile);
    return latestFile;
  }

  let latestFile = await loadLatestFile({ refreshNow: forceRefresh });
  let parsed;
  try {
    parsed = parseCourseFromJsp(latestFile.jspBody, target.cart_id);
  } catch (error) {
    if (forceRefresh) {
      throw error;
    }
    latestFile = await loadLatestFile({ refreshNow: true });
    parsed = parseCourseFromJsp(latestFile.jspBody, target.cart_id);
  }

  await db.upsertCourseFromJsp({
    cartId: target.cart_id,
    courseName: parsed.courseName,
    os: parsed.os
  });

  if (parsed.os > 0) {
    await notifier.sendCourseOpenEmail({
      toEmail: target.email,
      cartId: target.cart_id,
      courseName: parsed.courseName,
      os: parsed.os
    });
    await db.stopTrackingUserCourse(target.user_course_id);
    return { status: "notified_and_stopped", os: parsed.os };
  }

  return { status: "still_closed", os: parsed.os };
}

async function monitorOnce({
  db,
  vsbSource,
  notifier,
  ownerAlertEmail
}) {
  const summary = {
    scanned: 0,
    notified: 0,
    stopped: 0,
    failures: 0
  };

  const session = await db.getSharedSession();
  const isClockExpired =
    session &&
    session.session_expires_at &&
    new Date(session.session_expires_at).getTime() <= Date.now();

  if (!session || session.session_state !== "ok" || isClockExpired) {
    await notifySessionFailureIfNeeded({
      db,
      notifier,
      ownerAlertEmail,
      reason: isClockExpired
        ? "Shared VSB session timed out by expiry timestamp."
        : "Shared VSB session is not active."
    });
    return summary;
  }

  const trackedCourses = await db.listTrackedCourses();
  for (const target of trackedCourses) {
    summary.scanned += 1;
    try {
      const result = await processTrackedCourse({
        target,
        db,
        vsbSource,
        notifier,
        forceRefresh: false
      });
      if (result.status === "notified_and_stopped") {
        summary.notified += 1;
        summary.stopped += 1;
      }
    } catch (error) {
      summary.failures += 1;
      if (isSessionFailure(error)) {
        await notifySessionFailureIfNeeded({
          db,
          notifier,
          ownerAlertEmail,
          reason: error.message
        });
        break;
      }
      console.error(
        `[monitor] failed for user_course_id=${target.user_course_id} cart_id=${target.cart_id}: ${error.message}`
      );
    }
  }

  return summary;
}

async function runImmediateCheckForNewCourse({
  db,
  vsbSource,
  notifier,
  ownerAlertEmail,
  userId,
  cartId
}) {
  const target = await db.getTrackedCourseByUserAndCart(userId, cartId);
  if (!target) {
    return { status: "not_tracking" };
  }

  try {
    const result = await processTrackedCourse({
      target,
      db,
      vsbSource,
      notifier,
      forceRefresh: true
    });
    return result;
  } catch (error) {
    if (isSessionFailure(error)) {
      await notifySessionFailureIfNeeded({
        db,
        notifier,
        ownerAlertEmail,
        reason: error.message
      });
      return { status: "session_failed" };
    }
    throw error;
  }
}

module.exports = {
  monitorOnce,
  runImmediateCheckForNewCourse
};
