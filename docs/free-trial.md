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

### App Store Connect

Verified against Apple's current help docs — the offer lives *inside* subscription
pricing, not in a section of its own.

1. **Apps** → your app → sidebar **Subscriptions**
2. Choose the **subscription group**, then the subscription
3. In **Subscription Prices**, click **View all Subscription pricing**
4. **Set up Introductory Offer**
5. Pick countries/regions → **Next**
6. Set start date (today = starts immediately) and leave the end date blank so it
   does not expire
7. Type: **Free** (not *Pay as you go* / *Pay up front*)
8. Duration: **3 Days**
9. **Confirm**

Repeat for each subscription you want to carry the trial. 3 Days is offered for
every standard duration, so both monthly and annual can have it.

Needs the Account Holder, Admin, App Manager, or Marketing role. No separate
review — the offer goes live for eligible customers on its own. Sandbox can take
up to an hour to catch up.

> **One offer per subscription group, per customer.** Monthly and annual almost
> certainly share a group, so a customer who trials monthly cannot then trial
> annual. Putting the trial on both plans is therefore safe — it widens which
> plan someone can start on, it does not hand anyone two free periods.

### Play Console

1. **Monetize** → **Subscriptions** → your subscription
2. On the auto-recurring **base plan**, click **Add offer**
3. Choose the base plan, give the offer an **offer ID**
4. Under **Phases**, **Add phase** → free trial, **3 days**
5. Set eligibility (new customers only)
6. **Save changes**, then **activate** the offer

Google models offers as separate objects from the base plan, and a saved but
inactive offer does nothing. Free trial phases run from 3 days to 3 years.

### RevenueCat

Picks intro offers up from both stores automatically. Confirm the products show
the trial and the offering is still marked **Current**. Propagation is not
instant.

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
