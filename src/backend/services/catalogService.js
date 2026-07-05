class CatalogService {
  constructor(projectRepository, contactRepository, categoryRepository) {
    this.projects = projectRepository;
    this.contacts = contactRepository;
    this.categories = categoryRepository;
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

module.exports = CatalogService;

