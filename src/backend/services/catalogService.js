class CatalogService {
  constructor(projectRepository, contactRepository, categoryRepository, priorityRepository) {
    this.projects = projectRepository;
    this.contacts = contactRepository;
    this.categories = categoryRepository;
    this.priorities = priorityRepository;
  }


  listPriorities(userId) {
    return this.priorities.list(userId);
  }

  createPriority(userId, payload) {
    const name = String(payload.name || '').trim();
    return this.priorities.create({
      user_id: Number(userId),
      key: normalizeKey(payload.key || name),
      name,
      color: payload.color || '#2f80ed',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  updatePriority(userId, id, payload) {
    const name = String(payload.name || '').trim();
    return this.priorities.update(userId, id, {
      key: normalizeKey(payload.key || name),
      name,
      color: payload.color || '#2f80ed',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  deletePriority(userId, id) {
    return this.priorities.deleteForUser(userId, id);
  }

  listCategories(userId) {
    return this.categories.list(userId);
  }

  createCategory(userId, payload) {
    return this.categories.create({
      user_id: Number(userId),
      name: String(payload.name || '').trim(),
      color: payload.color || '#2f80ed',
      description: payload.description || '',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  updateCategory(userId, id, payload) {
    return this.categories.update(userId, id, {
      name: String(payload.name || '').trim(),
      color: payload.color || '#2f80ed',
      description: payload.description || '',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  deleteCategory(userId, id) {
    return this.categories.deleteForUser(userId, id);
  }

  listProjects(userId) {
    return this.projects.list(userId);
  }

  createProject(userId, payload) {
    return this.projects.create({
      user_id: Number(userId),
      name: String(payload.name || '').trim(),
      category_id: payload.category_id ? Number(payload.category_id) : null,
      color: payload.color || '#2f80ed',
      description: payload.description || ''
    });
  }

  updateProject(userId, id, payload) {
    return this.projects.update(userId, id, {
      name: String(payload.name || '').trim(),
      category_id: payload.category_id ? Number(payload.category_id) : null,
      color: payload.color || '#2f80ed',
      description: payload.description || ''
    });
  }

  deleteProject(userId, id) {
    return this.projects.deleteForUser(userId, id);
  }

  listContacts(userId) {
    return this.contacts.list(userId);
  }

  createContact(userId, payload) {
    return this.contacts.create({
      user_id: Number(userId),
      name: String(payload.name || '').trim(),
      phone: payload.phone || '',
      email: payload.email || '',
      notes: payload.notes || ''
    });
  }

  updateContact(userId, id, payload) {
    return this.contacts.update(userId, id, {
      name: String(payload.name || '').trim(),
      phone: payload.phone || '',
      email: payload.email || '',
      notes: payload.notes || ''
    });
  }

  deleteContact(userId, id) {
    return this.contacts.deleteForUser(userId, id);
  }

  seedUserDefaults(userId) {
    const uid = Number(userId);
    const insertPriority = this.priorities.db.prepare(`
      INSERT OR IGNORE INTO priorities (user_id, key, name, color, sort_order, is_default)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertPriority.run(uid, 'low', '\u05e0\u05de\u05d5\u05db\u05d4', '#22c55e', 1, 1);
    insertPriority.run(uid, 'medium', '\u05d1\u05d9\u05e0\u05d5\u05e0\u05d9\u05ea', '#2f80ed', 2, 1);
    insertPriority.run(uid, 'high', '\u05d2\u05d1\u05d5\u05d4\u05d4', '#f59e0b', 3, 1);
    insertPriority.run(uid, 'urgent', '\u05d3\u05d7\u05d5\u05e4\u05d4', '#ef5350', 4, 1);

    const insertCategory = this.categories.db.prepare('INSERT OR IGNORE INTO categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)');
    insertCategory.run(uid, '\u05de\u05e9\u05d9\u05de\u05d5\u05ea \u05d0\u05d9\u05e9\u05d9\u05d5\u05ea', '#2f80ed', 1);
    insertCategory.run(uid, '\u05e1\u05d9\u05d3\u05d5\u05e8\u05d9\u05dd', '#12a594', 2);
    insertCategory.run(uid, '\u05de\u05e9\u05e4\u05d7\u05d4', '#ef5350', 3);
    insertCategory.run(uid, '\u05e4\u05d9\u05ea\u05d5\u05d7 \u05e2\u05e1\u05e7\u05d9', '#8b5cf6', 4);
    insertCategory.run(uid, '\u05e7\u05e0\u05d9\u05d5\u05ea', '#f59e0b', 5);

    const businessId = this.categories.db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?').get(uid, '\u05e4\u05d9\u05ea\u05d5\u05d7 \u05e2\u05e1\u05e7\u05d9')?.id;
    const shoppingId = this.categories.db.prepare('SELECT id FROM categories WHERE user_id = ? AND name = ?').get(uid, '\u05e7\u05e0\u05d9\u05d5\u05ea')?.id;
    const insertProject = this.projects.db.prepare('INSERT OR IGNORE INTO projects (user_id, name, category_id, color, description) VALUES (?, ?, ?, ?, ?)');
    insertProject.run(uid, '\u05db\u05dc\u05dc\u05d9', businessId, '#2f80ed', '');
    insertProject.run(uid, '\u05e7\u05e0\u05d9\u05d5\u05ea \u05e7\u05d8\u05e0\u05d5\u05ea', shoppingId, '#38bdf8', '');
    insertProject.run(uid, '\u05e7\u05e0\u05d9\u05d5\u05ea \u05d2\u05d3\u05d5\u05dc\u05d5\u05ea', shoppingId, '#f97316', '');
    insertProject.run(uid, '\u05e1\u05d5\u05e4\u05e8 \u05d5\u05de\u05d5\u05e6\u05e8\u05d9 \u05de\u05d6\u05d5\u05df', shoppingId, '#22c55e', '');
  }
}

function normalizeKey(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `priority_${Date.now()}`;
}

module.exports = CatalogService;

