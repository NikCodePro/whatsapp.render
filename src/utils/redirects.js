import { connectDB } from './mongo.js';

// Normalize the country code (ensures it starts with +)
function normalizeCountryCode(code) {
  if (!code) return '';
  return code.startsWith('+') ? code : '+' + code.replace(/[^0-9]/g, '');
}

// Normalize the phone number (removes any non-digit characters)
function normalizeNumber(number) {
  if (!number) return '';
  return number.replace(/\D/g, '');
}

export async function logRedirect(number) {
  const db = await connectDB();
  const collection = db.collection('redirects');

  const normCountryCode = normalizeCountryCode(number.countryCode);
  const normNumber = normalizeNumber(number.number);

  await collection.updateOne(
    { countryCode: normCountryCode, number: normNumber },
    {
      $inc: { count: 1 },
      $setOnInsert: {
        status: number.status,
        group: number.group || 'Ungrouped',
        createdAt: new Date()
      },
      $set: {
        lastRedirect: new Date()
      }
    },
    { upsert: true }
  );
}
