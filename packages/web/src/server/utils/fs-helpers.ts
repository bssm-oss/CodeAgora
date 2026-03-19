/**
 * Shared filesystem utility helpers for server routes.
 */

import { readdir, readFile } from 'fs/promises';

/**
 * Safely read directory entries, returning empty array on failure.
 */
export async function readdirSafe(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Safely read and parse a JSON file, returning null on failure.
 */
export async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}
