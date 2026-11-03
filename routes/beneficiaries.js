const express = require('express');
const pool    = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Generate unique beneficiary ID: DEV-YYYY-XXXX ─────────────
async function generateUniqueId() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM beneficiaries WHERE unique_id LIKE ?',
    [`DEV-${year}-%`]
  );
  const count = rows[0].cnt + 1;
  return `DEV-${year}-${String(count).padStart(4, '0')}`;
}

// ── POST /api/beneficiaries — register new beneficiary ────────
// Allowed: Admin, Manager, FieldOfficer
router.post(
  '/',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager', 'FieldOfficer']),
  async (req, res) => {
    const { full_name, phone, location, gender, age, project_id } = req.body;

    if (!full_name)
      return res.status(400).json({ message: 'Full name is required.' });

    try {
      const unique_id = await generateUniqueId();
      const [result] = await pool.query(
        `INSERT INTO beneficiaries
           (unique_id, full_name, phone, location, gender, age, registered_by, project_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [unique_id, full_name, phone || null, location || null,
         gender || 'Other', age || null, req.user.id, project_id || null]
      );
      res.status(201).json({ message: 'Beneficiary registered.', unique_id, id: result.insertId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── GET /api/beneficiaries — list all ─────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  const { search, project_id, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params = [];

  if (search) {
    where += ' AND (b.full_name LIKE ? OR b.unique_id LIKE ? OR b.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (project_id) {
    where += ' AND b.project_id = ?';
    params.push(project_id);
  }

  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS registered_by_name, p.title AS project_title
       FROM beneficiaries b
       LEFT JOIN users    u ON b.registered_by = u.id
       LEFT JOIN projects p ON b.project_id    = p.id
       ${where}
       ORDER BY b.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM beneficiaries b ${where}`,
      params
    );

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── GET /api/beneficiaries/:id — single record ────────────────
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.*, u.name AS registered_by_name, p.title AS project_title
       FROM beneficiaries b
       LEFT JOIN users    u ON b.registered_by = u.id
       LEFT JOIN projects p ON b.project_id    = p.id
       WHERE b.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Beneficiary not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── PUT /api/beneficiaries/:id — update ───────────────────────
router.put(
  '/:id',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager', 'FieldOfficer']),
  async (req, res) => {
    const { full_name, phone, location, gender, age, project_id } = req.body;
    try {
      await pool.query(
        `UPDATE beneficiaries
         SET full_name=?, phone=?, location=?, gender=?, age=?, project_id=?
         WHERE id=?`,
        [full_name, phone, location, gender, age, project_id, req.params.id]
      );
      res.json({ message: 'Beneficiary updated.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

module.exports = router;
