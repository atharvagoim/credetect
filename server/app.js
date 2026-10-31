import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env.js';
import { connectDb } from './config/db.js';
import { csrfProtection, loadSession, requireAdmin, requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler, requestLogger, sanitizeBody } from './middleware/common.js';
import { AppError } from './utils/errors.js';
import { ensureSourceConfigs } from './services/scanner.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import scanRoutes from './routes/scans.js';
import removalRoutes from './routes/removals.js';
import accountRoutes, { publicAccountRouter } from './routes/account.js';
import billingRoutes from './routes/billing.js';
import adminRoutes from './routes/admin.js';
import systemRoutes from './routes/system.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // Strict CORS: the SPA is served from the same origin, so no cross-origin access is granted.
  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use(
    express.json({
      limit: '64kb',
      verify: (req, _res, buf) => {
        if (req.originalUrl.startsWith('/api/billing/webhook')) req.rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use(cookieParser());
  app.use(sanitizeBody);

  app.use('/api', async (_req, _res, next) => {
    try {
      if (env.missing.length) throw new AppError(503, 'CONFIG_ERROR', `Server is missing configuration: ${env.missing.join(', ')}`);
      await connectDb();
      await ensureSourceConfigs();
      next();
    } catch (err) {
      next(err.status ? err : new AppError(503, 'DB_UNAVAILABLE', 'Database is unavailable. Try again shortly.'));
    }
  });

  app.use('/api', loadSession);
  app.use('/api', csrfProtection(['/billing/webhook', '/cron/']));

  // Public
  app.use('/api', systemRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api', publicAccountRouter);
  app.use('/api', billingRoutes);

  // Authenticated
  app.use('/api/admin', requireAuth, requireAdmin, adminRoutes);
  app.use('/api', requireAuth, profileRoutes);
  app.use('/api', requireAuth, scanRoutes);
  app.use('/api', requireAuth, removalRoutes);
  app.use('/api', requireAuth, accountRoutes);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}

const app = createApp();
export default app;
