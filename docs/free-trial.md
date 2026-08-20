# Free trial

The app reads the trial off the store, never from a constant. `getFreeTrial()`
in `src/lib/trial.ts` returns the introductory offer on a RevenueCat package
**only when its price is zero** — a discounted first period is not a trial, and
calling it one at the point of purchase would be a misrepresentation.

That means a build shipped before the offer exists shows normal pricing, and the
trial affordances appear on their own once the offer goes live. No code change,
no new build.

## Where it shows

| Surface | File |
|---|---|
| Onboarding paywall | `src/components/ui/PremiumModal.tsx` |
| Store tab | `src/screens/store/StoreScreen.tsx` |
| Choose-plan (Profile re-run) | `src/screens/onboarding/ChoosePlanScreen.tsx` |

Each renders a `TrialBadge` ("3 DAYS FREE") on the plan card and swaps the line
under the price for `"3 days free, then $14.99/mo · cancel anytime"`.

## Store setup

- **App Store Connect** → Subscriptions → group → product → *Introductory
  Offers* → Free trial, 3 days, all territories. Three days is Apple's minimum.
- **Play Console** → Monetize → Subscriptions → base plan → *Offers* → free
  trial phase, 3 days, new customers only — then **activate** it. Google's
  offers are separate objects and a created-but-inactive offer does nothing.
- **RevenueCat** picks intro offers up from both stores automatically. Confirm
  the products show the trial and the offering is still marked *Current*.

Propagation is not instant; a new offer can take a few hours to reach the app.

## Compliance

App Store Guideline 3.1.2 wants the trial length, the fact that it converts,
and the price it converts to, all at the point of purchase. The plan card
carries the length and the price; `TRIAL_DISCLOSURE` in
`src/components/ui/SubscriptionTerms.tsx` carries the conversion terms and
renders whenever `hasTrial` is set.

## Measuring it

`trial_started` fires from `purchasePackage` in the subscription store — one
call site, so every paywall is covered — with `props.plan`, `props.days` and
`props.unit`. Trial-to-paid conversion is `trial_started` against the
entitlement still being active after the trial window.
