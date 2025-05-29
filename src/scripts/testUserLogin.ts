import mongoose from 'mongoose';
import { User } from '../models/User';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { config } from '../config';
import { logger } from '../utils/logger';

async function testUserLogin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    // Check existing users
    const users = await User.find({}).select('email userLogin firstName lastName');
    logger.info(`Found ${users.length} users:`);
    users.forEach(user => {
      logger.info(`- ${user.email} (userLogin: ${user.userLogin || 'NOT SET'})`);
    });

    // Check real schedule entries
    const schedules = await RealScheduleEntry.find({}).limit(5).select('userLogin skill');
    logger.info(`\nFound ${schedules.length} real schedule entries (showing first 5):`);
    schedules.forEach(schedule => {
      logger.info(`- ${schedule.userLogin}: ${schedule.skill}`);
    });

    // Try to link a user to a real schedule entry
    if (schedules.length > 0 && users.length > 0) {
      const firstSchedule = schedules[0];
      const testUser = users.find(u => u.email === 'employee@smartswap.local');
      
      if (testUser && !testUser.userLogin) {
        logger.info(`\nLinking user ${testUser.email} to schedule ${firstSchedule.userLogin}`);
        testUser.userLogin = firstSchedule.userLogin;
        await testUser.save();
        logger.info('✅ User linked successfully!');
      } else if (testUser?.userLogin) {
        logger.info(`\nUser ${testUser.email} already linked to ${testUser.userLogin}`);
      }
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
testUserLogin();
