function requireAuth(authService) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!authService.verify(token)) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    next();
  };
}

module.exports = { requireAuth };
