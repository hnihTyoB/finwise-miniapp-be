import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import cookieParser from 'cookie-parser';
import { errorMiddleware, notFoundMiddleware } from './middlewares/error.middleware';
import routes from './routes';
import { swaggerSpec, swaggerOptions } from './config/swagger.config';
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware';
import { maintenanceModeMiddleware } from './middlewares/maintenance-mode.middleware';
import { envConfig } from './config/env.config';

const app = express();

app.set('trust proxy', envConfig.trustProxy);

app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowed = envConfig.cors.allowedOrigins;
    // Allow non-browser requests without origin header (e.g., mobile apps, cURL, server-to-server)
    if (!origin) {
      callback(null, true);
      return;
    }
    // Disallow wildcard with credentials in production
    if (allowed.includes('*')) {
      if (envConfig.nodeEnv === 'production') {
        callback(new Error('CORS wildcard origin not allowed with credentials in production'), false);
        return;
      }
      callback(null, true);
      return;
    }
    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));

app.use('/api/v1', rateLimitMiddleware, maintenanceModeMiddleware, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;


