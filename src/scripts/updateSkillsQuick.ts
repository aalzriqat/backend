import mongoose from 'mongoose';
import { RealScheduleEntry } from '../models/RealScheduleEntry';
import { Shift } from '../models/Shift';
import { config } from '../config';
import { logger } from '../utils/logger';

async function updateSkillsQuick() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    // Update all RealScheduleEntry documents
    const result = await RealScheduleEntry.updateMany(
      {}, // Update all documents
      { $set: { skill: 'AE Phone MU AR EN' } }
    );

    logger.info(`✅ Updated ${result.modifiedCount} schedule entries to "AE Phone MU AR EN"`);

    // Update all Shift documents
    const shiftResult = await Shift.updateMany(
      {}, // Update all shifts
      {
        $set: {
          skills: ['PhoneMU'], // Extracted from "AE Phone MU AR EN"
          marketplace: 'AE'
        }
      }
    );

    logger.info(`✅ Updated ${shiftResult.modifiedCount} shift documents`);

    // Show sample of updated schedules
    const sampleSchedules = await RealScheduleEntry.find({}).limit(5).select('userLogin skill');
    logger.info('\n📋 Sample of updated schedules:');
    sampleSchedules.forEach((schedule, index) => {
      logger.info(`   ${index + 1}. ${schedule.userLogin}: ${schedule.skill}`);
    });

    // Disconnect
    await mongoose.disconnect();
    logger.info('\n✅ Quick skill update completed successfully!');
    logger.info('🎯 All users now have: "AE Phone MU AR EN" skills');
    
  } catch (error) {
    logger.error('❌ Error updating skills:', error);
    process.exit(1);
  }
}

// Run the update
updateSkillsQuick();
