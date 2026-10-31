import { Router } from 'express';
import mongoose from 'mongoose';
import { billingConfigured, env, smtpConfigured, textbeeConfigured, twilioConfigured } from '../config/env.js';
import { safeEqual } from '../utils/crypto.js';
import { ah, AppError } from '../utils/errors.js';
import { runTick } from '../jobs/tick.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: env.missing.length === 0,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    integrations: {
      email: smtpConfigured() ? 'smtp' : 'off',
      sms: twilioConfigured() ? 'twilio' : textbeeConfigured() ? 'textbee' : 'off',
      billing: billingConfigured() ? 'razorpay' : 'off',
      hibp: Boolean(env.HIBP_API_KEY),
    },
    missingConfig: env.missing,
  });
});

/** Background worker entry point. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
router.all(
  '/cron/tick',
  ah(async (req, res) => {
    const auth = req.get('authorization') || '';
    if (!env.CRON_SECRET || !safeEqual(auth, `Bearer ${env.CRON_SECRET}`)) throw new AppError(401, 'UNAUTHENTICATED', 'Invalid cron credentials');
    res.json(await runTick({ budgetMs: 45_000 }));
  }),
);

export default router;
