function createAuthController(authService) {
  return {
    login: (req, res) => res.json(authService.login(req.body.password)),
    logout: (req, res) => res.json(authService.logout(readToken(req))),
    status: (req, res) => res.json({ authenticated: authService.verify(readToken(req)) }),
    changePassword: (req, res) => res.json(authService.changePassword(req.body.currentPassword, req.body.nextPassword))
  };
}

function readToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

module.exports = createAuthController;
