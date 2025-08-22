import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';
import Document from '../models/Document.js';
import ProcessingSession from '../models/ProcessingSession.js';

dotenv.config({ path: '../.env' });

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/vision-app');
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const commands = {
  // List all users
  'list-users': async () => {
    const users = await User.find().select('-password');
    console.log('\n📋 Users in database:');
    users.forEach(user => {
      console.log(`  - ${user.username} (${user.email}) - Role: ${user.role}`);
    });
    console.log(`\nTotal users: ${users.length}`);
  },

  // List all documents
  'list-documents': async () => {
    const documents = await Document.find()
      .populate('processedBy', 'username')
      .sort('-createdAt')
      .limit(20);
    
    console.log('\n📄 Recent documents:');
    documents.forEach(doc => {
      console.log(`  - ${doc.originalName} (${doc.status}) - ${doc.createdAt.toLocaleDateString()}`);
    });
    console.log(`\nTotal shown: ${documents.length}`);
  },

  // Create a new user
  'create-user': async () => {
    const [username, email, password, role = 'user'] = process.argv.slice(3);
    
    if (!username || !email || !password) {
      console.log('❌ Usage: node db-manager.js create-user <username> <email> <password> [role]');
      return;
    }

    try {
      const user = new User({ username, email, password, role });
      await user.save();
      console.log(`✅ User created: ${username} (${email}) with role: ${role}`);
    } catch (error) {
      console.error('❌ Error creating user:', error.message);
    }
  },

  // Delete a user
  'delete-user': async () => {
    const username = process.argv[3];
    
    if (!username) {
      console.log('❌ Usage: node db-manager.js delete-user <username>');
      return;
    }

    try {
      const result = await User.deleteOne({ username });
      if (result.deletedCount > 0) {
        console.log(`✅ User deleted: ${username}`);
      } else {
        console.log(`❌ User not found: ${username}`);
      }
    } catch (error) {
      console.error('❌ Error deleting user:', error.message);
    }
  },

  // Database statistics
  'stats': async () => {
    const userCount = await User.countDocuments();
    const docCount = await Document.countDocuments();
    const sessionCount = await ProcessingSession.countDocuments();
    
    const docsByStatus = await Document.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    console.log('\n📊 Database Statistics:');
    console.log('========================');
    console.log(`👥 Users: ${userCount}`);
    console.log(`📄 Documents: ${docCount}`);
    console.log(`🔄 Sessions: ${sessionCount}`);
    
    console.log('\n📈 Documents by Status:');
    docsByStatus.forEach(status => {
      console.log(`  - ${status._id}: ${status.count}`);
    });
  },

  // Clean old documents
  'clean-old': async () => {
    const daysOld = parseInt(process.argv[3]) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Document.deleteMany({
      createdAt: { $lt: cutoffDate },
      status: 'failed'
    });

    console.log(`✅ Deleted ${result.deletedCount} failed documents older than ${daysOld} days`);
  },

  // Reset admin password
  'reset-admin': async () => {
    const newPassword = process.argv[3] || 'admin123';
    
    try {
      const admin = await User.findOne({ username: 'admin' });
      if (!admin) {
        console.log('❌ Admin user not found');
        return;
      }
      
      admin.password = newPassword;
      await admin.save();
      console.log(`✅ Admin password reset to: ${newPassword}`);
    } catch (error) {
      console.error('❌ Error resetting password:', error.message);
    }
  },

  // Export data
  'export': async () => {
    const users = await User.find().select('-password').lean();
    const documents = await Document.find().lean();
    
    const exportData = {
      exportDate: new Date(),
      users,
      documents,
      documentCount: documents.length,
      userCount: users.length
    };

    const fileName = `export-${Date.now()}.json`;
    require('fs').writeFileSync(fileName, JSON.stringify(exportData, null, 2));
    console.log(`✅ Data exported to ${fileName}`);
  }
};

// Main execution
const main = async () => {
  const command = process.argv[2];

  if (!command || !commands[command]) {
    console.log('🛠️  MongoDB Database Manager');
    console.log('============================\n');
    console.log('Available commands:');
    console.log('  node db-manager.js list-users                        - List all users');
    console.log('  node db-manager.js list-documents                    - List recent documents');
    console.log('  node db-manager.js create-user <user> <email> <pwd>  - Create new user');
    console.log('  node db-manager.js delete-user <username>            - Delete a user');
    console.log('  node db-manager.js stats                             - Show database statistics');
    console.log('  node db-manager.js clean-old [days]                  - Clean old failed documents');
    console.log('  node db-manager.js reset-admin [password]            - Reset admin password');
    console.log('  node db-manager.js export                            - Export data to JSON');
    process.exit(0);
  }

  await connectDB();
  await commands[command]();
  await mongoose.connection.close();
  console.log('\n✅ Done');
};

main().catch(console.error);