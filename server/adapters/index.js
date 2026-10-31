import { env } from '../config/env.js';
import { demoAdapter } from './demo.js';
import { hibpAdapter } from './hibp.js';
import { urlCheckAdapter } from './urlCheck.js';
import { xposedOrNotAdapter } from './xposedornot.js';

/**
 * Source adapter registry. See docs/ADAPTERS.md for the interface.
 * Code defines what an adapter CAN do; the SourceAdapter collection holds
 * admin-editable runtime config (enabled, rate limit, removal contact, template).
 */
// The sample-data adapter exists only as a fixture for the automated tests; it is never registered at runtime.
export const adapters = [...(env.isTest ? [demoAdapter] : []), hibpAdapter, xposedOrNotAdapter, urlCheckAdapter];
export const adapterByKey = Object.fromEntries(adapters.map((a) => [a.key, a]));
export const getAdapter = (key) => adapterByKey[key] || null;
