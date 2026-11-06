# Personal garden themes

Balanced Warm is SUP's default personal garden appearance. Me → **정원 테마** offers four stable IDs:

| ID | Name | Island geometry |
| --- | --- | --- |
| `balanced` | Balanced Warm | Modern grass, no upright hoop, centered mineral underside |
| `warm` | Warm Opal | Archived island, including its hoop and underside |
| `aurora` | Aurora Crystal | Modern island with Aurora atmosphere and glow |
| `default` | Original Opal | Archived cool opal island |

The integration started from `origin/main` at `05c7efd`. It reconciles the visual changes from Balanced `bbc538b`, Warm `536d2ac`, and Aurora `2af54a7`. Main remains authoritative for audio, sound analysis, authentication, profiles, sharing, notifications, mobile framing, and the four-times camera zoom limit. These unrelated systems were not replaced with older branch files.

The four sets of procedural flower, tree, Blender, reflection, and lighting values come from those source implementations. Automated tests compare their actual geometry buffers, transforms, material properties, shader modifications, and growth poses. The archived `public/models/island.glb` remains byte-for-byte intact. `island-modern.glb` is the exact modern asset from `2af54a7`; crystal flower near/far assets are also preserved.

The later user-approved grass requirement adds the shared botanical grass module from `e24cc39` (based on the resized blades in `6da2b6f`) to all four themes, while preserving each island geometry variant. It supersedes the original request to preserve the old grass presentation in Warm and Original. The new grass colors and resized blades are maintained separately from historical flora palettes. The module contributes one visible instanced draw, 1,000 clumps and 6,000 triangles in every theme. Two bounded layouts account for the archived hoop-foot exclusions; palette changes reuse their mesh, geometry, material, and instance buffers.

## Personal storage

Authenticated preferences use `sup.garden-theme.v1.user.<auth user ID>`. Development previews use `sup.garden-theme.v1.demo`. The authenticated ID is passed directly from App; garden IDs and member IDs never determine ownership. There are no Supabase schema changes or theme-related garden writes.

The provider reads storage synchronously before its descendants render, and is keyed by account. Missing, malformed, or unknown values resolve to `balanced`. A blocked storage getter, quota error, or disabled storage never stops rendering: selection still works for the current mounted session, and Me explains when it could not be saved. Storage events synchronize open tabs for the same account on the same device. Cross-device synchronization is intentionally absent.

## Switching and resource ownership

The garden renderer stays mounted when navigating to Me. Camera orbit, zoom, flower IDs, stable placement, birth times, opened petals, highlighted state, and Blender near/far decisions survive theme-only changes. Flower and pair detail renderers also retain their clocks. Audio elements and their source records do not depend on theme state.

Island assets load into a staging group. The last complete island remains present until the replacement is ready; lighting, reflections, flora and island materials commit together. If loading fails, Me offers **다시 시도** and the previous scene stays visible. Stale requests cannot commit over a newer selection.

Parsed island requests own their material and geometry resources. Blender source geometry is shared read-only, with reference-counted material variants and independent dimmed materials. Replaced environments, postprocessing passes, GPU timers and plant resources are released. The bounded grass layouts are shared between themes using the same modern or archived model variant.

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
```

The production test creates an ignored `.qa-production` build using a test-only API URL and intercepts Supabase traffic locally. It exercises actual App authentication, Garden, Me, flower and pair details, synthetic audio playback, profile editing and friend navigation. It does not modify a live account or database.

To reproduce the historical performance comparison, run `node scripts/prepareGardenThemeBaselines.mjs`, serve `.qa-browser/baseline-balanced` on port 5205 and `.qa-browser/baseline-aurora` on port 5206 with Vite, then run `node scripts/gardenTheme.baselines.mjs` while the integration server is on 5199. The preparation script copies current sound-generation inputs into both isolated source checkouts so only visual rendering differs. It never checks out or edits historical branches. `node scripts/reportGardenThemes.mjs` generates the comparison gallery and report only when all browser result files pass.

Screenshots and measured results are under [`art/garden-themes`](../art/garden-themes/). The final verification report records exact draw calls, triangles, timings, repeated-switch resource counts, source comparisons, and platform limitations.
