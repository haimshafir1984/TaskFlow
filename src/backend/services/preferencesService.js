class PreferencesService {
  constructor(preferencesRepository) {
    this.repo = preferencesRepository;
  }

  get(userId) {
    return this.repo.get(userId);
  }

  set(userId, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      const error = new Error('Invalid preferences payload');
      error.status = 422;
      throw error;
    }
    return this.repo.set(userId, payload);
  }
}

module.exports = PreferencesService;
