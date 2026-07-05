function createCatalogController(catalogService) {
  return {
    priorities: {
      list: (req, res) => res.json(catalogService.listPriorities()),
      create: (req, res) => res.status(201).json(catalogService.createPriority(req.body)),
      update: (req, res) => res.json(catalogService.updatePriority(req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deletePriority(req.params.id))
    },
    categories: {
      list: (req, res) => res.json(catalogService.listCategories()),
      create: (req, res) => res.status(201).json(catalogService.createCategory(req.body)),
      update: (req, res) => res.json(catalogService.updateCategory(req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteCategory(req.params.id))
    },
    projects: {
      list: (req, res) => res.json(catalogService.listProjects()),
      create: (req, res) => res.status(201).json(catalogService.createProject(req.body)),
      update: (req, res) => res.json(catalogService.updateProject(req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteProject(req.params.id))
    },
    contacts: {
      list: (req, res) => res.json(catalogService.listContacts()),
      create: (req, res) => res.status(201).json(catalogService.createContact(req.body)),
      update: (req, res) => res.json(catalogService.updateContact(req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(catalogService.deleteContact(req.params.id))
    }
  };
}

module.exports = createCatalogController;
