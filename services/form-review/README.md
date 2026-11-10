# Video Form Review

RYZR records or selects one 2–20 second MP4 or MOV clip up to 20 MB. The user previews it locally and explicitly submits it to this service. The service verifies the Supabase session and Premium access. MediaPipe extracts pose landmarks from timestamped frames, and RYZR's existing exercise rules decide whether there is enough evidence to review the set. Claude receives the exercise name and a summary of the measurements to write one short cue.

The initial exercise list is Back Squat, Goblet Squat, Romanian Deadlift, and Push-Up. Unclear clips return a retake cue. The service uses temporary files during analysis and removes them when the decoder finishes or errors. It has no upload bucket or clip history. Audio is ignored by the decoder.

## Run the service

Build from the repository root so the service can import the shared pose rules.

```sh
docker build -f services/form-review/Dockerfile -t ryzr-form-review .
docker run --rm -p 8080:8080 --env-file /path/to/private-form-review.env ryzr-form-review
```

Configure these values in the service's secret or environment settings.

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | HTTPS URL for the same Supabase project used by the app |
| `SUPABASE_ANON_KEY` | That project's anon or publishable key |
| `REVENUECAT_PUBLIC_API_KEY` | SDK key for RYZR's shared RevenueCat project. Used to read the user's `premium` entitlement |
| `FORM_REVIEW_BETA_USER_IDS` | Optional comma-separated Supabase UUIDs for invited testers whose app account already has Premium. A beta-only service can use this in place of the RevenueCat key |
| `PORT` | Optional server port. Defaults to `8080` |

The service sends the movement summary to RYZR's existing Supabase `anthropic-proxy` function using the authenticated caller's token. The Anthropic key stays in Supabase.

The service listens on `GET /health` for health checks. Run one replica for the pilot. Its six submissions per account per UTC day and two concurrent requests are enforced in process and reset on restart. Configure shared quotas before scaling beyond a single replica.

When the backend is ready, set `EXPO_PUBLIC_FORM_REVIEW_URL` to its HTTPS base URL in the app's target EAS environment. The app hides the entry point when this value is unset. Review the app's privacy disclosures and exercise acceptance on real iOS and Android clips before enabling it in production.

## Verify locally

```sh
npx --yes tsx --test services/form-review/server.test.ts services/form-review/analyze.test.ts
```

The test server uses fake authentication and a fake review response. The analysis tests exercise the real RYZR movement rules with synthetic pose frames.
