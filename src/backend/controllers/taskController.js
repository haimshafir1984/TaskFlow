function createTaskController(taskService) {
  return {
    list: (req, res) => res.json(taskService.list(req.query)),
    dashboard: (req, res) => res.json(taskService.dashboard()),
    create: (req, res) => res.status(201).json(taskService.create(req.body)),
    update: (req, res) => res.json(taskService.update(req.params.id, req.body)),
    delete: (req, res) => res.status(204).json(taskService.delete(req.params.id)),
    complete: (req, res) => res.json(taskService.complete(req.params.id)),
    duplicate: (req, res) => res.status(201).json(taskService.duplicate(req.params.id))
  };
}

module.exports = createTaskController;
