// Plan catalogue shared by the pricing UI and the billing service. Prices in paise.
export const PLAN_CATALOG = [
  { id: 'free', name: 'Free scan', price: 0, interval: null, blurb: 'See what supported sources show about you.', features: ['5 scans every 30 days', 'Removal request drafting', 'Monthly monitoring', 'Export and delete anytime'] },
  { id: 'cleanup', name: 'Privacy Cleanup', price: 149900, interval: 'one_time', periodDays: 90, blurb: 'A focused 90-day cleanup.', features: ['Unlimited scans for 90 days', 'Guided removal for every finding', 'Follow-up reminders', 'Removal status re-checks'] },
  { id: 'monitor', name: 'Monitor', price: 19900, interval: 'month', periodDays: 31, blurb: 'Ongoing watch on new exposure.', features: ['Weekly monitoring', 'Unlimited scans', 'New-finding alerts', 'Removal status re-checks'], featured: true },
  { id: 'family', name: 'Family', price: null, interval: 'month', comingSoon: true, blurb: 'Protect the people you live with.', features: ['Up to 5 people', 'Shared dashboard', 'Per-person consent'] },
];
