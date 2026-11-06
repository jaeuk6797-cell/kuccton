# Balanced Warm atmosphere comparison

Baseline: `a3ccad02ec2f50a5488287a815f675013a0582b8`. Both captures use the same Garden fixture, camera, and animation time. The Balanced sky now keeps its ivory and peach at the top, eases through lavender, and takes on pale blue and mint near the bottom. The sky gradient is shared by the garden and its developer preview; it does not tint the island lighting or plants.

| View | Before | After |
| --- | --- | --- |
| Garden, 12 plants and two pairs | [Before](balanced-before.png) | [After](balanced-after.png) |
| Mobile viewport, 50 plants and two pairs | [Before](balanced-mobile-dense-before.png) | [After](balanced-mobile-dense-after.png) |

Balanced replaces the old dots with one depth-tested batch of 72 tiny ivory, mint, pale blue, and pearl grains. The GPU drifts and fades them using a time uniform, reusing the same buffers when the theme returns. Reduced-motion mode holds the grains still.

| Matched view | Draws before → after | Triangles before → after | Mean frame interval before → after |
| --- | ---: | ---: | ---: |
| Garden | 624 → 624 | 75,624 → 75,624 | 16.71 → 17.27 ms |
| Dense mobile viewport | 2,134 → 2,134 | 168,100 → 168,100 | 17.08 → 16.76 ms |

Frame intervals are 180-sample observations in Chrome with hardware WebGL on a desktop. The mobile comparison uses a 390 × 844 viewport; these are not phone benchmark results.

The final Warm Opal, Aurora Crystal, and Original Opal screenshots matched the baseline pixel for pixel. The browser check also verified a real flower click during particle motion, the reduced-motion setting, and 12 theme switches with the same canvas, camera, plant positions and growth state, Blender LOD, correct grass palettes, and stable WebGL resource counts. No browser or shader errors were recorded. The production build, all 28 Node tests, and nine production browser checks passed. The production checks used local fixtures and confirmed Balanced remains the default and an open flower detail retains its audio and playback position through a theme update.

To reproduce the comparisons, run `node scripts/balancedAtmosphere.browser.mjs before` while serving the baseline, then run it with `after` while serving the refinement. The script expects the server on port 5199 unless `GARDEN_TEST_URL` is set. Run both commands from the refinement checkout to keep the generated evidence together.
