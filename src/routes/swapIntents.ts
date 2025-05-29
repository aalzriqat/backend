import { Router } from 'express';
import { 
  getUserSwapIntents,
  createSwapIntent,
  updateSwapIntent,
  cancelSwapIntent,
  findSmartMatches,
  getActiveSwapIntents,
  getUserPreferences,
  updateUserPreferences
} from '../controllers/swapIntentController';
import { authenticate } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';

const router = Router();

// All swap intent routes require authentication
router.use(authenticate);

// GET /api/swap-intents/active - Get all active swap intents (for browsing)
router.get('/active', getActiveSwapIntents);

// GET /api/swap-intents/user/:userId - Get swap intents for a specific user
router.get('/user/:userId', getUserSwapIntents);

// POST /api/swap-intents - Create a new swap intent
router.post('/', validate(schemas.createSwapIntent), createSwapIntent);

// PUT /api/swap-intents/:id - Update a swap intent
router.put('/:id', validate(schemas.updateSwapIntent), updateSwapIntent);

// DELETE /api/swap-intents/:id - Cancel a swap intent
router.delete('/:id', cancelSwapIntent);

// GET /api/swap-intents/:id/matches - Find smart matches for a swap intent
router.get('/:id/matches', findSmartMatches);

// Preferences routes
// GET /api/swap-intents/preferences - Get user preferences
router.get('/preferences', getUserPreferences);

// PUT /api/swap-intents/preferences - Update user preferences
router.put('/preferences', validate(schemas.updateUserPreferences), updateUserPreferences);

export default router;
