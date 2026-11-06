# SUP garden theme integration — verification

Branch: `codex/garden-theme-selector`. Started from `origin/main` at `05c7efd`, then incorporated its newer album/friend/tutorial changes through `f8cfac4`. No changes were merged into or pushed to main. Historical visual branches and their artifacts were not overwritten.

Balanced Warm is the default. All four themes are available from Me → **정원 테마**, with an explicit selected state and personal account-scoped storage. The new shared grass requirement from the authorized island conversation is included from `e24cc39` (resized geometry based on `6da2b6f`). Warm/Original retain their archived island geometry; their added grass is the explicitly approved exception to the older appearance.

[Four-theme visual comparison](comparison.html) · [Mobile selector](theme-selector-mobile.png) · [Implementation and reproduction notes](../../docs/GARDEN_THEMES.md)

## Screenshots at the same pose

| Balanced Warm | Warm Opal | Aurora Crystal | Original Opal |
| --- | --- | --- | --- |
| [Garden](balanced-garden.png) | [Garden](warm-garden.png) | [Garden](aurora-garden.png) | [Garden](default-garden.png) |
| [50 received plants](balanced-dense50.png) | [50 received plants](warm-dense50.png) | [50 received plants](aurora-dense50.png) | [50 received plants](default-dense50.png) |
| [Mobile](balanced-mobile50.png) | [Mobile](warm-mobile50.png) | [Mobile](aurora-mobile50.png) | [Mobile](default-mobile50.png) |

These are the actual Garden component, with deterministic sound fixtures. The four garden comparisons retain exactly the same camera and frozen animation time. Separate `production-*.png` screenshots verify the compiled authenticated App with all seven emotion categories, three tree variants and a pair.

## Results

- Production build: passed. Vite reports the bundle-size warning for the main Three.js application chunk; no build errors.
- Node checks: **28 passed**, including the existing audio/push tests, preference isolation, grass resource ownership, exact source geometry/material/growth comparisons, and historical island shader checks.
- Actual Garden browser suite: **12 passed**.
- Production App/account/audio suite: **9 passed**.
- Failure/retry/rapid-switch suite: **4 passed**.
- Runtime/shader errors: **zero** in normal runs. Retry tests separately record the one intentionally failed asset request.
- Twelve repeated switches converge to identical geometry, texture and shader-program counts. Grass retains one visible draw and two bounded model-variant layouts, reusing their mesh/geometry/instance-buffer identities across palettes.
- An existing logout race was fixed: a queued garden refresh now safely handles the session disappearing before its auth lookup completes.

## Actual garden performance

Chrome 157.0.8103.38; ANGLE (Intel, Intel(R) Arc(TM) 140V GPU (16GB) (0x000064A0) Direct3D11 vs_5_0 ps_5_0, D3D11). Browser viewport 1280 × 900, actual garden canvas 520 × 900, DPR 1. Each measurement uses 180 post-warmup samples at a fixed pose. Draw calls and triangles include shadows and postprocessing; grass by itself is one draw, 1,000 clumps and 6,000 triangles in all themes.

12 received plants plus 2 pair flowers:

| Theme | Draw calls | Triangles/frame | CPU render mean, ms | GPU mean, ms | Frame interval mean, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced Warm | 624 | 75,624 | 2.41 | 2.24 | 16.71 |
| Warm Opal | 628 | 80,640 | 2.23 | 2.11 | 16.71 |
| Aurora Crystal | 630 | 75,632 | 2.87 | 2.88 | 16.71 |
| Original Opal | 628 | 80,640 | 4.91 | 3.45 | 16.81 |

50 received plants plus 2 pair flowers:

| Theme | Draw calls | Triangles/frame | CPU render mean, ms | GPU mean, ms | Frame interval mean, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced Warm | 2,134 | 168,100 | 14.35 | 11.03 | 16.85 |
| Warm Opal | 2,138 | 173,116 | 9.14 | 9.4 | 16.85 |
| Aurora Crystal | 2,140 | 168,108 | 6.77 | 6.94 | 16.76 |
| Original Opal | 2,138 | 173,116 | 15.56 | 11.54 | 17.82 |

## Comparison against preserved implementations

The separate 50-plant mixed-flora comparison uses identical generated sound records, camera position/target, 36° field of view, viewport, frozen time and Blender near/far LOD counts. The source camera first approaches the plants to align the LOD hysteresis state before returning to the comparison pose. Exact source renderers/assets were extracted into ignored local directories from Balanced `bbc538b` and Aurora `2af54a7`. Warm and Original paths in the Balanced snapshot match `536d2ac`, independently verified by the source-equivalence tests. See [raw baseline data](baseline-performance.json).

| Theme | Source → integrated draw calls | Source → integrated triangles | Draw delta | Triangle delta | CPU mean delta, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced Warm | 2,119 → 2,116 | 232,736 → 233,720 | -3 | +984 | -0.74 |
| Aurora Crystal | 2,122 → 2,122 | 233,728 → 233,728 | 0 | 0 | -0.06 |
| Warm Opal | 2,119 → 2,120 | 232,736 → 238,736 | +1 | +6,000 | -0.01 |
| Original Opal | 2,119 → 2,120 | 232,736 → 238,736 | +1 | +6,000 | -0.53 |

Balanced's changed counts reflect the approved modern island and grass. Warm/Original add one instanced grass draw under the newer requirement. Aurora keeps its existing geometry budget. Wall-clock CPU/GPU times are observations on a shared development machine and can vary with system load; draw/triangle deltas are deterministic. Mobile layouts were exercised at 390 × 844, not on physical iOS/Android hardware.

## Test detail

- Passed: Fresh actual Garden defaults to Balanced Warm
- Passed: Real pointer orbit and camera position survive Me navigation and a theme switch
- Passed: All four themes render trees, procedural flowers, Blender peonies and pairs at identical camera/time; same canvas and plant state
- Passed: All four botanical grass palettes use one visible instanced draw; two bounded layouts retain geometry and instance buffers across themes
- Passed: Blender far and near LOD work before and after a theme switch
- Passed: Delayed GLB switch retains the complete previous scene until the new island is ready
- Passed: Twelve repeated switches converge to identical geometry, texture and shader-program counts
- Passed: Real canvas raycast opens the selected Blender flower detail
- Passed: Planting from the inbox and growth completion survive a theme switch without resetting birth time
- Passed: Dense actual Garden with 50 received plants plus two pair flowers works in all four themes
- Passed: Mobile selector has an explicit selected state and no horizontal overflow
- Passed: Blocked storage keeps the app functional and makes the in-memory preference explicit
- Passed: Fresh authenticated user receives Balanced Warm on its first painted garden
- Passed: All four themes switch through Me immediately, with the same island canvas and no garden writes
- Passed: Refresh restores the chosen theme without a temporary Balanced frame
- Passed: Browser process restart retains the user preference on the same device
- Passed: Logout/login isolates authenticated user IDs and does not consume the demo preference
- Passed: Corrupted stored theme restores Balanced Warm before first paint
- Passed: Profile nickname editing and friend navigation remain available
- Passed: Open detail, audio and its playback position survive an external same-user theme update
- Passed: Mobile Me layout has four selectable themes without horizontal overflow
- Passed: An injected archived GLB failure retains the complete Balanced garden, camera, plants and growth state; Me shows retry
- Passed: Retry successfully applies Warm and returning to Garden preserves the original canvas, camera and plant state
- Passed: Six overlapping theme requests settle on the final Aurora choice without an empty island, stale commit or canvas/camera replacement
- Passed: Only the intentionally injected network failure occurred; no runtime, shader or unexpected resource errors

## Limits

- Authentication, Supabase responses, profile RPCs and audio storage were local fixtures. The production UI and code paths were exercised, but no live account, garden or database was modified.
- Physical-device performance, native Capacitor restarts and cross-device synchronization were not tested. Browser process restart was tested; cross-device preference sync is outside this phase.
- Font CDN responses were stubbed in the production fixture to keep tests independent of network availability. Browser fixture screenshots otherwise use the app's normal font stack.
- A failed island download retains the last complete scene and offers retry in Me. Storage failures retain the selected theme only for the current session and display a saving notice.

Raw evidence: [Garden browser results](browser-results.json), [production results](production-results.json), [retry results](retry-results.json), [baseline comparison](baseline-performance.json).
