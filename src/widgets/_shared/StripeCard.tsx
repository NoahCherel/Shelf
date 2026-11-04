import { useEffect, useState } from "react";
import { refresh } from "../../core/provider";
import { invoke } from "../../core/tauri";
import type { TileProps } from "../../core/widget";
import { Card } from "../../design/parts/Card";
import { ConnectCard } from "../../design/parts/ConnectCard";
import { Row } from "../../design/parts/Row";
import { Sparkline } from "../../design/parts/Sparkline";
import { fetchStripe, money, STRIPE_SECRET, stripeProvider, type StripeData } from "../_providers/stripe";
import "./stripe.css";

export function StripeLogo() {
  return (
    <span className="stripe-logo">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M10.9 8.6c-1.9-.7-2.9-1.2-2.9-2.1 0-.7.6-1.1 1.7-1.1 1.9 0 3.9.8 5.3 1.5l.8-4.7C14.7 1.6 12.500 1 9.900 1c-1.800 0-3.300.5-4.400 1.400C4.400 3.300 3.800 4.700 3.800 6.300c0 2.900 1.800 4.200 4.700 5.200 1.900.7 2.500 1.200 2.500 1.900 0 .8-.6 1.200-1.900 1.200-1.500 0-4-.8-5.600-1.800L2.700 17.600C4.100 18.400 6.700 19 9.300 19c1.900 0 3.500-.4 4.600-1.300 1.200-1 1.900-2.400 1.900-4.200 0-3-1.800-4.200-4.900-4.900Z"
          fill="#fff"
        />
      </svg>
    </span>
  );
}

function Connect() {
  return (
    <Card logo={<StripeLogo />} title="Stripe">
      <ConnectCard
        guide="Create a restricted key in Stripe's dashboard that can only read Balance and Balance transaction sources. It's stored encrypted on this PC and only ever goes to Stripe."
        fields={[{ id: STRIPE_SECRET, label: "Restricted key", placeholder: "rk_live_…", secret: true }]}
        onConnect={async () => {
          await fetchStripe();
          refresh(stripeProvider);
        }}
      />
    </Card>
  );
}

export function StripeCard({ data, status, error }: TileProps<StripeData>) {
  const [connected, setConnected] = useState(status !== "sample");
  useEffect(() => setConnected(status !== "sample"), [status]);

  if (!connected || !data) {
    return status === "error" && error ? (
      <Card logo={<StripeLogo />} title="Stripe" footer={error.message} action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }} />
    ) : (
      <Connect />
    );
  }
  const row = (label: string, amount: number, count: number) => (
    <Row label={label} detail={`${count} payment${count === 1 ? "" : "s"}`} value={money(amount, data.currency)} />
  );
  return (
    <Card
      logo={<StripeLogo />}
      title="Stripe"
      pill={data.testMode ? "Test mode" : undefined}
      footer={error?.message ?? "Net of fees and refunds, by your local days."}
      action={{ label: "Disconnect", onClick: () => disconnect(setConnected), danger: true }}
    >
      {row("Today", data.today, data.payments.today)}
      {row("7 days", data.week, data.payments.week)}
      {row("30 days", data.month30, data.payments.month30)}
      <div className="stripe-line">
        <Sparkline values={data.daily} color="var(--good)" fill />
      </div>
    </Card>
  );
}

function disconnect(setConnected: (on: boolean) => void) {
  invoke("secret_delete", { id: STRIPE_SECRET })
    .catch(() => {})
    .finally(() => {
      setConnected(false);
      refresh(stripeProvider);
    });
}
