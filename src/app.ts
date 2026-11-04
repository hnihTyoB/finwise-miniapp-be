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

// Gating Swagger docs: chỉ mở ở dev/staging hoặc khi cờ ENABLE_SWAGGER=true
const isSwaggerEnabled =
  envConfig.nodeEnv !== 'production' || process.env.ENABLE_SWAGGER === 'true';

// Chỉ tắt Content-Security-Policy ở môi trường cần load giao diện Swagger UI
app.use(
  helmet({
    contentSecurityPolicy: isSwaggerEnabled ? false : undefined,
  }),
);

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
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());

if (isSwaggerEnabled) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerOptions));
} else {
  app.use('/api/docs', (_req, res) => {
    res.status(404).json({
      success: false,
      message: 'API documentation is disabled in production',
      code: 'NOT_FOUND',
    });
  });
}

app.use('/api/v1', rateLimitMiddleware, maintenanceModeMiddleware, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;


