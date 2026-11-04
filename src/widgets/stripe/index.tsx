import { defineWidget, type TileProps } from "../../core/widget";
import { Tile } from "../../design/parts/Tile";
import { compactMoney, STRIPE_SAMPLE, stripeProvider, type StripeData } from "../_providers/stripe";
import { StripeCard, StripeLogo, stripeMenu } from "../_shared/StripeCard";
import "./stripe-tile.css";

function StripeTile({ data }: TileProps<StripeData>) {
  return (
    <Tile width={2.35} className="st">
      <div className="st__logo">
        <StripeLogo />
      </div>
      <span className="st__amount">{data ? compactMoney(data.month30, data.currency) : "–"}</span>
      <span className="st__label">net revenue · 30 days</span>
    </Tile>
  );
}

export default defineWidget<StripeData>({
  id: "stripe",
  name: "Stripe",
  description: "Net revenue over the last 30 days from Stripe.",
  category: "finance",
  width: 2.35,
  sample: STRIPE_SAMPLE,
  Tile: StripeTile,
  Card: StripeCard,
  provider: stripeProvider,
  menu: stripeMenu,
});
