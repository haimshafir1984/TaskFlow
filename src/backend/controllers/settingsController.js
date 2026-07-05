function createSettingsController(settingsService, taskService) {
  return {
    list: (req, res) => {
      const settings = settingsService.all();
      delete settings.auth_password_hash;
      delete settings.auth_password_salt;
      res.json(settings);
    },
    set: (req, res) => res.json(settingsService.set(req.body.key, req.body.value)),
    exportCsv: (req, res) => res.json(settingsService.exportCsv(taskService.list({}), req.body.destination)),
    importCsv: (req, res) => res.json(settingsService.importCsv(req.body.source, taskService)),
    backup: (req, res) => res.json(settingsService.backup(req.body.destination)),
    restore: (req, res) => res.json(settingsService.restore(req.body.source))
  };
}

module.exports = createSettingsController;


