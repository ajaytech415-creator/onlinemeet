import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/edumeet');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    // In production, we might not want to exit immediately without graceful shutdown, 
    // but for dev it's okay.
    // process.exit(1); 
  }
};

export default connectDB;
