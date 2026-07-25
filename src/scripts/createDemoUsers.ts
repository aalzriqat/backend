import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';
import { User } from '../models/User';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { Skill, UserRole, Marketplace } from '../types';

const createDemoUsers = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB for demo user creation');

    // Get some real schedule entries that aren't already linked to users
    const existingUserLogins = await User.find({ userLogin: { $exists: true, $ne: null } }).distinct('userLogin');
    const scheduleEntries = await RealScheduleEntry.find({
      userLogin: { $nin: existingUserLogins }
    }).limit(5);

    if (scheduleEntries.length === 0) {
      logger.error('No real schedule entries found. Please run seed:real-schedules first.');
      return;
    }

    logger.info(`Found ${scheduleEntries.length} schedule entries to create demo users for`);

    const demoUsers = [
      {
        email: 'employee@smartswap.app',
        password: 'password123',
        firstName: 'John',
        lastName: 'Employee',
        role: 'Employee' as UserRole,
        skills: ['General'] as Skill[],
        marketplace: 'AE' as Marketplace,
        userLogin: scheduleEntries[0]?.userLogin
      },
      {
        email: 'manager@smartswap.app',
        password: 'password123',
        firstName: 'Sarah',
        lastName: 'Manager',
        role: 'Manager' as UserRole,
        skills: ['PhoneMU', 'Email'] as Skill[],
        marketplace: 'AE' as Marketplace,
        userLogin: scheduleEntries[1]?.userLogin
      },
      {
        email: 'admin@smartswap.app',
        password: 'password123',
        firstName: 'Alex',
        lastName: 'Admin',
        role: 'WorkFlowManagement' as UserRole,
        skills: ['PhoneMU', 'Email', 'General'] as Skill[],
        marketplace: 'AE' as Marketplace,
        userLogin: scheduleEntries[2]?.userLogin
      },
      {
        email: 'developer@smartswap.app',
        password: 'password123',
        firstName: 'Dev',
        lastName: 'User',
        role: 'Developer' as UserRole,
        skills: ['PhoneMU', 'Email', 'General', 'Specialty'] as Skill[],
        marketplace: 'AE' as Marketplace,
        userLogin: scheduleEntries[3]?.userLogin
      }
    ];

    let createdCount = 0;
    let updatedCount = 0;

    for (const userData of demoUsers) {
      try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: userData.email });

        if (existingUser) {
          // Update existing user with schedule link
          existingUser.userLogin = userData.userLogin;
          existingUser.role = userData.role;
          existingUser.skills = userData.skills;
          existingUser.marketplace = userData.marketplace;
          await existingUser.save();

          logger.info(`Updated existing user: ${userData.email} with userLogin: ${userData.userLogin}`);
          updatedCount++;
        } else {
          // Create new user
          const user = new User(userData);
          await user.save();

          logger.info(`Created new user: ${userData.email} (${userData.role}) with userLogin: ${userData.userLogin}`);
          createdCount++;
        }

        // Verify the link works
        const user = await User.findOne({ email: userData.email });
        const schedule = await RealScheduleEntry.findOne({ userLogin: user?.userLogin });

        if (user && schedule) {
          logger.info(`✅ User ${userData.email} successfully linked to schedule: ${schedule.skill}`);
        } else {
          logger.warn(`⚠️ User ${userData.email} created but schedule link verification failed`);
        }

      } catch (error) {
        logger.error(`Error processing user ${userData.email}:`, error);
      }
    }

    logger.info(`Demo user creation completed:`);
    logger.info(`- Created: ${createdCount} users`);
    logger.info(`- Updated: ${updatedCount} users`);

    // Display login credentials
    logger.info(`\n🔐 Demo User Credentials:`);
    logger.info(`Employee: employee@smartswap.app / password123`);
    logger.info(`Manager: manager@smartswap.app / password123`);
    logger.info(`Admin: admin@smartswap.app / password123`);
    logger.info(`Developer: developer@smartswap.app / password123`);
    logger.info(`\nAll users are linked to real schedule data and ready for testing!`);

  } catch (error) {
    logger.error('Error creating demo users:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};

// Run the script if called directly
if (require.main === module) {
  createDemoUsers()
    .then(() => {
      logger.info('Demo user creation script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Demo user creation script failed:', error);
      process.exit(1);
    });
}

export default createDemoUsers;
