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

async function addUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get user input from command line arguments
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.log('Usage: node add-user.js <username> <email> <password> [role]');
      console.log('Example: node add-user.js john john@example.com password123 admin');
      console.log('Role defaults to "user" if not specified');
      process.exit(1);
    }

    const [username, email, password, role = 'user'] = args;

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ username }, { email }] 
    });

    if (existingUser) {
      console.log('❌ User already exists with this username or email');
      process.exit(1);
    }

    // Hash the password
    const hashedPassword = await bcryptjs.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      isActive: true
    });

    await newUser.save();
    console.log(`✅ User created successfully!`);
    console.log(`   Username: ${username}`);
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    console.log(`   Password: ${password} (stored as hash)`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Run the function
addUser();