const express = require('express');
const pool    = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/activities — log a new activity ─────────────────
router.post(
  '/',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager', 'FieldOfficer']),
  async (req, res) => {
    const { project_id, activity_name, activity_type, activity_date, location, notes } = req.body;

    if (!project_id || !activity_name || !activity_date)
      return res.status(400).json({ message: 'project_id, activity_name, and activity_date are required.' });

    try {
      const [result] = await pool.query(
        `INSERT INTO activity_logs
           (project_id, activity_name, activity_type, activity_date, location, field_officer_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [project_id, activity_name, activity_type || 'Other',
         activity_date, location || null, req.user.id, notes || null]
      );
      res.status(201).json({ message: 'Activity logged.', id: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── GET /api/activities — list activities ─────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { project_id, from_date, to_date } = req.query;

  let where = 'WHERE 1=1';
  const params = [];

  if (project_id) { where += ' AND a.project_id = ?'; params.push(project_id); }
  if (from_date)  { where += ' AND a.activity_date >= ?'; params.push(from_date); }
  if (to_date)    { where += ' AND a.activity_date <= ?'; params.push(to_date); }

  try {
    const [rows] = await pool.query(
      `SELECT a.*, p.title AS project_title, u.name AS officer_name,
              COUNT(att.id) AS attendance_count
       FROM activity_logs a
       LEFT JOIN projects p    ON a.project_id       = p.id
       LEFT JOIN users    u    ON a.field_officer_id  = u.id
       LEFT JOIN attendance att ON att.activity_id   = a.id
       ${where}
       GROUP BY a.id
       ORDER BY a.activity_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/activities/:id — single activity ─────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, p.title AS project_title, u.name AS officer_name
       FROM activity_logs a
       LEFT JOIN projects p ON a.project_id      = p.id
       LEFT JOIN users    u ON a.field_officer_id = u.id
       WHERE a.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Activity not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── POST /api/activities/:id/attendance — record attendance ───
router.post(
  '/:id/attendance',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager', 'FieldOfficer']),
  async (req, res) => {
    // body: { attendees: [{ beneficiary_id, status }] }
    const { attendees } = req.body;
    if (!attendees || !Array.isArray(attendees) || attendees.length === 0)
      return res.status(400).json({ message: 'attendees array is required.' });

    const activityId = req.params.id;
    try {
      // Upsert each attendee record
      for (const a of attendees) {
        await pool.query(
          `INSERT INTO attendance (activity_id, beneficiary_id, status)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [activityId, a.beneficiary_id, a.status || 'Present']
        );
      }

      // Update total_attendees count
      await pool.query(
        `UPDATE activity_logs
         SET total_attendees = (
           SELECT COUNT(*) FROM attendance
           WHERE activity_id = ? AND status = 'Present'
         )
         WHERE id = ?`,
        [activityId, activityId]
      );

      res.json({ message: `${attendees.length} attendance record(s) saved.` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── GET /api/activities/:id/attendance — list attendance ──────
router.get('/:id/attendance', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT att.*, b.unique_id, b.full_name, b.phone, b.location
       FROM attendance att
       JOIN beneficiaries b ON att.beneficiary_id = b.id
       WHERE att.activity_id = ?
       ORDER BY b.full_name`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
