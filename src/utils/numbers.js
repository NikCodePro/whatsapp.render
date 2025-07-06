import { connectDB } from './mongo.js';

export async function getNumbers() {
  const db = await connectDB();
  return db.collection('numbers').find().toArray();
}

export async function saveNumbers(numbers) {
  const db = await connectDB();
  await db.collection('numbers').deleteMany({});
  await db.collection('numbers').insertMany(numbers);
}