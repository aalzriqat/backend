import mongoose from 'mongoose';
import { User } from '../models/User';
import { config } from '../config';
import { logger } from '../utils/logger';
import { ShiftGenerationService } from '../services/shiftGenerationService';

async function testAPI() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    // Find the employee user
    const employee = await User.findOne({ email: 'employee@smartswap.local' });
    if (!employee) {
      logger.error('Employee user not found');
      return;
    }

    logger.info(`Found employee: ${employee.email} with userLogin: ${employee.userLogin}`);

    if (employee.userLogin) {
      // Test shift generation
      logger.info('Testing shift generation...');
      const shifts = await ShiftGenerationService.getUserShiftsForCurrentWeek(employee.userLogin);
      logger.info(`Generated/found ${shifts.length} shifts for current week:`);
      
      shifts.forEach((shift, index) => {
        logger.info(`  ${index + 1}. ${shift.date} (${shift.type}): ${shift.startTime} - ${shift.endTime} [${shift.marketplace}] {${shift.skills.join(', ')}}`);
      });

      // Test creating a swap intent (simulate)
      if (shifts.length > 0) {
        const testShift = shifts[0];
        logger.info(`\nTest shift for swap intent: ${testShift._id}`);
        logger.info(`  Date: ${testShift.date}`);
        logger.info(`  Time: ${testShift.startTime} - ${testShift.endTime}`);
        logger.info(`  Type: ${testShift.type}`);
        logger.info(`  Skills: ${testShift.skills.join(', ')}`);
        logger.info(`  Marketplace: ${testShift.marketplace}`);
      }
    } else {
      logger.warn('Employee user has no userLogin set');
    }

    // Disconnect
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    
  } catch (error) {
    logger.error('Error:', error);
    process.exit(1);
  }
}

// Run the test
testAPI();
