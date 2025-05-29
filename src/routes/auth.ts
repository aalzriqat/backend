import { Router } from 'express';
import { login, register, getCurrentUser, logout } from '../controllers/authController';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// POST /api/auth/login
router.post('/login', validate(schemas.login), login);

// POST /api/auth/register
router.post('/register', validate(schemas.register), register);

// GET /api/auth/me
router.get('/me', authenticate, getCurrentUser);

// POST /api/auth/logout
router.post('/logout', authenticate, logout);

export default router;
