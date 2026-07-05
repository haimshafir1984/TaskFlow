function createCatalogController(catalogService) {
  return {
    priorities: {
      list: (req, res) => res.json(catalogService.listPriorities(req.user.id)),
      create: (req, res) => res.status(201).json(catalogService.createPriority(req.user.id, req.body)),
      update: (req, res) => res.json(catalogService.updatePriority(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deletePriority(req.user.id, req.params.id))
    },
    categories: {
      list: (req, res) => res.json(catalogService.listCategories(req.user.id)),
      create: (req, res) => res.status(201).json(catalogService.createCategory(req.user.id, req.body)),
      update: (req, res) => res.json(catalogService.updateCategory(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteCategory(req.user.id, req.params.id))
    },
    projects: {
      list: (req, res) => res.json(catalogService.listProjects(req.user.id)),
      create: (req, res) => res.status(201).json(catalogService.createProject(req.user.id, req.body)),
      update: (req, res) => res.json(catalogService.updateProject(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteProject(req.user.id, req.params.id))
    },
    contacts: {
      list: (req, res) => res.json(catalogService.listContacts(req.user.id)),
      create: (req, res) => res.status(201).json(catalogService.createContact(req.user.id, req.body)),
      update: (req, res) => res.json(catalogService.updateContact(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteContact(req.user.id, req.params.id))
    }
  };
}

module.exports = createCatalogController;
