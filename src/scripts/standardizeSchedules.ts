import mongoose from 'mongoose';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { Shift } from '../models/Shift';
import { config } from '../config';
import { logger } from '../utils/logger';

// Standard values to apply to all schedules
const STANDARD_SKILL = 'AE Phone MU AR EN';
const STANDARD_MARKETPLACE = 'AE';

async function standardizeSchedules() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    // Get all real schedule entries
    const schedules = await RealScheduleEntry.find({});
    logger.info(`Found ${schedules.length} schedule entries to standardize`);

    let updatedCount = 0;
    let errorCount = 0;

    // Update each schedule entry
    for (const schedule of schedules) {
      try {
        const originalSkill = schedule.skill;

        // Update the skill to standard value
        schedule.skill = STANDARD_SKILL;
        await schedule.save();

        logger.info(`✅ Updated ${schedule.userLogin}: "${originalSkill}" → "${STANDARD_SKILL}"`);
        updatedCount++;

      } catch (error) {
        logger.error(`❌ Error updating ${schedule.userLogin}:`, error);
        errorCount++;
      }
    }

    logger.info(`\n📊 Schedule Update Summary:`);
    logger.info(`   ✅ Successfully updated: ${updatedCount}`);
    logger.info(`   ❌ Errors: ${errorCount}`);
    logger.info(`   📋 Standard skill: "${STANDARD_SKILL}"`);
    logger.info(`   🌍 Standard marketplace: "${STANDARD_MARKETPLACE}"`);

    // Now update any existing Shift documents to match
    logger.info('\n🔄 Updating existing Shift documents...');

    const shiftUpdateResult = await Shift.updateMany(
      {}, // Update all shifts
      {
        $set: {
          skills: ['PhoneMU'], // Extracted from "AE Phone+MU"
          marketplace: STANDARD_MARKETPLACE
        }
      }
    );

    logger.info(`✅ Updated ${shiftUpdateResult.modifiedCount} existing shift documents`);

    // Show sample of updated schedules
    logger.info('\n📋 Sample of updated schedules:');
    const sampleSchedules = await RealScheduleEntry.find({}).limit(5).select('userLogin skill');
    sampleSchedules.forEach((schedule, index) => {
      logger.info(`   ${index + 1}. ${schedule.userLogin}: ${schedule.skill}`);
    });

    // Disconnect
    await mongoose.disconnect();
    logger.info('\n✅ Standardization completed successfully!');
    logger.info('\n🎯 Next steps:');
    logger.info('   1. Users can now create swap intents');
    logger.info('   2. Smart matching should find compatible partners');
    logger.info('   3. All users will have the same skill/marketplace for testing');

  } catch (error) {
    logger.error('❌ Error standardizing schedules:', error);
    process.exit(1);
  }
}

// Run the standardization
standardizeSchedules();
