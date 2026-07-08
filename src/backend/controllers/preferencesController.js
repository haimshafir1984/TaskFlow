function createPreferencesController(preferencesService) {
  return {
    get: (req, res) => res.json(preferencesService.get(req.user.id)),
    set: (req, res) => res.json(preferencesService.set(req.user.id, req.body))
  };
}

module.exports = createPreferencesController;
