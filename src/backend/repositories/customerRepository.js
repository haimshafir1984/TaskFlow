const BaseRepository = require('./baseRepository');

class CustomerRepository extends BaseRepository {
  constructor(db) {
    super(db, 'customers');
  }

  list(userId) {
    return this.db.prepare(`
      SELECT *
      FROM customers
      WHERE user_id = ?
      ORDER BY updated_at DESC, name COLLATE NOCASE
    `).all(Number(userId));
  }

  findByIdForUser(userId, id) {
    return this.db.prepare('SELECT * FROM customers WHERE id = ? AND user_id = ?').get(id, Number(userId));
  }

  create(data) {
    const info = this.db.prepare(`
      INSERT INTO customers (user_id, name, deal_description, stage, price, contact_person, phone, email, notes)
      VALUES (@user_id, @name, @deal_description, @stage, @price, @contact_person, @phone, @email, @notes)
    `).run(data);
    return this.findByIdForUser(data.user_id, info.lastInsertRowid);
  }

  update(userId, id, data) {
    this.db.prepare(`
      UPDATE customers
      SET name = @name,
          deal_description = @deal_description,
          stage = @stage,
          price = @price,
          contact_person = @contact_person,
          phone = @phone,
          email = @email,
          notes = @notes,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id AND user_id = @user_id
    `).run({ ...data, id, user_id: Number(userId) });
    return this.findByIdForUser(userId, id);
  }

  deleteForUser(userId, id) {
    return this.db.prepare('DELETE FROM customers WHERE id = ? AND user_id = ?').run(id, Number(userId));
  }
}

module.exports = CustomerRepository;
