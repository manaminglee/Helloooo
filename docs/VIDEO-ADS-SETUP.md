# Video and AdSense deployment

The video chat supports horizontal panels and vertically stacked panels with chat alongside on desktop. The header layout controls also work on mobile, and the preference survives reloads. Camera and microphone access require HTTPS, except on localhost. Remote media retries playback after user interactions and returning to the tab.

## Google AdSense

1. Add and obtain approval for your production domain in Google AdSense.
2. Create responsive display ad units. Open this app's Admin → Ads Management, select Google AdSense for each desired placement, and enter your `ca-pub-` publisher ID and 10-digit unit ID. Use one publisher across placements. Save before enabling global ads.
3. Publish and verify the appropriate Google-certified consent message using AdSense Privacy & messaging. This is account configuration; entering ad IDs does not itself configure a consent platform. Google requires a certified CMP for relevant European traffic: https://support.google.com/adsense/answer/13554116?hl=en
4. Serve `/ads.txt` from this Express backend on the production domain. It is generated from saved publisher IDs. If the frontend uses a separate static host, route `/ads.txt` to the backend or copy its response into the host's public assets.
5. Check desktop/mobile placements, consent choices, ad blockers, and real CSP reports on staging. AdSense approval and fill are controlled by Google. Local tests mock the Google loader and never request or click real ads.

Admin ad writes require existing admin authentication, validate sizes and IDs, and save atomically to `ads.json` alongside the local database. Mount a persistent volume at `LOCAL_DB_DIR`. This file store supports a single backend instance; replicas need a shared configuration store before scaling. Save errors return HTTP 503 without publishing the failed change. Switching publisher requires a page reload for clients that have already loaded Google.

Sponsor HTML is also supported in an isolated iframe. Scripts, app storage access, forms and top-level navigation are disabled. Use HTTPS images and `target="_blank" rel="noopener noreferrer"` links. AdSense uses its own typed configuration instead of pasted script HTML.

## Video production requirements

- Configure an operator TURN relay with `TURN_URL`, `TURN_USERNAME` and `TURN_PASSWORD`. Use `TURN_DISABLE_FALLBACK=1` with a working operator relay to avoid the public demo tier. A local two-browser test cannot prove connectivity through mobile carrier NAT or corporate firewalls.
- Set strong admin credentials, production origins, HTTPS and the existing bot-verification credentials. Keep service credentials on the server.
- Group SFU/live broadcasting needs the existing LiveKit service settings; YouTube streaming also needs its configured streaming service. These external services cannot be provisioned by a source change alone.
- Validate camera permission denial/retry, microphone mute, camera disable, skip/end, actual audio both ways, and Wi-Fi-to-cellular calls on physical devices before launch.

## Reproducible checks

`npm run build`

`npm run test:sec`

`npm run test:ads`

`npm run test:video`

The video browser suite starts local services with temporary data and no project `.env`, uses synthetic browser cameras, and requires ports 3000 and 5173 to be free. It covers layout switching, video playback, sponsor isolation, AdSense loading and admin configuration. The Google loader is mocked; this does not verify live ads or account approval.
