const express = require('express');
const pool    = require('../db');
const XLSX    = require('xlsx');
const PDFDoc  = require('pdfkit');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/dashboard/stats ───────────────────────────────────
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [[{ total_beneficiaries }]] = await pool.query('SELECT COUNT(*) AS total_beneficiaries FROM beneficiaries');
    const [[{ total_projects }]]      = await pool.query('SELECT COUNT(*) AS total_projects FROM projects');
    const [[{ total_activities }]]    = await pool.query('SELECT COUNT(*) AS total_activities FROM activity_logs');
    const [[{ total_users }]]         = await pool.query('SELECT COUNT(*) AS total_users FROM users WHERE is_active = 1');

    const [projects] = await pool.query(
      `SELECT p.id, p.title, p.target_beneficiaries, p.target_activities,
              COUNT(DISTINCT b.id) AS actual_beneficiaries,
              COUNT(DISTINCT a.id) AS actual_activities
       FROM projects p
       LEFT JOIN beneficiaries b ON b.project_id = p.id
       LEFT JOIN activity_logs a ON a.project_id = p.id
       GROUP BY p.id ORDER BY p.created_at DESC`
    );

    const [recent_activities] = await pool.query(
      `SELECT a.id, a.activity_name, a.activity_date, a.total_attendees,
              p.title AS project_title, u.name AS officer_name
       FROM activity_logs a
       LEFT JOIN projects p ON a.project_id      = p.id
       LEFT JOIN users    u ON a.field_officer_id = u.id
       ORDER BY a.activity_date DESC LIMIT 5`
    );

    const [recent_beneficiaries] = await pool.query(
      `SELECT b.unique_id, b.full_name, b.location, b.created_at, u.name AS registered_by_name
       FROM beneficiaries b
       LEFT JOIN users u ON b.registered_by = u.id
       ORDER BY b.created_at DESC LIMIT 5`
    );

    res.json({
      summary: { total_beneficiaries, total_projects, total_activities, total_users },
      projects, recent_activities, recent_beneficiaries,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
});

// ── Helper: fetch data rows based on type + filters ───────────
async function fetchRows(type, { project_id, from_date, to_date }) {
  if (type === 'activities') {
    let where = 'WHERE 1=1';
    const params = [];
    if (project_id) { where += ' AND a.project_id = ?';     params.push(project_id); }
    if (from_date)  { where += ' AND a.activity_date >= ?'; params.push(from_date); }
    if (to_date)    { where += ' AND a.activity_date <= ?'; params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT a.id, p.title AS project, a.activity_name, a.activity_type,
              a.activity_date, a.location, u.name AS field_officer,
              a.total_attendees, a.notes
       FROM activity_logs a
       LEFT JOIN projects p ON a.project_id      = p.id
       LEFT JOIN users    u ON a.field_officer_id = u.id
       ${where} ORDER BY a.activity_date DESC`, params
    );
    return rows;
  }

  if (type === 'beneficiaries') {
    let where = 'WHERE 1=1';
    const params = [];
    if (project_id) { where += ' AND b.project_id = ?';  params.push(project_id); }
    if (from_date)  { where += ' AND b.created_at >= ?'; params.push(from_date); }
    if (to_date)    { where += ' AND b.created_at <= ?'; params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT b.unique_id, b.full_name, b.phone, b.location, b.gender, b.age,
              p.title AS project, u.name AS registered_by, b.created_at
       FROM beneficiaries b
       LEFT JOIN projects p ON b.project_id   = p.id
       LEFT JOIN users    u ON b.registered_by = u.id
       ${where} ORDER BY b.created_at DESC`, params
    );
    return rows;
  }

  return [];
}

// ── GET /api/dashboard/export ─────────────────────────────────
// Query params: type, format, project_id, from_date, to_date
// format: csv | json | xlsx | pdf
router.get(
  '/export',
  authMiddleware,
  roleMiddleware(['Admin', 'Manager']),
  async (req, res) => {
    const { project_id, from_date, to_date, type = 'activities', format = 'csv' } = req.query;

    try {
      const rows = await fetchRows(type, { project_id, from_date, to_date });

      if (rows.length === 0)
        return res.status(404).json({ message: 'No data found for the selected filters.' });

      const timestamp = Date.now();
      const baseName  = `devlink_${type}_${timestamp}`;

      // ── CSV ──────────────────────────────────────────────────
      if (format === 'csv') {
        const headers = Object.keys(rows[0]).join(',');
        const csvRows = rows.map(row =>
          Object.values(row)
            .map(v => (v == null ? '' : `"${String(v).replace(/"/g, '""')}"`))
            .join(',')
        );
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
        return res.send([headers, ...csvRows].join('\r\n'));
      }

      // ── JSON ─────────────────────────────────────────────────
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
        return res.send(JSON.stringify({
          exported_at: new Date().toISOString(),
          type,
          total: rows.length,
          data: rows,
        }, null, 2));
      }

      // ── XLSX (Excel) ─────────────────────────────────────────
      if (format === 'xlsx') {
        // Sanitize dates to strings so Excel renders them cleanly
        const clean = rows.map(r => {
          const obj = {};
          for (const [k, v] of Object.entries(r)) {
            obj[k] = v instanceof Date ? v.toISOString().slice(0, 10) : (v == null ? '' : v);
          }
          return obj;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(clean);

        // Auto column widths
        const colWidths = Object.keys(clean[0]).map(key => ({
          wch: Math.max(key.length, ...clean.map(r => String(r[key] ?? '').length)) + 2,
        }));
        ws['!cols'] = colWidths;

        XLSX.utils.book_append_sheet(wb, ws, type === 'activities' ? 'Activities' : 'Beneficiaries');

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
        return res.send(buf);
      }

      // ── PDF ──────────────────────────────────────────────────
      if (format === 'pdf') {
        const doc = new PDFDoc({ margin: 40, size: 'A4', layout: 'landscape' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);
        doc.pipe(res);

        const headers = Object.keys(rows[0]);
        const colCount = headers.length;
        const pageW    = doc.page.width - 80;  // total usable width
        const colW     = pageW / colCount;
        const rowH     = 20;

        // ── Title ────────────────────────────────────────────
        doc.fontSize(16).font('Helvetica-Bold')
           .text(`DevLink — ${type === 'activities' ? 'Activity Logs' : 'Beneficiaries'} Report`, 40, 30);
        doc.fontSize(9).font('Helvetica')
           .text(`Generated: ${new Date().toLocaleString()}  |  Total records: ${rows.length}`, 40, 52);

        let y = 72;

        // ── Header row ───────────────────────────────────────
        doc.rect(40, y, pageW, rowH).fill('#1e3a5f');
        headers.forEach((h, i) => {
          doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
             .text(h.replace(/_/g, ' ').toUpperCase(), 40 + i * colW + 3, y + 5, { width: colW - 6, ellipsis: true });
        });
        y += rowH;

        // ── Data rows ────────────────────────────────────────
        rows.forEach((row, idx) => {
          // New page if needed
          if (y + rowH > doc.page.height - 40) {
            doc.addPage();
            y = 40;
            // Repeat header
            doc.rect(40, y, pageW, rowH).fill('#1e3a5f');
            headers.forEach((h, i) => {
              doc.fillColor('white').fontSize(8).font('Helvetica-Bold')
                 .text(h.replace(/_/g, ' ').toUpperCase(), 40 + i * colW + 3, y + 5, { width: colW - 6, ellipsis: true });
            });
            y += rowH;
          }

          const bg = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
          doc.rect(40, y, pageW, rowH).fill(bg);

          // Row border
          doc.rect(40, y, pageW, rowH).stroke('#e2e8f0');

          const vals = Object.values(row);
          vals.forEach((v, i) => {
            const text = v instanceof Date ? v.toISOString().slice(0, 10) : (v == null ? '—' : String(v));
            doc.fillColor('#1e293b').fontSize(7.5).font('Helvetica')
               .text(text, 40 + i * colW + 3, y + 6, { width: colW - 6, ellipsis: true });
          });

          y += rowH;
        });

        // ── Footer ───────────────────────────────────────────
        doc.fontSize(7).fillColor('#94a3b8')
           .text('DevLink NGO Management Platform — Confidential', 40, doc.page.height - 25, { align: 'center' });

        doc.end();
        return;
      }

      res.status(400).json({ message: 'Invalid format. Use: csv, json, xlsx, pdf' });

    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error.' });
    }
  }
);

module.exports = router;
