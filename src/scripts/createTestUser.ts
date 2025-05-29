import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';
import { User } from '../models/User';
import { RealScheduleEntry } from '../models/RealScheduleEntry';

const createTestUser = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB for test user creation');

    // Get the first real schedule entry to link to
    const firstSchedule = await RealScheduleEntry.findOne({});
    
    if (!firstSchedule) {
      logger.error('No real schedule entries found. Please run seed:real-schedules first.');
      return;
    }

    logger.info(`Found schedule for user: ${firstSchedule.userLogin} with skill: ${firstSchedule.skill}`);

    // Check if test user already exists
    const existingUser = await User.findOne({ email: 'test@smartswap.local' });
    if (existingUser) {
      logger.info('Test user already exists, updating with schedule link...');
      existingUser.userLogin = firstSchedule.userLogin;
      await existingUser.save();
      logger.info(`Updated test user with userLogin: ${firstSchedule.userLogin}`);
    } else {
      // Create test user linked to the first schedule
      const testUser = new User({
        email: 'test@smartswap.local',
        userLogin: firstSchedule.userLogin,
        password: 'password123', // This will be hashed automatically
        firstName: 'Test',
        lastName: 'User',
        role: 'Employee',
        skills: ['General'],
        marketplace: 'AE'
      });

      await testUser.save();
      logger.info(`Created test user linked to schedule: ${firstSchedule.userLogin}`);
    }

    // Verify the link works
    const user = await User.findOne({ email: 'test@smartswap.local' });
    const schedule = await RealScheduleEntry.findOne({ userLogin: user?.userLogin });
    
    if (user && schedule) {
      logger.info('✅ Test user successfully linked to real schedule data!');
      logger.info(`User: ${user.email} (${user.userLogin})`);
      logger.info(`Schedule: ${schedule.skill} - ${schedule.dailyShifts.filter(d => d.working).length} working days`);
    } else {
      logger.error('❌ Failed to link test user to schedule data');
    }

  } catch (error) {
    logger.error('Error creating test user:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};

// Run the script if this file is executed directly
if (require.main === module) {
  createTestUser()
    .then(() => {
      logger.info('Test user creation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Test user creation failed:', error);
      process.exit(1);
    });
}

export default createTestUser;
