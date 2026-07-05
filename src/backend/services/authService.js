const crypto = require('crypto');

class AuthService {
  constructor(db, catalogService = null) {
    this.db = db;
    this.catalogService = catalogService;
    this.tokens = new Map();
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
    this.tokens.set(token, { id: Number(user.id), username: user.username });
    return { token, user: { id: Number(user.id), username: user.username } };
  }

  logout(token) {
    this.tokens.delete(token);
    return { ok: true };
  }

  verify(token) {
    return token ? this.tokens.get(token) || null : null;
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
    for (const [token, session] of this.tokens.entries()) {
      if (session.id === Number(userId)) this.tokens.delete(token);
    }
    return { ok: true };
  }
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

module.exports = AuthService;
