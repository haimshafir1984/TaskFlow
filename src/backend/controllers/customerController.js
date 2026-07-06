function createCustomerController(customerService) {
  return {
    list: (req, res) => res.json(customerService.list(req.user.id)),
    create: (req, res) => res.status(201).json(customerService.create(req.user.id, req.body)),
    update: (req, res) => res.json(customerService.update(req.user.id, req.params.id, req.body)),
    delete: (req, res) => res.status(204).json(customerService.delete(req.user.id, req.params.id))
  };
}

module.exports = createCustomerController;
