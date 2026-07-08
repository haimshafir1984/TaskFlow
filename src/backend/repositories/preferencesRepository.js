const BaseRepository = require('./baseRepository');

class PreferencesRepository extends BaseRepository {
  constructor(db) {
    super(db, 'user_preferences');
  }

  get(userId) {
    const row = this.db.prepare('SELECT data FROM user_preferences WHERE user_id = ?').get(Number(userId));
    if (!row) return {};
    try {
      return JSON.parse(row.data) || {};
    } catch (error) {
      return {};
    }
  }

  set(userId, data) {
    this.db.prepare(`
      INSERT OR REPLACE INTO user_preferences (user_id, data, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(Number(userId), JSON.stringify(data || {}));
    return this.get(userId);
  }
}

module.exports = PreferencesRepository;
