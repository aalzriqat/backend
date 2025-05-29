import { Router } from 'express';
import { getUsers, getUserById, updateUser, deleteUser } from '../controllers/userController';
import { authenticate, authorize } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// GET /api/users
router.get('/', getUsers);

// GET /api/users/:id
router.get('/:id', getUserById);

// PUT /api/users/:id
router.put('/:id', validate(schemas.updateUser), updateUser);

// DELETE /api/users/:id - Only WorkFlowManagement can delete users
router.delete('/:id', authorize('WorkFlowManagement', 'Developer'), deleteUser);

export default router;
