import mongoose from 'mongoose';

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/vision-app';

async function checkAllCollections() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get database instance
    const db = mongoose.connection.db;
    
    // List all collections
    const collections = await db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('❌ No collections found in the database');
    } else {
      console.log(`📊 Found ${collections.length} collections:\n`);
      
      for (const collection of collections) {
        console.log(`🗂️  Collection: ${collection.name}`);
        
        // Get document count
        const documentCount = await db.collection(collection.name).countDocuments();
        console.log(`   📄 Documents: ${documentCount}`);
        
        if (documentCount > 0) {
          // Show first few documents
          const sampleDocs = await db.collection(collection.name).find({}).limit(3).toArray();
          console.log(`   📋 Sample documents:`);
          sampleDocs.forEach((doc, index) => {
            console.log(`      ${index + 1}. ${JSON.stringify(doc, null, 2)}`);
          });
        }
        console.log('---');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the function
checkAllCollections();