# Personal garden themes

Balanced Warm is SUP's default personal garden appearance. Me → **정원 테마** offers four stable IDs:

| ID | Name | Appearance |
| --- | --- | --- |
| `balanced` | Balanced Warm | Warm pearl, botanical greenery and floating light grains |
| `warm` | Warm Opal | Blush, champagne and rose-gold reflections |
| `aurora` | Aurora Crystal | Rose, lavender and turquoise with glow and mineral grain |
| `default` | Original Opal | Cool aqua and lavender with original opalescence |

The integration started from `origin/main` at `05c7efd` and incorporated the newer main through `f8cfac4` before its initial delivery, including its album period picker, totals, friend pinning and notification tutorial. The subsequent conflict resolution incorporates main through `10f4a7a`, retaining friend removal with optional local flower hiding, inbox scrollbar changes, and Android system-bar insets alongside the theme provider and selector. It reconciles the visual changes from Balanced `bbc538b`, Warm `536d2ac`, and Aurora `2af54a7`. Main remains authoritative for audio, sound analysis, authentication, profiles, sharing, notifications, mobile framing, and the four-times camera zoom limit. These unrelated systems were not replaced with older branch files.

The four sets of procedural flower, tree, Blender, reflection, and lighting values come from those source implementations. Automated tests compare their actual geometry buffers, transforms, material properties, shader modifications, and growth poses. The archived `public/models/island.glb` remains byte-for-byte intact. `island-modern.glb` is the exact modern asset from `2af54a7`; crystal flower near/far assets are also preserved.

All four themes now use `island-modern.glb`. It has 14,099 triangles, a centered mineral underside, and the approved pond, rim and crystal placements. The botanical grass module from `e24cc39` contributes one instanced draw, 1,000 clumps and 6,000 triangles. Palette changes reuse one grass layout and its instance buffers. Plant placement updates the stem clearances.

## Personal storage

Authenticated preferences use `sup.garden-theme.v1.user.<auth user ID>`. Development previews use `sup.garden-theme.v1.demo`. The authenticated ID is passed directly from App; garden IDs and member IDs never determine ownership. There are no Supabase schema changes or theme-related garden writes.

The provider reads storage synchronously before its descendants render, and is keyed by account. Missing, malformed, or unknown values resolve to `balanced`. A blocked storage getter, quota error, or disabled storage never stops rendering: selection still works for the current mounted session, and Me explains when it could not be saved. Storage events synchronize open tabs for the same account on the same device. Cross-device synchronization is intentionally absent.

## Switching and resource ownership

The garden renderer stays mounted when navigating to Me. Camera orbit, zoom, flower IDs, stable placement, birth times, opened petals, highlighted state, and Blender near/far decisions survive theme-only changes. Flower and pair detail renderers also retain their clocks. Audio elements and their source records do not depend on theme state.

Each garden renderer loads the canonical island once and applies the latest selected theme when it arrives. The planted fallback stays visible while the load is pending and when Me offers **다시 시도** after a failure. Once loaded, theme changes apply lighting, reflections, flora and island materials together without an asset request.

Each renderer owns its model, one grass controller and up to four material variants derived from the imported materials. The model keeps its geometry and transforms. Vertex paint starts from a copy of the original color values and uploads to the same color attribute. Blender flower source geometry remains shared read-only, with reference-counted material variants and independent dimmed materials. Replaced environments, postprocessing passes and plant resources are released.

## Development and verification

The existing development preview is retained at `?view=island`, with all four tones, procedural/mixed flora, 50 plants, island-only mode, rotated view, portrait, peony comparison, growth controls, and palette study. The production Me selector uses the same renderer and visual libraries.

Run the static and source-equivalence checks with:

```sh
npm install
npm test
npm run build
```

The source-equivalence tests require the specified historical commits in the local Git object database. Browser tests use installed Chrome or Edge and never require a live Supabase account:

```sh
npm run dev -- --host 127.0.0.1 --port 5199 --strictPort
# In another terminal:
npm run test:themes:browser
node scripts/gardenTheme.retry.mjs
npm run test:themes:production
node scripts/gardenTheme.merge.browser.mjs
```

The production test creates an ignored `.qa-production` build using a test-only API URL and intercepts Supabase traffic locally. It exercises actual App authentication, Garden, Me, flower and pair details, synthetic audio playback, profile editing and friend navigation. It does not modify a live account or database.

The focused merge regression uses the actual Garden demo to verify both friend-removal choices, theme and hiding persistence, pin cleanup, and live Android CSS inset updates through rotation. Its report is written to ignored `.qa-browser/merge-results.json`. After incorporating main `10f4a7a`, all 31 Node tests, five focused browser checks, and the production build passed, with no browser runtime or shader errors. Native Android hardware remains outside this browser check.

To reproduce the historical performance comparison, run `node scripts/prepareGardenThemeBaselines.mjs`, serve `.qa-browser/baseline-balanced` on port 5205 and `.qa-browser/baseline-aurora` on port 5206 with Vite, then run `node scripts/gardenTheme.baselines.mjs` while the integration server is on 5199. The preparation script copies current sound-generation inputs into both isolated source checkouts so only visual rendering differs. It never checks out or edits historical branches. `node scripts/reportGardenThemes.mjs` generates the comparison gallery and report only when all browser result files pass.

The browser suites write to `.qa-browser/garden-themes` by default. Set `GARDEN_TEST_OUTPUT` to save evidence elsewhere. [Unified island screenshots and measurements](../art/unified-island/README.md) cover the current geometry. [Theme integration evidence](../art/garden-themes/REPORT.md) records the earlier visual comparison.
