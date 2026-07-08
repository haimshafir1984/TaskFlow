const crypto = require('crypto');

const SESSION_TTL_DAYS = 30;

class AuthService {
  constructor(db, catalogService = null) {
    this.db = db;
    this.catalogService = catalogService;
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  }

  hasUsers() {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM users').get()?.count || 0) > 0;
  }

  register(username, password) {
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername) {
      const error = new Error('Username is required');
      error.status = 422;
      throw error;
    }
    const existing = this.db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
    if (existing) {
      const error = new Error('Username already exists');
      error.status = 409;
      error.code = 'USERNAME_EXISTS';
      throw error;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const info = this.db.prepare(`
      INSERT INTO users (username, password_salt, password_hash)
      VALUES (?, ?, ?)
    `).run(cleanUsername, salt, hashPassword(String(password || ''), salt));
    const user = this.db.prepare('SELECT id, username FROM users WHERE id = ?').get(info.lastInsertRowid);
    if (this.catalogService?.seedUserDefaults) this.catalogService.seedUserDefaults(user.id);
    return this.createSession(user);
  }

  login(username, password) {
    const user = this.db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
    if (!user || hashPassword(String(password || ''), user.password_salt) !== user.password_hash) {
      const error = new Error('Invalid username or password');
      error.status = 401;
      throw error;
    }
    return this.createSession(user);
  }

  createSession(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    this.db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(token, Number(user.id), expiresAt);
    return { token, user: { id: Number(user.id), username: user.username } };
  }

  logout(token) {
    if (token) this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return { ok: true };
  }

  verify(token) {
    if (!token) return null;
    const row = this.db.prepare(`
      SELECT users.id, users.username
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > ?
    `).get(token, new Date().toISOString());
    return row ? { id: Number(row.id), username: row.username } : null;
  }

  changePassword(userId, currentPassword, nextPassword) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(Number(userId));
    if (!user || hashPassword(String(currentPassword || ''), user.password_salt) !== user.password_hash) {
      const error = new Error('Invalid password');
      error.status = 401;
      throw error;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    this.db.prepare('UPDATE users SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(salt, hashPassword(String(nextPassword || ''), salt), Number(userId));
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(Number(userId));
    return { ok: true };
  }
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

module.exports = AuthService;
