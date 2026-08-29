import { envConfig } from './env.config';

export const databaseConfig = {
  url: envConfig.databaseUrl,
  host: envConfig.database.host,
  port: envConfig.database.port,
  user: envConfig.database.user,
  password: envConfig.database.password,
  name: envConfig.database.name,
};

export default databaseConfig;
