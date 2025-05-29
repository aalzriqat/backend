import { Router } from 'express';
import {
  detectSwapChains,
  getUserSwapChains,
  getSwapChain,
  approveChainParticipation,
  rejectChainParticipation,
  executeSwapChain,
  getChainExecutionStatus,
  getActiveSwapChains
} from '../controllers/swapChainController';
import { authenticate, authorize } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// All swap chain routes require authentication
router.use(authenticate);

// GET /api/swap-chains/active - Get all active swap chains (admin/management only)
router.get('/active', authorize('WorkFlowManagement', 'Developer', 'Manager'), getActiveSwapChains);

// POST /api/swap-chains/detect/:intentId - Find chains for a specific intent
router.post('/detect/:intentId', validate(schemas.detectSwapChains), detectSwapChains);

// GET /api/swap-chains/user/:userId - Get swap chains for a specific user
router.get('/user/:userId', getUserSwapChains);

// GET /api/swap-chains/:chainId - Get a specific swap chain
router.get('/:chainId', getSwapChain);

// POST /api/swap-chains/:chainId/approve - Approve participation in a chain
router.post('/:chainId/approve', validate(schemas.approveChainParticipation), approveChainParticipation);

// POST /api/swap-chains/:chainId/reject - Reject participation in a chain
router.post('/:chainId/reject', validate(schemas.rejectChainParticipation), rejectChainParticipation);

// POST /api/swap-chains/:chainId/execute - Execute a fully approved chain
router.post('/:chainId/execute', authorize('WorkFlowManagement', 'Developer', 'Manager'), executeSwapChain);

// GET /api/swap-chains/:chainId/status - Get execution status of a chain
router.get('/:chainId/status', getChainExecutionStatus);

export default router;
