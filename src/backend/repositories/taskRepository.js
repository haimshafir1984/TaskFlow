const BaseRepository = require('./baseRepository');

const SORT_COLUMNS = {
  priority: 'tasks.priority',
  created_at: 'tasks.created_at',
  due_date: 'tasks.due_date',
  project: 'projects.name',
  category: 'categories.sort_order'
};

class TaskRepository extends BaseRepository {
  constructor(db) {
    super(db, 'tasks');
  }

  list(filters = {}) {
    const where = [];
    const params = {};

    if (filters.search) {
      where.push('(tasks.name LIKE @search OR tasks.description LIKE @search OR tasks.notes LIKE @search)');
      params.search = `%${filters.search}%`;
    }
    if (filters.project_id) {
      where.push('tasks.project_id = @project_id');
      params.project_id = Number(filters.project_id);
    }
    if (filters.category_id) {
      where.push('tasks.category_id = @category_id');
      params.category_id = Number(filters.category_id);
    }
    if (filters.priority) {
      where.push('tasks.priority = @priority');
      params.priority = filters.priority;
    }
    if (filters.status) {
      where.push('tasks.status = @status');
      params.status = filters.status;
    }
    if (filters.from_date) {
      where.push('date(tasks.due_date) >= date(@from_date)');
      params.from_date = filters.from_date;
    }
    if (filters.to_date) {
      where.push('date(tasks.due_date) <= date(@to_date)');
      params.to_date = filters.to_date;
    }

    const sort = SORT_COLUMNS[filters.sort_by] || 'tasks.created_at';
    const direction = filters.sort_dir === 'asc' ? 'ASC' : 'DESC';
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT tasks.*,
             projects.name AS project_name,
             projects.color AS project_color,
             categories.name AS category_name,
             categories.color AS category_color,
             contacts.name AS contact_name,
             GROUP_CONCAT(tags.name, ', ') AS tags
      FROM tasks
      LEFT JOIN projects ON projects.id = tasks.project_id
      LEFT JOIN categories ON categories.id = tasks.category_id
      LEFT JOIN contacts ON contacts.id = tasks.contact_id
      LEFT JOIN task_tags ON task_tags.task_id = tasks.id
      LEFT JOIN tags ON tags.id = task_tags.tag_id
      ${whereSql}
      GROUP BY tasks.id
      ORDER BY ${sort} ${direction}, tasks.id DESC
    `).all(params);
  }

  create(data) {
    const insert = this.db.prepare(`
      INSERT INTO tasks
      (name, description, project_id, category_id, contact_id, priority, status, created_at, due_date, notes, completed_at)
      VALUES (@name, @description, @project_id, @category_id, @contact_id, @priority, @status, @created_at, @due_date, @notes, @completed_at)
    `);
    const transaction = this.db.transaction((payload) => {
      const info = insert.run(payload);
      this.setTags(info.lastInsertRowid, payload.tags || []);
      return info.lastInsertRowid;
    });
    const id = transaction(data);
    return this.findDetailedById(id);
  }

  update(id, data) {
    const update = this.db.prepare(`
      UPDATE tasks
      SET name = @name,
          description = @description,
          project_id = @project_id,
          category_id = @category_id,
          contact_id = @contact_id,
          priority = @priority,
          status = @status,
          created_at = @created_at,
          due_date = @due_date,
          notes = @notes,
          completed_at = @completed_at,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @id
    `);
    const transaction = this.db.transaction((payload) => {
      update.run({ ...payload, id });
      this.setTags(id, payload.tags || []);
    });
    transaction(data);
    return this.findDetailedById(id);
  }

  setTags(taskId, tags) {
    this.db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId);
    const insertTag = this.db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)');
    const selectTag = this.db.prepare('SELECT id FROM tags WHERE name = ?');
    const link = this.db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)');
    tags.map((tag) => String(tag).trim()).filter(Boolean).forEach((tag) => {
      insertTag.run(tag);
      link.run(taskId, selectTag.get(tag).id);
    });
  }

  markComplete(id) {
    this.db.prepare(`
      UPDATE tasks
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    return this.findDetailedById(id);
  }

  duplicate(id) {
    const original = this.findDetailedById(id);
    const copy = {
      ...original,
      name: `${original.name} (2)`,
      status: 'open',
      completed_at: null,
      created_at: new Date().toISOString(),
      tags: original.tags ? original.tags.split(',').map((tag) => tag.trim()) : []
    };
    delete copy.id;
    return this.create(copy);
  }

  findDetailedById(id) {
    return this.list({}).find((task) => Number(task.id) === Number(id));
  }

  dashboard() {
    const summary = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END) AS open_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_tasks,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) < date('now') AND status != 'completed' THEN 1 ELSE 0 END) AS overdue_tasks,
        SUM(CASE WHEN due_date IS NOT NULL AND date(due_date) = date('now') THEN 1 ELSE 0 END) AS today_tasks
      FROM tasks
    `).get();
    const byPriority = this.db.prepare('SELECT priority AS label, COUNT(*) AS value FROM tasks GROUP BY priority').all();
    const byProject = this.db.prepare(`
      SELECT COALESCE(projects.name, '__NO_PROJECT__') AS label, COUNT(tasks.id) AS value
      FROM tasks
      LEFT JOIN projects ON projects.id = tasks.project_id
      GROUP BY projects.name
      ORDER BY value DESC
    `).all();
    const byCategory = this.db.prepare(`
      SELECT COALESCE(categories.name, '__NO_CATEGORY__') AS label, COUNT(tasks.id) AS value
      FROM tasks
      LEFT JOIN categories ON categories.id = tasks.category_id
      GROUP BY categories.name
      ORDER BY value DESC
    `).all();
    const recent = this.db.prepare(`
      SELECT id, name, status, updated_at
      FROM tasks
      ORDER BY updated_at DESC
      LIMIT 8
    `).all();
    return { summary, byPriority, byProject, byCategory, recent };
  }
}

module.exports = TaskRepository;
