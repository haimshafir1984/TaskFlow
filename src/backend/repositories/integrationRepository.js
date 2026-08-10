const BaseRepository = require('./baseRepository');

function parseJson(value, fallback = {}) {
  try { return JSON.parse(value || '{}'); } catch { return fallback; }
}

class IntegrationRepository extends BaseRepository {
  constructor(db) { super(db, 'integrations'); }

  list(userId) {
    return this.db.prepare('SELECT id, user_id, provider, name, auth_type, config, is_active, last_success_at, last_error, created_at, updated_at FROM integrations WHERE user_id = ? ORDER BY name').all(Number(userId)).map((row) => ({ ...row, config: parseJson(row.config), is_active: Boolean(row.is_active) }));
  }

  findForUser(userId, id) {
    const row = this.db.prepare('SELECT * FROM integrations WHERE id = ? AND user_id = ?').get(Number(id), Number(userId));
    return row ? { ...row, config: parseJson(row.config), credentials: parseJson(row.credentials), is_active: Boolean(row.is_active) } : null;
  }

  create(data) {
    const result = this.db.prepare(`INSERT INTO integrations (user_id, provider, name, auth_type, config, credentials, is_active) VALUES (@user_id, @provider, @name, @auth_type, @config, @credentials, @is_active)`).run({ ...data, config: JSON.stringify(data.config || {}), credentials: JSON.stringify(data.credentials || {}), is_active: data.is_active === false ? 0 : 1 });
    return this.findForUser(data.user_id, result.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`UPDATE integrations SET provider = @provider, name = @name, auth_type = @auth_type, config = @config, credentials = @credentials, is_active = @is_active, updated_at = CURRENT_TIMESTAMP WHERE id = @id AND user_id = @user_id`).run({ ...data, id: Number(id), user_id: Number(userId), config: JSON.stringify(data.config || {}), credentials: JSON.stringify(data.credentials || {}), is_active: data.is_active === false ? 0 : 1 });
    return this.findForUser(userId, id);
  }

  deleteForUser(userId, id) { return this.db.prepare('DELETE FROM integrations WHERE id = ? AND user_id = ?').run(Number(id), Number(userId)); }

  markResult(id, success, errorMessage = null) {
    this.db.prepare('UPDATE integrations SET last_success_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE last_success_at END, last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(success ? 1 : 0, errorMessage, Number(id));
  }
}

module.exports = IntegrationRepository;
