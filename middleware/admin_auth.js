const dotenv = require('dotenv');
dotenv.config();

/**
 * Middleware to authenticate admin requests via Basic Auth.
 * Expects an Authorization header: "Basic <base64(adminId:adminPassword)>".
 * ADMIN_ID and ADMIN_PASSWORD should be set in the environment.
 */
function adminAuthenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing Basic Auth' });
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [adminId, adminPassword] = credentials.split(':');

  const expectedId = process.env.ADMIN_ID;
  const expectedPassword = process.env.ADMIN_PASSWORD;

  if (!expectedId || !expectedPassword) {
    console.error('❌ ADMIN_ID / ADMIN_PASSWORD not set in environment');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (adminId === expectedId && adminPassword === expectedPassword) {
    // Attach admin info to request for downstream use if needed
    req.admin = { id: adminId };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized: Invalid admin credentials' });
}

module.exports = { adminAuthenticate };
