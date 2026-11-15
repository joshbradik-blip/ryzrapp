# Test OTA updates in Expo Simulators

The `ota-preview` release builds receive updates from the `preview` channel. Both
platforms use the production Expo environment so the preview update uses the same
client configuration as a production update. Sign in with a RYZR test account.

1. In [RYZR Workflows](https://expo.dev/accounts/jujitsujosh/projects/ryzrapp/workflows),
   run **Publish OTA update** for the candidate change and choose **preview**
   when asked about simulator testing. The workflow links to Simulator sessions
   and the update group. **Publish OTA preview** is also available for a preview-only run.
2. In [RYZR Simulator sessions](https://expo.dev/accounts/jujitsujosh/projects/ryzrapp/simulator-sessions),
   select **Create new simulator**. Choose Android or iOS, select the
   `ota-preview` build for that platform and runtime, then open the preview.
3. Give the app time to download the update. Fully quit and reopen the app in the
   same session if the change is missing. It can take up to two cold launches
   including the initial launch. Confirm the candidate behavior and stop the session.
4. To release the exact bundle you tested, republish that update group to
   `production` after both platforms pass.

From a local checkout, `eas workflow:run .eas/workflows/publish-update.yml` prompts
for the same choice.

Rebuild both clients when the native runtime changes or their build artifacts
expire. Run this from the release source for the runtime you want to test:

```sh
eas build --profile ota-preview --platform all
```
