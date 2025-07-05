import fs from 'fs/promises';
import path from 'path';
const dataPath = path.resolve('src/data/numbers.json');

export async function getNumbers() {
  try {
    const data = await fs.readFile(dataPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveNumbers(numbers) {
  await fs.writeFile(dataPath, JSON.stringify(numbers, null, 2));
}