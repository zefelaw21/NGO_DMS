const express = require('express');
const bcrypt  = require('bcrypt');
const pool    = require('../db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/users — list all users (Admin only) ──────────────
router.get(
  '/',
  authMiddleware,
  roleMiddleware(['Admin']),
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── PUT /api/users/:id/toggle — activate/deactivate ──────────
router.put(
  '/:id/toggle',
  authMiddleware,
  roleMiddleware(['Admin']),
  async (req, res) => {
    try {
      await pool.query(
        'UPDATE users SET is_active = NOT is_active WHERE id = ?',
        [req.params.id]
      );
      res.json({ message: 'User status toggled.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── PUT /api/users/:id/role — change role ─────────────────────
router.put(
  '/:id/role',
  authMiddleware,
  roleMiddleware(['Admin']),
  async (req, res) => {
    const { role } = req.body;
    const validRoles = ['Admin', 'Manager', 'FieldOfficer', 'Viewer'];
    if (!validRoles.includes(role))
      return res.status(400).json({ message: 'Invalid role.' });

    try {
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
      res.json({ message: 'Role updated.' });
    } catch (err) {
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

// ── PUT /api/users/:id/password — change own password ────────
router.put('/:id/password', authMiddleware, async (req, res) => {
  // Users can only change their own password; Admins can change anyone's
  if (req.user.id !== parseInt(req.params.id) && req.user.role !== 'Admin')
    return res.status(403).json({ message: 'Not allowed.' });

  const { new_password } = req.body;
  if (!new_password || new_password.length < 6)
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });

  try {
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error.' });
  }
});

module.exports = router;
