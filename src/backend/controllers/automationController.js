function createAutomationController(service) {
  return {
    integrations: {
      list: (req, res) => res.json(service.listIntegrations(req.user.id)),
      create: (req, res) => res.status(201).json(service.createIntegration(req.user.id, req.body)),
      update: (req, res) => res.json(service.updateIntegration(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(service.deleteIntegration(req.user.id, req.params.id)),
      incomingKey: (req, res) => res.status(201).json(service.createIncomingKey(req.user.id))
    },
    rules: {
      list: (req, res) => res.json(service.listRules(req.user.id)),
      create: (req, res) => res.status(201).json(service.createRule(req.user.id, req.body)),
      update: (req, res) => res.json(service.updateRule(req.user.id, req.params.id, req.body)),
      delete: (req, res) => res.status(204).json(service.deleteRule(req.user.id, req.params.id))
    },
    logs: (req, res) => res.json(service.logs(req.user.id, req.query.limit))
  };
}

module.exports = createAutomationController;
