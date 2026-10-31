import { Router } from 'express';
import { z } from 'zod';
import { billingConfigured } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/common.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { ah } from '../utils/errors.js';
import { createCheckout, handleWebhook, PLANS, verifyCheckout } from '../services/billing.js';

const router = Router();

router.get('/billing/plans', (_req, res) => res.json({ plans: Object.values(PLANS), billingEnabled: billingConfigured() }));

router.post(
  '/billing/checkout',
  requireAuth,
  rateLimit({ name: 'checkout', windowMs: 3600_000, max: 10, by: 'user' }),
  validate(z.object({ plan: z.enum(['cleanup', 'monitor']) })),
  ah(async (req, res) => res.json(await createCheckout(req.user, req.body.plan))),
);

router.post(
  '/billing/verify',
  requireAuth,
  validate(
    z
      .object({
        orderId: z.string().max(100).optional(),
        subscriptionId: z.string().max(100).optional(),
        paymentId: z.string().min(1).max(100),
        signature: z.string().min(1).max(200),
      })
      .refine((v) => v.orderId || v.subscriptionId, 'orderId or subscriptionId required'),
  ),
  ah(async (req, res) => res.json(await verifyCheckout(req.user, req.body))),
);

// Raw body is captured in app.js for signature verification.
router.post(
  '/billing/webhook',
  ah(async (req, res) => {
    const result = await handleWebhook(req.rawBody || Buffer.from(''), req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
    res.json(result);
  }),
);

export default router;
