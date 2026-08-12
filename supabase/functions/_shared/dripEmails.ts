// The RYZR lifecycle sequence after the Day 1 welcome.
//
// Day 1 is the welcome email, sent by the auth.users trigger (see
// send-welcome-email). Everything here is sent by the `send-ryzr-drip`
// dispatcher, which runs on a schedule and works out who is due.
//
// Feature claims below are drawn from what is actually built (see CLAUDE.md and
// src/screens). If a feature is cut or renamed, fix the copy here — these go to
// real users and a promise the app doesn't keep is worse than no email.

import {
  card,
  feedbackButton,
  renderEmail,
  WELCOME_FROM,
  WELCOME_REPLY_TO,
  escapeHtml,
} from './emailLayout.ts';

export interface DripStage {
  /** Campaign key, also the idempotency key in ryzr_email_campaign_sends. */
  campaign: string;
  /** Days after signup this stage becomes due. */
  afterDays: number;
  subject: string;
  /**
   * Stages are only sent when live. Day 21 ships switched off because its
   * roadmap section is a placeholder — see the note on that stage.
   */
  live: boolean;
  build: (firstName: string) => string;
}

const greeting = (firstName: string) => `
      <p style="margin-top:0;">
        Hi ${escapeHtml(firstName)},
      </p>`;

const signoff = `
      <p style="margin-top:28px;">
        <strong>Train for the life you want.</strong>
      </p>

      <p>
        Josh Perry<br>
        Founder, RYZR
      </p>`;

// ---------------------------------------------------------------------------
// Day 3 — Three features most people miss
// ---------------------------------------------------------------------------
const day3: DripStage = {
  campaign: 'ryzr-drip-day3',
  afterDays: 3,
  subject: 'Three features most people miss in RYZR',
  live: true,
  build: (firstName) =>
    renderEmail({
      title: 'Three features most people miss in RYZR',
      preheader: "Most people never find these three. They're the best part of RYZR.",
      body: `${greeting(firstName)}

      <p>
        You've had RYZR for a few days now, so I wanted to point out three things
        most people never find on their own. They're the parts I'm proudest of.
      </p>

${card(
  '1. The AI coach will actually talk to you',
  `
        <p style="margin:8px 0;">
          Tap the coach on your Today screen and ask it anything — why a workout is
          built the way it is, how to swap an exercise you hate, what to do when your
          shoulder is cranky.
        </p>
        <p style="margin:8px 0;">
          You can speak your question out loud instead of typing, and have the answer
          read back to you. That makes it genuinely usable mid-set, which is the point.
        </p>`,
)}

${card(
  '2. Form Coach watches your reps',
  `
        <p style="margin:8px 0;">
          Prop your phone against something, start Form Coach, and it uses the camera
          to give you feedback on your form in real time.
        </p>
        <p style="margin:8px 0;">
          It's the closest thing to having someone watch your set and tell you your
          hips are rising too early. Form Coach is a Premium feature — your free month
          covers it.
        </p>`,
)}

${card(
  '3. Your workout adapts to how recovered you are',
  `
        <p style="margin:8px 0;">
          If you connect a wearable, RYZR reads your heart rate variability, resting
          heart rate, and sleep, and turns them into a readiness score on your Today
          screen.
        </p>
        <p style="margin:8px 0;">
          Low readiness isn't a reason to skip — it's a reason to train differently.
          There's an injury-risk card next to it doing the same job for accumulated load.
        </p>`,
)}

      <p style="margin-top:28px;">
        If you try one of these and it doesn't work the way you expected, tell me.
        That's genuinely how this gets better.
      </p>

      <div style="margin:24px 0;">
${feedbackButton('Tell me what you think', 'RYZR — feature feedback')}
      </div>
${signoff}`,
    }),
};

// ---------------------------------------------------------------------------
// Day 7 — Getting the most out of RYZR
// ---------------------------------------------------------------------------
const day7: DripStage = {
  campaign: 'ryzr-drip-day7',
  afterDays: 7,
  subject: 'Getting the most out of RYZR',
  live: true,
  build: (firstName) =>
    renderEmail({
      title: 'Getting the most out of RYZR',
      preheader: 'Wearables, the AI coach, and training for what you actually do.',
      body: `${greeting(firstName)}

      <p>
        One week in. If RYZR has stuck so far, there are three things that separate
        people who get a lot out of it from people who drift away.
      </p>

${card(
  'Connect a wearable',
  `
        <p style="margin:8px 0;">
          This is the single highest-leverage thing you can do. Without it, RYZR is
          guessing at your recovery. With it, your plan responds to a bad night's sleep
          or a heavy week instead of pretending it didn't happen.
        </p>
        <p style="margin:8px 0;">
          You'll see it show up as a readiness score on your Today screen within a day
          or two of data.
        </p>`,
)}

${card(
  'Talk to the coach like a person',
  `
        <p style="margin:8px 0;">
          The AI coach handles vague, human questions better than most people expect.
          "My knee hurts on squats, what should I do instead?" works. So does "I only
          have 25 minutes today" or "why am I doing so much rowing?"
        </p>
        <p style="margin:8px 0;">
          You don't need to phrase it carefully. Just ask.
        </p>`,
)}

${card(
  'Tell it what you actually want to be good at',
  `
        <p style="margin:8px 0;">
          RYZR builds training around activities, not just muscle groups. Surfing,
          hiking, running, chasing your kids around — the plan changes meaningfully
          depending on what you pick.
        </p>
        <p style="margin:8px 0;">
          If your goals have shifted since you signed up, update them and regenerate
          your plan from your Profile. It's built to be redone, not set once.
        </p>`,
)}

      <p style="margin-top:28px;">
        One more thing worth doing: check your Progress tab. Even a week of logged
        sessions starts showing up as real trend lines, and seeing volume climb is
        more motivating than it sounds.
      </p>

      <p style="margin-top:24px;">
        Stuck on any of this? Reply and I'll walk you through it personally.
      </p>

      <div style="margin:24px 0;">
${feedbackButton('Ask me anything', 'RYZR — getting started')}
      </div>
${signoff}`,
    }),
};

// ---------------------------------------------------------------------------
// Day 21 — What's coming next
// ---------------------------------------------------------------------------
//
// NOT LIVE. The roadmap section below is a placeholder: I don't know what is
// actually on your roadmap, and inventing shipping promises in an email to real
// users is the one thing worth refusing to guess at. Replace ROADMAP_ITEMS with
// real plans, then flip `live` to true.
const ROADMAP_ITEMS: { heading: string; body: string }[] = [
  {
    heading: 'PLACEHOLDER — replace before enabling',
    body: 'Describe a feature you are genuinely planning to ship, and roughly when.',
  },
];

const day21: DripStage = {
  campaign: 'ryzr-drip-day21',
  afterDays: 21,
  subject: "What's coming next in RYZR",
  live: false,
  build: (firstName) =>
    renderEmail({
      title: "What's coming next in RYZR",
      preheader: "Here's what I'm building next — and I want your input on it.",
      body: `${greeting(firstName)}

      <p>
        You've been using RYZR for about three weeks, which makes your opinion more
        useful to me than almost anyone's. You've seen enough to know where it's thin.
      </p>

      <p>
        Here's what I'm working on next:
      </p>

${ROADMAP_ITEMS.map((item) => card(item.heading, `
        <p style="margin:8px 0;">${item.body}</p>`)).join('\n')}

      <p style="margin-top:28px;">
        Now the part I actually care about: <strong>what would you build?</strong>
      </p>

      <p>
        If there's something you keep wishing RYZR did — or something that annoys you
        every single time you open it — I want to hear it. Small annoyances are just as
        useful as big ideas. Several features already in the app started as a one-line
        reply from someone like you.
      </p>

      <div style="margin:24px 0;">
${feedbackButton("Tell me what to build", 'RYZR — what I would build')}
      </div>

      <p style="margin-top:28px;">
        Thanks for sticking with it this long.
      </p>
${signoff}`,
    }),
};

export const DRIP_STAGES: DripStage[] = [day3, day7, day21];

/** Ready-to-send Resend payload for one stage. */
export function dripPayload(stage: DripStage, to: string, firstName: string) {
  return {
    from: WELCOME_FROM,
    replyTo: WELCOME_REPLY_TO,
    to: [to],
    subject: stage.subject,
    html: stage.build(firstName),
    headers: {
      'List-Unsubscribe': `<mailto:${WELCOME_REPLY_TO}?subject=Unsubscribe>`,
    },
  };
}
