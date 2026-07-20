import mongoose from 'mongoose';
import config from './config';

async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log('Connected to MongoDB');
}

export default connectDB;
