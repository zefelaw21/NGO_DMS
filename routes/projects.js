const express = require('express');
const pool    = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/projects — create project ───────────────────────
router.post(
  '/',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager']),
  async (req, res) => {
    const { title, description, start_date, end_date, target_beneficiaries, target_activities } = req.body;
    if (!title) return res.status(400).json({ message: 'Title is required.' });

    try {
      const [result] = await pool.query(
        `INSERT INTO projects
           (title, description, start_date, end_date, target_beneficiaries, target_activities, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [title, description || null, start_date || null, end_date || null,
         target_beneficiaries || 0, target_activities || 0, req.user.id]
      );
      res.status(201).json({ message: 'Project created.', id: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── GET /api/projects — list all projects ─────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*,
              u.name AS created_by_name,
              COUNT(DISTINCT b.id)  AS actual_beneficiaries,
              COUNT(DISTINCT a.id)  AS actual_activities
       FROM projects p
       LEFT JOIN users         u ON p.created_by  = u.id
       LEFT JOIN beneficiaries b ON b.project_id   = p.id
       LEFT JOIN activity_logs a ON a.project_id   = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/projects/:id — single project ────────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, u.name AS created_by_name,
              COUNT(DISTINCT b.id) AS actual_beneficiaries,
              COUNT(DISTINCT a.id) AS actual_activities
       FROM projects p
       LEFT JOIN users         u ON p.created_by = u.id
       LEFT JOIN beneficiaries b ON b.project_id  = p.id
       LEFT JOIN activity_logs a ON a.project_id  = p.id
       WHERE p.id = ?
       GROUP BY p.id`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Project not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/projects/:id — update ────────────────────────────
router.put(
  '/:id',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager']),
  async (req, res) => {
    const { title, description, start_date, end_date, target_beneficiaries, target_activities } = req.body;
    try {
      await pool.query(
        `UPDATE projects
         SET title=?, description=?, start_date=?, end_date=?,
             target_beneficiaries=?, target_activities=?
         WHERE id=?`,
        [title, description, start_date, end_date,
         target_beneficiaries, target_activities, req.params.id]
      );
      res.json({ message: 'Project updated.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── DELETE /api/projects/:id — Admin only ─────────────────────
router.delete(
  '/:id',
  authMiddleware,
  roleMiddleware(['Admin']),
  async (req, res) => {
    try {
      await pool.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
      res.json({ message: 'Project deleted.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── POST /api/projects/:id/indicators — add indicator ─────────
router.post(
  '/:id/indicators',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager']),
  async (req, res) => {
    const { indicator_name, target_value, unit } = req.body;
    try {
      await pool.query(
        'INSERT INTO indicators (project_id, indicator_name, target_value, unit) VALUES (?, ?, ?, ?)',
        [req.params.id, indicator_name, target_value || 0, unit || null]
      );
      res.status(201).json({ message: 'Indicator added.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── PUT /api/projects/:id/indicators/:ind_id — update actual ──
router.put(
  '/:id/indicators/:ind_id',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager', 'FieldOfficer']),
  async (req, res) => {
    const { actual_value } = req.body;
    try {
      await pool.query(
        'UPDATE indicators SET actual_value = ? WHERE id = ? AND project_id = ?',
        [actual_value, req.params.ind_id, req.params.id]
      );
      res.json({ message: 'Indicator updated.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── GET /api/projects/:id/indicators ──────────────────────────
router.get('/:id/indicators', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM indicators WHERE project_id = ?',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
