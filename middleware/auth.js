const jwt = require('jsonwebtoken');

// ── Verify JWT token ───────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'No token provided.' });

  const token = header.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ message: 'Token missing.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, name, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

// ── Restrict by role ───────────────────────────────────────────
// Usage: roleMiddleware(['Admin', 'Manager'])
function roleMiddleware(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Not authenticated.' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authMiddleware, roleMiddleware };
