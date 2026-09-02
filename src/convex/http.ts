import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

auth.addHttpRoutes(http);

/**
 * Stripe webhook endpoint.
 * Configure it in the Stripe Dashboard → Developers → Webhooks:
 *   URL: https://<deployment>.convex.site/webhooks/stripe
 *   Event: checkout.session.completed
 * The STRIPE_WEBHOOK_SECRET env var enables signature verification.
 */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature") ?? "";
  try {
    await ctx.runAction(api.payments.handleStripeWebhook, { payload, signature });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    // Stripe retries on non-2xx — answer 400 so the retry logic works.
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "webhook error" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
});

http.route({
  path: "/webhooks/stripe",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
