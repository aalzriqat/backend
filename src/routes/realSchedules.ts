import { Router } from 'express';
import {
  getAllSchedules,
  getMySchedule,
  getMyShifts,
  getScheduleByUserLogin,
  getSchedulesBySkill,
  getAvailableSkills,
  getScheduleStats,
  findSwapMatches
} from '../controllers/realScheduleController';
import { authenticate } from '../middleware/auth';

const router = Router();

console.log('Real schedules routes loaded!');

// Apply authentication middleware to all routes
// router.use(authenticate); // Temporarily disabled for testing

// GET /api/real-schedules - Get all schedules with filtering and pagination
router.get('/', getAllSchedules);

// GET /api/real-schedules/stats - Get schedule statistics
router.get('/stats', getScheduleStats);

// GET /api/real-schedules/skills - Get available skills
router.get('/skills', getAvailableSkills);

// GET /api/real-schedules/my-schedule - Get authenticated user's own schedule
router.get('/my-schedule', authenticate, getMySchedule);

// GET /api/real-schedules/my-shifts - Get authenticated user's shifts (auto-generates if needed)
router.get('/my-shifts', authenticate, getMyShifts);

// GET /api/real-schedules/user/:userLogin - Get schedule by user login
router.get('/user/:userLogin', getScheduleByUserLogin);

// GET /api/real-schedules/skill/:skill - Get schedules by skill
router.get('/skill/:skill', getSchedulesBySkill);

// GET /api/real-schedules/user/:userLogin/matches - Find potential swap matches
router.get('/user/:userLogin/matches', findSwapMatches);

export default router;
// Force restart
