import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

// MongoDB connection
const MONGODB_URI = 'mongodb://localhost:27017/vision-app';

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, required: true, default: 'user' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

const User = mongoose.model('User', userSchema);

async function updateUserPassword() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get user input from command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
      console.log('Usage: node update-user-password.js <email> <newPassword>');
      console.log('Example: node update-user-password.js user@example.com newpass123');
      process.exit(1);
    }

    const [email, newPassword] = args;

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    // Hash the new password
    const hashedPassword = await bcryptjs.hash(newPassword, 10);

    // Update the password
    user.password = hashedPassword;
    await user.save();

    console.log(`✅ Password updated successfully!`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Email: ${email}`);
    console.log(`   New Password: ${newPassword} (stored as hash)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the function
updateUserPassword();