// Sends the RYZR welcome email to one address on demand.
//
// This is the manual/testing entry point — handy for previewing the email or
// re-sending to a single user. Automatic sends on signup go through
// `send-welcome-email`, and backfilling existing users goes through
// `send-ryzr-welcome-batch`.
//
// Deployed with verify_jwt = true, so callers need a valid Supabase JWT.

import { Resend } from 'npm:resend';

import { resolveFirstName, welcomeEmailPayload } from '../_shared/welcomeEmail.ts';

const resendApiKey = Deno.env.get('RESEND_API_KEY');

if (!resendApiKey) {
  throw new Error('RESEND_API_KEY is not configured');
}

const resend = new Resend(resendApiKey);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const to = body?.to;
    if (!to || typeof to !== 'string') {
      return json(
        { success: false, error: 'A valid recipient email address is required.' },
        400,
      );
    }

    const firstName =
      typeof body?.firstName === 'string' && body.firstName.trim()
        ? body.firstName.trim()
        : resolveFirstName(body?.user_metadata);

    const { data, error } = await resend.emails.send(welcomeEmailPayload(to, firstName));

    if (error) {
      console.error('Resend error:', error);
      return json({ success: false, error }, 400);
    }

    console.log('RYZR email sent:', data);
    return json({ success: true, data });
  } catch (error) {
    console.error('Function error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      500,
    );
  }
});
