import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initializeSchema } from './schema.ts';

export const DATABASE_FILENAME = 'tapalong.db';

export const allocateDatabasePath = (userDataPath: string) =>
  path.join(userDataPath, DATABASE_FILENAME);

export const openDatabase = (databasePath: string): DatabaseSync => {
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);

  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initializeSchema(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
};

export const closeDatabase = (db: DatabaseSync): void => {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch {
    // Closing the database is still required if checkpointing is unavailable.
  } finally {
    db.close();
  }
};
