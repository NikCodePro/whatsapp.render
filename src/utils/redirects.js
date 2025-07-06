import path from 'path';
import fs from 'fs/promises';
import { connectDB } from './mongo.js';

const redirectsPath = path.resolve('./src/data/redirects.json');

// Helper to log redirect
export async function logRedirect(number) {
  const db = await connectDB();
  await db.collection('redirects').insertOne({
    countryCode: number.countryCode,
    number: number.number,
    status: number.status,
    date: new Date()
  });
}
