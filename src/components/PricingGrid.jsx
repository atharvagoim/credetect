import { Link } from 'react-router';
import { PLAN_CATALOG } from '../../shared/plans.js';
import { formatINR } from '../utils/format.js';

export default function PricingGrid({ currentTier, onChoose, billingEnabled, pendingPlan }) {
  return (
    <div className="pricing">
      {PLAN_CATALOG.map((p) => {
        const current = currentTier === p.id;
        let action;
        if (p.comingSoon) action = <span className="btn btn-secondary btn-block" aria-disabled="true">Coming soon</span>;
        else if (!onChoose) action = <Link to="/register" className={`btn btn-block ${p.featured ? '' : 'btn-secondary'}`}>{p.price ? 'Start with a free scan' : 'Scan for free'}</Link>;
        else if (current) action = <span className="btn btn-secondary btn-block" aria-disabled="true">Current plan</span>;
        else if (!p.price) action = <span className="btn btn-secondary btn-block" aria-disabled="true">Included</span>;
        else
          action = (
            <button className={`btn btn-block ${p.featured ? '' : 'btn-secondary'}`} onClick={() => onChoose(p.id)} disabled={!billingEnabled || pendingPlan === p.id}>
              {pendingPlan === p.id ? 'Opening checkout…' : billingEnabled ? `Choose ${p.name}` : 'Payments not enabled'}
            </button>
          );
        return (
          <div key={p.id} className={`plan${p.featured ? ' featured' : ''}`}>
            <div className="row-between">
              <span className="label">{p.name}</span>
              {p.featured && <span className="badge badge-ink">Popular</span>}
            </div>
            <div className="plan-price">
              {p.comingSoon ? '—' : p.price === 0 ? '₹0' : formatINR(p.price)}
              {p.interval === 'month' && !p.comingSoon && <small> / month</small>}
              {p.interval === 'one_time' && <small> one-time</small>}
            </div>
            <p className="small muted">{p.blurb}</p>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            {action}
          </div>
        );
      })}
    </div>
  );
}
