const { Pool } = require("pg");

function createDb({ databaseUrl }) {
  const pool = new Pool({
    connectionString: databaseUrl
  });

  async function close() {
    await pool.end();
  }

  async function ensureCompatibility() {
    await pool.query(
      `
      ALTER TABLE user_courses
      ADD COLUMN IF NOT EXISTS display_name TEXT
      `
    );
  }

  async function getSharedSession() {
    const { rows } = await pool.query(
      `
      SELECT
        singleton_id,
        session_state,
        encrypted_session_blob IS NOT NULL AS has_session_blob,
        session_expires_at,
        last_validated_at
      FROM shared_vsb_session
      WHERE singleton_id = 1
      LIMIT 1
      `
    );
    return rows[0] || null;
  }

  async function markSharedSessionExpired(reason) {
    const previous = await getSharedSession();
    await pool.query(
      `
      INSERT INTO shared_vsb_session (
        singleton_id,
        session_state,
        encrypted_session_blob,
        session_expires_at,
        last_validated_at,
        updated_at
      )
      VALUES (
        1,
        'expired',
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      ON CONFLICT (singleton_id) DO UPDATE
      SET
        session_state = EXCLUDED.session_state,
        encrypted_session_blob = EXCLUDED.encrypted_session_blob,
        session_expires_at = EXCLUDED.session_expires_at,
        last_validated_at = EXCLUDED.last_validated_at,
        updated_at = NOW()
      `
    );

    return {
      wasAlreadyExpired: previous ? previous.session_state === "expired" : false,
      reason
    };
  }

  async function markSharedSessionOk({ sessionDurationMinutes = 90 } = {}) {
    const expiresAt = new Date(Date.now() + sessionDurationMinutes * 60 * 1000);
    await pool.query(
      `
      INSERT INTO shared_vsb_session (
        singleton_id,
        session_state,
        encrypted_session_blob,
        session_expires_at,
        last_validated_at,
        created_at,
        updated_at
      )
      VALUES (
        1,
        'ok',
        decode('00', 'hex'),
        $1,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (singleton_id) DO UPDATE
      SET
        session_state = EXCLUDED.session_state,
        encrypted_session_blob = EXCLUDED.encrypted_session_blob,
        session_expires_at = EXCLUDED.session_expires_at,
        last_validated_at = EXCLUDED.last_validated_at,
        updated_at = NOW()
      `,
      [expiresAt]
    );
  }

  async function listTrackedCourses() {
    const { rows } = await pool.query(
      `
      SELECT
        uc.id AS user_course_id,
        uc.user_id,
        uc.created_at,
        u.email,
        uc.cart_id,
        uc.display_name,
        c.course_name,
        c.os
      FROM user_courses uc
      INNER JOIN users u ON u.id = uc.user_id
      LEFT JOIN courses c ON c.cart_id = uc.cart_id
      ORDER BY uc.id ASC
      `
    );
    return rows;
  }

  async function getUserByEmail(email) {
    const { rows } = await pool.query(
      `
      SELECT id, email
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );
    return rows[0] || null;
  }

  async function getOrCreateUserByEmail(email) {
    const { rows } = await pool.query(
      `
      INSERT INTO users (
        email,
        created_at,
        updated_at
      )
      VALUES ($1, NOW(), NOW())
      ON CONFLICT (email) DO UPDATE
      SET updated_at = NOW()
      RETURNING id, email
      `,
      [email]
    );
    return rows[0];
  }

  async function getTrackedCourseByUserAndCart(userId, cartId) {
    const { rows } = await pool.query(
      `
      SELECT
        uc.id AS user_course_id,
        uc.user_id,
        uc.created_at,
        u.email,
        uc.cart_id,
        uc.display_name,
        c.course_name,
        c.os
      FROM user_courses uc
      INNER JOIN users u ON u.id = uc.user_id
      LEFT JOIN courses c ON c.cart_id = uc.cart_id
      WHERE uc.user_id = $1 AND uc.cart_id = $2
      LIMIT 1
      `,
      [userId, cartId]
    );
    return rows[0] || null;
  }

  async function listTrackedCoursesByUser(userId) {
    const { rows } = await pool.query(
      `
      SELECT
        uc.id AS user_course_id,
        uc.user_id,
        uc.cart_id,
        uc.display_name,
        uc.created_at,
        c.course_name,
        c.os
      FROM user_courses uc
      LEFT JOIN courses c ON c.cart_id = uc.cart_id
      WHERE uc.user_id = $1
      ORDER BY uc.created_at DESC, uc.id DESC
      `,
      [userId]
    );
    return rows;
  }

  async function stopTrackingUserCourse(userCourseId) {
    await pool.query(
      `
      DELETE FROM user_courses
      WHERE id = $1
      `,
      [userCourseId]
    );
  }

  async function stopTrackingUserCourseForUser({ userCourseId, userId }) {
    const { rowCount } = await pool.query(
      `
      DELETE FROM user_courses
      WHERE id = $1 AND user_id = $2
      `,
      [userCourseId, userId]
    );
    return rowCount;
  }

  async function upsertCourseFromJsp({ cartId, courseName, os }) {
    await pool.query(
      `
      INSERT INTO courses (
        cart_id,
        course_name,
        os,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT (cart_id) DO UPDATE
      SET
        course_name = CASE
          WHEN EXCLUDED.course_name IS NULL OR TRIM(EXCLUDED.course_name) = ''
          THEN courses.course_name
          ELSE EXCLUDED.course_name
        END,
        os = EXCLUDED.os,
        updated_at = NOW()
      `,
      [cartId, courseName, os]
    );
  }

  async function ensureCourseExists(cartId, courseName = null) {
    const normalizedName =
      typeof courseName === "string" && courseName.trim()
        ? courseName.trim()
        : null;
    await pool.query(
      `
      INSERT INTO courses (
        cart_id,
        course_name,
        os,
        created_at,
        updated_at
      )
      VALUES ($1, COALESCE($2, $1), 0, NOW(), NOW())
      ON CONFLICT (cart_id) DO UPDATE
      SET
        course_name = CASE
          WHEN courses.course_name IS NULL OR TRIM(courses.course_name) = ''
          THEN COALESCE($2, courses.cart_id)
          ELSE courses.course_name
        END,
        updated_at = NOW()
      `,
      [cartId, normalizedName]
    );
  }

  async function setUserCourseDisplayName({ userId, cartId, displayName }) {
    const normalizedDisplayName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : null;

    await pool.query(
      `
      UPDATE user_courses
      SET display_name = $3
      WHERE user_id = $1 AND cart_id = $2
      `,
      [userId, cartId, normalizedDisplayName]
    );
  }

  async function setCourseDisplayName({ cartId, courseName }) {
    const normalizedName =
      typeof courseName === "string" && courseName.trim()
        ? courseName.trim()
        : null;
    if (!normalizedName) {
      return;
    }

    await pool.query(
      `
      UPDATE courses
      SET
        course_name = $2,
        updated_at = NOW()
      WHERE cart_id = $1
      `,
      [cartId, normalizedName]
    );
  }

  async function getSharedLatestJspFile() {
    const { rows } = await pool.query(
      `
      SELECT
        singleton_id,
        file_name,
        jsp_body,
        source_path,
        payload_hash,
        generated_at,
        updated_at
      FROM shared_latest_jsp_file
      WHERE singleton_id = 1
      LIMIT 1
      `
    );
    return rows[0] || null;
  }

  async function saveSharedLatestJspFile({
    fileName,
    jspBody,
    sourcePath,
    payloadHash,
    generatedAt
  }) {
    await pool.query(
      `
      INSERT INTO shared_latest_jsp_file (
        singleton_id,
        file_name,
        jsp_body,
        source_path,
        payload_hash,
        generated_at,
        updated_at
      )
      VALUES (1, $1, $2, $3, $4, $5, NOW())
      ON CONFLICT (singleton_id) DO UPDATE
      SET
        file_name = EXCLUDED.file_name,
        jsp_body = EXCLUDED.jsp_body,
        source_path = EXCLUDED.source_path,
        payload_hash = EXCLUDED.payload_hash,
        generated_at = EXCLUDED.generated_at,
        updated_at = NOW()
      `,
      [
        fileName,
        jspBody,
        sourcePath || null,
        payloadHash || null,
        generatedAt || new Date()
      ]
    );
  }

  async function trackCourseForUser({ userId, cartId, displayName = null }) {
    const normalizedDisplayName =
      typeof displayName === "string" && displayName.trim()
        ? displayName.trim()
        : null;

    const { rows } = await pool.query(
      `
      INSERT INTO user_courses (
        user_id,
        cart_id,
        display_name,
        created_at
      )
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (user_id, cart_id) DO NOTHING
      RETURNING id
      `,
      [userId, cartId, normalizedDisplayName]
    );

    return rows[0] || null;
  }

  return {
    close,
    ensureCompatibility,
    getSharedSession,
    markSharedSessionExpired,
    markSharedSessionOk,
    getUserByEmail,
    getOrCreateUserByEmail,
    listTrackedCourses,
    listTrackedCoursesByUser,
    getTrackedCourseByUserAndCart,
    stopTrackingUserCourse,
    stopTrackingUserCourseForUser,
    ensureCourseExists,
    setUserCourseDisplayName,
    setCourseDisplayName,
    upsertCourseFromJsp,
    getSharedLatestJspFile,
    saveSharedLatestJspFile,
    trackCourseForUser
  };
}

module.exports = {
  createDb
};
