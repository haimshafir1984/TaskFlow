function createAuthController(authService) {
  return {
    register: (req, res) => res.status(201).json(authService.register(req.body.username, req.body.password)),
    login: (req, res) => res.json(authService.login(req.body.username, req.body.password)),
    logout: (req, res) => res.json(authService.logout(readToken(req))),
    status: (req, res) => {
      const user = authService.verify(readToken(req));
      res.json({ authenticated: Boolean(user), user, hasUsers: authService.hasUsers() });
    },
    changePassword: (req, res) => res.json(authService.changePassword(req.user.id, req.body.currentPassword, req.body.nextPassword))
  };
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

module.exports = createAuthController;
