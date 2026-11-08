import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db.js';
import { ApiError } from './error.js';

export const signToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { expiresIn: config.jwtExpires });

export const authenticate = (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'Authentication required'));
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    // Re-check the user on every request so removed students lose access immediately.
    const user = db.prepare('SELECT id, role, enrollment, name, program FROM users WHERE id = ?').get(payload.sub);
    if (!user) return next(new ApiError(401, 'Account no longer exists'));
    req.user = user;
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
};

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new ApiError(403, 'You do not have permission to do this'));
