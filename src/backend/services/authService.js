const crypto = require('crypto');

class AuthService {
  constructor(settingsService) {
    this.settings = settingsService;
    this.tokens = new Set();
    this.ensurePassword();
  }

  ensurePassword() {
    const settings = this.settings.all();
    if (settings.auth_password_hash && settings.auth_password_salt) return;
    const initialPassword = process.env.TASKFLOW_INITIAL_PASSWORD || '123456';
    const salt = crypto.randomBytes(16).toString('hex');
    this.settings.set('auth_password_salt', salt);
    this.settings.set('auth_password_hash', hashPassword(initialPassword, salt));
  }

  login(password) {
    const settings = this.settings.all();
    const expected = settings.auth_password_hash;
    const actual = hashPassword(String(password || ''), settings.auth_password_salt);
    if (!expected || actual !== expected) {
      const error = new Error('Invalid password');
      error.status = 401;
      throw error;
    }
    const token = crypto.randomBytes(32).toString('hex');
    this.tokens.add(token);
    return { token };
  }

  logout(token) {
    this.tokens.delete(token);
    return { ok: true };
  }

  verify(token) {
    return Boolean(token && this.tokens.has(token));
  }

  changePassword(currentPassword, nextPassword) {
    this.login(currentPassword);
    const salt = crypto.randomBytes(16).toString('hex');
    this.settings.set('auth_password_salt', salt);
    this.settings.set('auth_password_hash', hashPassword(nextPassword, salt));
    this.tokens.clear();
    return { ok: true };
  }
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex');
}

module.exports = AuthService;
