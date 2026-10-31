// Vercel serverless entry. Every /api/* request is rewritten here (see vercel.json)
// and handled by the Express app, so frontend and backend deploy as one project.
import app from '../server/app.js';

export default app;
