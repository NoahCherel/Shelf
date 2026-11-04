import { defineWidget, type TileProps } from "../../core/widget";
import { Sparkline } from "../../design/parts/Sparkline";
import { Tile } from "../../design/parts/Tile";
import { compactMoney, STRIPE_SAMPLE, stripeProvider, type StripeData } from "../_providers/stripe";
import { StripeCard, StripeLogo, stripeMenu } from "../_shared/StripeCard";
import "./stripe-chart.css";

function Change({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  return <span className={up ? "sc__change" : "sc__change sc__change--down"}>{`${up ? "▲" : "▼"} ${Math.abs(value)}%`}</span>;
}

function StripeChartTile({ data }: TileProps<StripeData>) {
  return (
    <Tile width={3.12} className="sc">
      <div className="sc__head">
        <div className="sc__logo">
          <StripeLogo />
        </div>
        <span className="sc__label">Net revenue</span>
        <div className="sc__numbers">
          <span className="sc__amount">{data ? compactMoney(data.week, data.currency) : "–"}</span>
          <Change value={data?.change ?? null} />
        </div>
      </div>
      <div className="sc__line">
        <Sparkline values={data?.daily ?? []} color="var(--good)" fill />
      </div>
    </Tile>
  );
}

export default defineWidget<StripeData>({
  id: "stripe-chart",
  name: "Stripe Chart",
  description: "Your Stripe revenue as a line.",
  category: "finance",
  width: 3.12,
  sample: STRIPE_SAMPLE,
  Tile: StripeChartTile,
  Card: StripeCard,
  provider: stripeProvider,
  menu: stripeMenu,
});
