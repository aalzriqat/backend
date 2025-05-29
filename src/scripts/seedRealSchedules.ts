import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { config } from '../config';
import { logger } from '../utils/logger';

interface RawScheduleData {
  userLogin: string;
  skill: string;
  weekOff: string[];
  dailyShifts: {
    day: string;
    working: boolean;
    shiftStart: string | null;
    shiftEnd: string | null;
  }[];
  weekLabel: string; // This will be ignored
  lunch: string;
  break1: string;
  break2: string;
}

const seedRealSchedules = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB for seeding');

    // Read the JSON file
    const jsonPath = path.join(__dirname, '../../../smartswap_schedule_seed.json');

    if (!fs.existsSync(jsonPath)) {
      throw new Error(`Schedule seed file not found at: ${jsonPath}`);
    }

    const rawData: RawScheduleData[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    logger.info(`Found ${rawData.length} schedule entries to import`);

    // Clear existing data
    await RealScheduleEntry.deleteMany({});
    logger.info('Cleared existing schedule entries');

    // Remove duplicates by userLogin (keep the first occurrence)
    const uniqueData = new Map();
    const duplicates: string[] = [];

    for (const entry of rawData) {
      if (uniqueData.has(entry.userLogin)) {
        duplicates.push(entry.userLogin);
      } else {
        uniqueData.set(entry.userLogin, entry);
      }
    }

    if (duplicates.length > 0) {
      logger.warn(`Found ${duplicates.length} duplicate userLogins, keeping first occurrence only`);
      logger.info(`Duplicate userLogins: ${duplicates.slice(0, 10).join(', ')}${duplicates.length > 10 ? '...' : ''}`);
    }

    // Transform and validate data
    const transformedData = Array.from(uniqueData.values()).map(entry => ({
      userLogin: entry.userLogin,
      skill: entry.skill,
      weekOff: entry.weekOff || [],
      dailyShifts: entry.dailyShifts,
      lunch: entry.lunch,
      break1: entry.break1,
      break2: entry.break2
      // Note: weekLabel is intentionally omitted as it's not meaningful
    }));

    logger.info(`Processing ${transformedData.length} unique entries after deduplication`);

    // Insert individually with better error handling
    let insertedCount = 0;
    let errorCount = 0;
    const errors: { userLogin: string; error: string }[] = [];

    for (let i = 0; i < transformedData.length; i++) {
      const entry = transformedData[i];

      try {
        await RealScheduleEntry.create(entry);
        insertedCount++;

        if ((i + 1) % 100 === 0) {
          logger.info(`Processed ${i + 1}/${transformedData.length} entries (${insertedCount} successful, ${errorCount} errors)`);
        }
      } catch (error: any) {
        errorCount++;
        const errorMessage = error.message || 'Unknown error';
        errors.push({ userLogin: entry.userLogin, error: errorMessage });

        if (errorCount <= 10) {
          logger.error(`Error inserting entry for ${entry.userLogin}: ${errorMessage}`);
        }
      }
    }

    if (errorCount > 10) {
      logger.error(`... and ${errorCount - 10} more errors (showing first 10 only)`);
    }

    logger.info(`Successfully imported ${insertedCount} schedule entries (${errorCount} failed)`);

    // Log sample errors if any
    if (errors.length > 0) {
      logger.info('Sample validation errors:');
      errors.slice(0, 5).forEach(err => {
        logger.info(`  ${err.userLogin}: ${err.error}`);
      });
    }

    // Generate some statistics
    const stats = await generateStats();
    logger.info('Import Statistics:', stats);

  } catch (error) {
    logger.error('Error seeding real schedules:', error);
    throw error;
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed');
  }
};

const generateStats = async () => {
  const totalEntries = await RealScheduleEntry.countDocuments();

  const skillStats = await RealScheduleEntry.aggregate([
    {
      $group: {
        _id: '$skill',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const workingDaysStats = await RealScheduleEntry.aggregate([
    {
      $project: {
        userLogin: 1,
        workingDaysCount: {
          $size: {
            $filter: {
              input: '$dailyShifts',
              cond: { $eq: ['$$this.working', true] }
            }
          }
        }
      }
    },
    {
      $group: {
        _id: '$workingDaysCount',
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return {
    totalEntries,
    skillDistribution: skillStats,
    workingDaysDistribution: workingDaysStats
  };
};

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedRealSchedules()
    .then(() => {
      logger.info('Seeding completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seeding failed:', error);
      process.exit(1);
    });
}

export { seedRealSchedules };
