import mongoose from 'mongoose';

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/vision-app';

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: false },  // Made optional for now
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, default: 'user' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

const User = mongoose.model('User', userSchema);

async function deleteUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get user input from command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
      console.log('Usage: node delete-user.js <email>');
      console.log('Example: node delete-user.js user@example.com');
      process.exit(1);
    }

    const [email] = args;

    // Find and delete user by email
    const result = await User.deleteOne({ email });

    if (result.deletedCount === 0) {
      console.log(`❌ No user found with email: ${email}`);
    } else {
      console.log(`✅ User with email ${email} deleted successfully!`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the function
deleteUser();