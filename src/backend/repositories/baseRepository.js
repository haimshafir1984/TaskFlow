class BaseRepository {
  constructor(db, table) {
    this.db = db;
    this.table = table;
  }

  findById(id) {
    return this.db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }

  delete(id) {
    return this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
}

module.exports = BaseRepository;
