// src/db.ts
import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Theme } from './types/Theme'

/*   Table interface declaration with column enumeration
 *   -- settings --
 *   +------------+
 *   | id | theme |
 *   +------------+
 */
export interface ISettings {
  // We'll always use a row with id === 1,
  // so we specify 1 as the type
  id: 1
  theme?: Theme
}

export class SettingsDatabase extends Dexie {
  // Declare the table
  settings!: Table<ISettings>
  constructor() {
    super('SettingsDatabase')
    // Specify fields for which indexes will be created
    this.version(1).stores({
      // Here we list columns that will be used for searching
      // Since we won't search by the theme column, we don't include it here
      settings: '&id',
    })
  }
}

// Declare the database
// The database will be created only on first write
export const sdb = new SettingsDatabase()

// This object is exported for testing purposes
export const dbsDefaultSettings: ISettings = { id: 1, theme: 'light' }

// This function will also be needed for testing
export const dbsInit = async () => {
  const notInitialized = !(await sdb.settings.get(1))?.id
  // If there are no records, create the first one so update() method works
  // If a record already exists, don't modify it
  if (notInitialized) sdb.settings.put(dbsDefaultSettings)
}

// dbsInit()