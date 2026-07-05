class CatalogService {
  constructor(projectRepository, contactRepository, categoryRepository, priorityRepository) {
    this.projects = projectRepository;
    this.contacts = contactRepository;
    this.categories = categoryRepository;
    this.priorities = priorityRepository;
  }


  listPriorities() {
    return this.priorities.list();
  }

  createPriority(payload) {
    const name = String(payload.name || '').trim();
    return this.priorities.create({
      key: normalizeKey(payload.key || name),
      name,
      color: payload.color || '#2f80ed',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  updatePriority(id, payload) {
    const name = String(payload.name || '').trim();
    return this.priorities.update(id, {
      key: normalizeKey(payload.key || name),
      name,
      color: payload.color || '#2f80ed',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  deletePriority(id) {
    return this.priorities.delete(id);
  }

  listCategories() {
    return this.categories.list();
  }

  createCategory(payload) {
    return this.categories.create({
      name: String(payload.name || '').trim(),
      color: payload.color || '#2f80ed',
      description: payload.description || '',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  updateCategory(id, payload) {
    return this.categories.update(id, {
      name: String(payload.name || '').trim(),
      color: payload.color || '#2f80ed',
      description: payload.description || '',
      sort_order: Number(payload.sort_order || 0)
    });
  }

  deleteCategory(id) {
    return this.categories.delete(id);
  }

  listProjects() {
    return this.projects.list();
  }

  createProject(payload) {
    return this.projects.create({
      name: String(payload.name || '').trim(),
      category_id: payload.category_id ? Number(payload.category_id) : null,
      color: payload.color || '#2f80ed',
      description: payload.description || ''
    });
  }

  updateProject(id, payload) {
    return this.projects.update(id, {
      name: String(payload.name || '').trim(),
      category_id: payload.category_id ? Number(payload.category_id) : null,
      color: payload.color || '#2f80ed',
      description: payload.description || ''
    });
  }

  deleteProject(id) {
    return this.projects.delete(id);
  }

  listContacts() {
    return this.contacts.list();
  }

  createContact(payload) {
    return this.contacts.create({
      name: String(payload.name || '').trim(),
      phone: payload.phone || '',
      email: payload.email || '',
      notes: payload.notes || ''
    });
  }

  updateContact(id, payload) {
    return this.contacts.update(id, {
      name: String(payload.name || '').trim(),
      phone: payload.phone || '',
      email: payload.email || '',
      notes: payload.notes || ''
    });
  }

  deleteContact(id) {
    return this.contacts.delete(id);
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

