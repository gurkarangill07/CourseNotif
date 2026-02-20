function logStub(event, payload) {
  const entry = {
    event,
    payload,
    timestamp: new Date().toISOString()
  };
  console.log(JSON.stringify(entry));
}

async function sendCourseOpenEmail({ toEmail, cartId, courseName, os }) {
  logStub("EMAIL_STUB_COURSE_OPEN", {
    toEmail,
    subject: `Course ${cartId} is now open`,
    cartId,
    courseName,
    os
  });
}

async function sendSessionExpiredEmail({ toEmail, reason }) {
  logStub("EMAIL_STUB_SESSION_EXPIRED", {
    toEmail,
    subject: "VSB session expired or failed",
    reason: reason || "Unknown session error"
  });
}

module.exports = {
  sendCourseOpenEmail,
  sendSessionExpiredEmail
};
