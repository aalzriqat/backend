import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

async function fixSwapIntentIndexes() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoUri);
    logger.info('Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('swapintents');

    // Get existing indexes
    const indexes = await collection.indexes();
    logger.info('Current indexes:');
    indexes.forEach((index, i) => {
      logger.info(`  ${i + 1}. ${JSON.stringify(index.key)} (${index.name})`);
    });

    // Drop the problematic compound index if it exists
    try {
      const problematicIndexes = indexes.filter(index => {
        const key = index.key;
        return key.status && key.preferredTimeSlots && key.preferredMarketplaces;
      });

      for (const index of problematicIndexes) {
        logger.info(`Dropping problematic index: ${index.name}`);
        await collection.dropIndex(index.name);
        logger.info(`✅ Dropped index: ${index.name}`);
      }

      if (problematicIndexes.length === 0) {
        logger.info('No problematic indexes found');
      }

    } catch (error) {
      logger.warn('Error dropping indexes (they may not exist):', error);
    }

    // Create the new separate indexes
    try {
      logger.info('Creating new indexes...');
      
      await collection.createIndex({ status: 1, preferredTimeSlots: 1 });
      logger.info('✅ Created index: { status: 1, preferredTimeSlots: 1 }');
      
      await collection.createIndex({ status: 1, preferredMarketplaces: 1 });
      logger.info('✅ Created index: { status: 1, preferredMarketplaces: 1 }');
      
    } catch (error) {
      logger.warn('Error creating indexes (they may already exist):', error);
    }

    // Show final indexes
    const finalIndexes = await collection.indexes();
    logger.info('\nFinal indexes:');
    finalIndexes.forEach((index, i) => {
      logger.info(`  ${i + 1}. ${JSON.stringify(index.key)} (${index.name})`);
    });

    // Disconnect
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
    logger.info('✅ Index fix completed successfully!');
    
  } catch (error) {
    logger.error('Error fixing indexes:', error);
    process.exit(1);
  }
}

// Run the fix
fixSwapIntentIndexes();
