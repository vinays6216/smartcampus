// Sends notifications for announcements that were scheduled for later (publish_at in the future when created)
// once their publish time arrives. Announcements published immediately are notified by the create handler.
//
// No schema change: an announcement counts as "already notified" when a notification row for it exists.
// Only announcements that went live in the last 7 days are considered, so an old backlog is never sent.
const { pool, withTransaction } = require('../config/db');
const { notifyUsers, audienceUserIds } = require('./notify');

const INTERVAL_MS = 60 * 1000;

async function notifyDueAnnouncements() {
  const [due] = await pool.query(
    `SELECT a.id, a.title, a.body, a.author_user_id, a.audience_type, a.department_id, a.section_id,
            EXISTS (SELECT 1 FROM calendar_events ce WHERE ce.announcement_id = a.id) AS has_event
       FROM announcements a
      WHERE a.is_published = 1
        AND a.publish_at <= NOW()
        AND a.publish_at > a.created_at
        AND a.publish_at >= NOW() - INTERVAL 7 DAY
        AND (a.expires_at IS NULL OR a.expires_at > NOW())
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.entity_type = 'announcement' AND n.entity_id = a.id)
      ORDER BY a.publish_at
      LIMIT 50`
  );
  let sent = 0;
  for (const a of due) {
    await withTransaction(async (conn) => {
      // re-check inside the transaction so two overlapping runs cannot notify twice
      const [[already]] = await conn.query(
        "SELECT COUNT(*) AS n FROM notifications WHERE entity_type = 'announcement' AND entity_id = ? FOR UPDATE",
        [a.id]
      );
      if (already.n) return;
      const userIds = await audienceUserIds(conn, {
        audienceType: a.audience_type, departmentId: a.department_id, sectionId: a.section_id,
      });
      const targets = userIds.filter((u) => u !== a.author_user_id);
      await notifyUsers(conn, targets, {
        type: a.has_event ? 'calendar_event' : 'announcement',
        title: a.title, message: String(a.body).slice(0, 200), entityType: 'announcement', entityId: a.id,
      });
      if (targets.length) sent += 1;
    });
  }
  return sent;
}

let timer = null;
let running = false;

exports.notifyDueAnnouncements = notifyDueAnnouncements;

exports.startScheduledAnnouncements = () => {
  if (timer) return;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await notifyDueAnnouncements();
      if (sent) console.log(`Scheduled announcements: notified ${sent}`);
    } catch (err) {
      console.error('Scheduled announcements check failed:', err.message);
    } finally {
      running = false;
    }
  };
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
};
