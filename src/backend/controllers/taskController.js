function createTaskController(taskService) {
  return {
    list: (req, res) => res.json(taskService.list(req.user.id, req.query)),
    dashboard: (req, res) => res.json(taskService.dashboard(req.user.id)),
    create: (req, res) => res.status(201).json(taskService.create(req.user.id, req.body)),
    update: (req, res) => res.json(taskService.update(req.user.id, req.params.id, req.body)),
    delete: (req, res) => res.status(204).json(taskService.delete(req.user.id, req.params.id)),
    complete: (req, res) => res.json(taskService.complete(req.user.id, req.params.id)),
    duplicate: (req, res) => res.status(201).json(taskService.duplicate(req.user.id, req.params.id))
  };
}

module.exports = createTaskController;
