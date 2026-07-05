const BaseRepository = require('./baseRepository');

class ContactRepository extends BaseRepository {
  constructor(db) {
    super(db, 'contacts');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT c.*, COUNT(t.id) AS task_count
      FROM contacts c
      LEFT JOIN tasks t ON t.contact_id = c.id AND t.user_id = c.user_id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM contacts WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO contacts (user_id, name, phone, email, notes)
      VALUES (@user_id, @name, @phone, @email, @notes)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`
      UPDATE contacts
      SET name = @name, phone = @phone, email = @email, notes = @notes, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    return this.db.prepare('DELETE FROM contacts WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }
}

module.exports = ContactRepository;
