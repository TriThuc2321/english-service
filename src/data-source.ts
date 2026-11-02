import { DataSource } from 'typeorm';

import {
  databaseConfig,
  toDataSourceOptions,
} from './configs/database.config.js';

export default new DataSource(toDataSourceOptions(databaseConfig()));
