import { useState } from 'react';
import PricingGrid from '../components/PricingGrid.jsx';
import { Alert, ErrorAlert, PageHeader, useToast } from '../components/ui.jsx';
import { useAuth } from '../hooks/useAuth.jsx';
import { useResource } from '../hooks/useResource.js';
import { api } from '../services/api.js';
import { fmtDate } from '../utils/format.js';

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

export default function Plans() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const plans = useResource('/billing/plans');
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  const choose = async (plan) => {
    setPending(plan);
    setError(null);
    try {
      const checkout = await api.post('/billing/checkout', { plan });
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: checkout.keyId,
        name: 'Credetect',
        description: checkout.name,
        ...(checkout.orderId ? { order_id: checkout.orderId, amount: checkout.amount, currency: 'INR' } : { subscription_id: checkout.subscriptionId }),
        prefill: { email: user.email },
        theme: { color: '#e60023' },
        handler: async (resp) => {
          try {
            await api.post('/billing/verify', {
              orderId: resp.razorpay_order_id,
              subscriptionId: resp.razorpay_subscription_id,
              paymentId: resp.razorpay_payment_id,
              signature: resp.razorpay_signature,
            });
            await refresh();
            toast('Payment verified. Your plan is active.');
          } catch (e) {
            setError(e);
          }
        },
        modal: { ondismiss: () => setPending(null) },
      });
      rzp.open();
    } catch (e) {
      setError(e);
      setPending(null);
    }
  };

  return (
    <>
      <PageHeader title="Plans" description={<>You are on the <strong>{user.plan.tier}</strong> plan{user.plan.currentPeriodEnd ? ` until ${fmtDate(user.plan.currentPeriodEnd)}` : ''}.</>} />
      {plans.data && !plans.data.billingEnabled && (
        <div style={{ marginBottom: 20 }}>
          <Alert tone="info" title="Payments are not enabled on this deployment">Paid plans become available once the operator configures Razorpay. Nothing is charged until then.</Alert>
        </div>
      )}
      {error && <div style={{ marginBottom: 20 }}><ErrorAlert error={error} title="Checkout problem" /></div>}
      <PricingGrid currentTier={user.plan.tier} onChoose={choose} billingEnabled={plans.data?.billingEnabled} pendingPlan={pending} />
      <p className="small muted" style={{ marginTop: 16 }}>Payments are processed by Razorpay and verified on our server before any plan changes. We never see your card or UPI details.</p>
    </>
  );
}
