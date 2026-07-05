const BaseRepository = require('./baseRepository');

class ContactRepository extends BaseRepository {
  constructor(db) {
    super(db, 'contacts');
  }

  list() {
    return this.db.prepare(`
      SELECT c.*, COUNT(t.id) AS task_count
      FROM contacts c
      LEFT JOIN tasks t ON t.contact_id = c.id
      GROUP BY c.id
      ORDER BY c.name COLLATE NOCASE
    `).all();
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO contacts (name, phone, email, notes)
      VALUES (@name, @phone, @email, @notes)
    `).run(data);
    return this.findById(info.lastInsertRowid);
  }

  update(id, data) {
    this.db.prepare(`
      UPDATE contacts
      SET name = @name, phone = @phone, email = @email, notes = @notes, updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({ ...data, id });
    return this.findById(id);
  }
}

module.exports = ContactRepository;
