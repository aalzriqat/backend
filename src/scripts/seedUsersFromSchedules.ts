import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';
import { User } from '../models/User';
import { RealScheduleEntry } from '../models/RealScheduleEntry';

// Helper function to extract marketplace from skill
const extractMarketplaceFromSkill = (skill: string): string => {
  if (skill.includes('AE')) return 'AE';
  if (skill.includes('SA')) return 'SA';
  if (skill.includes('UK')) return 'UK';
  if (skill.includes('EG')) return 'EG';
  return 'AE'; // Default fallback
};

// Helper function to map real skills to our skill enum
const mapSkillToEnum = (skill: string): string[] => {
  const mappedSkills: string[] = [];

  if (skill.toLowerCase().includes('phone') && skill.toLowerCase().includes('mu')) {
    mappedSkills.push('PhoneMU');
  } else if (skill.toLowerCase().includes('phone')) {
    mappedSkills.push('phoneOnly');
  } else if (skill.toLowerCase().includes('mu')) {
    mappedSkills.push('MuOnly');
  }

  if (skill.toLowerCase().includes('email')) {
    mappedSkills.push('Email');
  }

  if (skill.toLowerCase().includes('general')) {
    mappedSkills.push('General');
  }

  if (skill.toLowerCase().includes('specialty') || skill.toLowerCase().includes('swat')) {
    mappedSkills.push('Specialty');
  }

  // If no specific skills found, default to General
  if (mappedSkills.length === 0) {
    mappedSkills.push('General');
  }

  return mappedSkills;
};

// Helper function to generate email from userLogin
const generateEmailFromUserLogin = (userLogin: string): string => {
  // Convert userLogin to lowercase and create email with company domain
  const cleanLogin = userLogin.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${cleanLogin}@company.com`;
};

// Helper function to generate name from userLogin
const generateNameFromUserLogin = (userLogin: string): { firstName: string; lastName: string } => {
  // Capitalize first letter and split if possible
  const cleanName = userLogin.replace(/[^a-zA-Z]/g, '');

  if (cleanName.length <= 3) {
    return {
      firstName: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
      lastName: 'Employee'
    };
  }

  // Try to split name intelligently
  const mid = Math.ceil(cleanName.length / 2);
  return {
    firstName: cleanName.substring(0, mid).charAt(0).toUpperCase() + cleanName.substring(0, mid).slice(1),
    lastName: cleanName.substring(mid).charAt(0).toUpperCase() + cleanName.substring(mid).slice(1)
  };
};

const seedUsersFromSchedules = async (): Promise<void> => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB for user seeding');

    // Get all real schedule entries
    const scheduleEntries = await RealScheduleEntry.find({});
    logger.info(`Found ${scheduleEntries.length} schedule entries to create users for`);

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const scheduleEntry of scheduleEntries) {
      try {
        // Check if user already exists with this userLogin
        const existingUser = await User.findOne({ userLogin: scheduleEntry.userLogin });
        if (existingUser) {
          logger.debug(`User already exists for userLogin: ${scheduleEntry.userLogin}`);
          skippedCount++;
          continue;
        }

        // Check if email already exists
        const email = generateEmailFromUserLogin(scheduleEntry.userLogin);
        const existingEmailUser = await User.findOne({ email });
        if (existingEmailUser) {
          logger.warn(`Email already exists: ${email}, skipping userLogin: ${scheduleEntry.userLogin}`);
          skippedCount++;
          continue;
        }

        // Generate user data from schedule entry
        const { firstName, lastName } = generateNameFromUserLogin(scheduleEntry.userLogin);
        const marketplace = extractMarketplaceFromSkill(scheduleEntry.skill);
        const skills = mapSkillToEnum(scheduleEntry.skill);

        // Create new user
        const userData = {
          email,
          userLogin: scheduleEntry.userLogin,
          password: 'TempPass123!', // Default password - users must change this on first login
          firstName,
          lastName,
          role: 'Employee' as const,
          skills,
          marketplace
        };

        const user = new User(userData);
        await user.save();

        logger.info(`Created user: ${scheduleEntry.userLogin} (${email}) with skills: ${skills.join(', ')} in ${marketplace}`);
        createdCount++;

      } catch (error) {
        logger.error(`Error creating user for ${scheduleEntry.userLogin}:`, error);
        errorCount++;
      }
    }

    logger.info(`User seeding completed:`);
    logger.info(`- Created: ${createdCount} users`);
    logger.info(`- Skipped: ${skippedCount} users (already exist)`);
    logger.info(`- Errors: ${errorCount} users`);

    // Create a summary report
    const totalUsers = await User.countDocuments();
    const usersWithSchedules = await User.countDocuments({ userLogin: { $exists: true, $ne: null } });

    logger.info(`Database summary:`);
    logger.info(`- Total users: ${totalUsers}`);
    logger.info(`- Users with schedule data: ${usersWithSchedules}`);
    logger.info(`- Users without schedule data: ${totalUsers - usersWithSchedules}`);

  } catch (error) {
    logger.error('Error during user seeding:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
};

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedUsersFromSchedules()
    .then(() => {
      logger.info('User seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('User seeding failed:', error);
      process.exit(1);
    });
}

export default seedUsersFromSchedules;
