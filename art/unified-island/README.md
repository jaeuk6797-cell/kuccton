# Unified island verification

The branch started at the latest theme selector, `12e9120`, and fast-forwarded to `8824afe` to include the merged Balanced Warm atmosphere pass. Every theme loads the same approved `island-modern.glb`. The export matches the approved asset byte for byte and has 14,099 triangles. One grass mesh contributes 1,000 clumps, 6,000 triangles, and one visible draw, for a shared static budget of **20,099 triangles**.

| Theme | Front | Rear | Side | 50 plants plus two pairs |
| --- | --- | --- | --- | --- |
| Balanced Warm | [Front](balanced-garden.png) | [Rear](balanced-rear.png) | [Side](balanced-side.png) | [Dense](balanced-dense50.png) |
| Warm Opal | [Front](warm-garden.png) | [Rear](warm-rear.png) | [Side](warm-side.png) | [Dense](warm-dense50.png) |
| Aurora Crystal | [Front](aurora-garden.png) | [Rear](aurora-rear.png) | [Side](aurora-side.png) | [Dense](aurora-dense50.png) |
| Original Opal | [Front](default-garden.png) | [Rear](default-rear.png) | [Side](default-side.png) | [Dense](default-dense50.png) |

Each direction uses the same camera pose across themes. The main comparison uses a 520 × 900 garden within a 1280 × 900 browser viewport at DPR 1. All captures use the same 12 plants and two pairs at animation time 6 seconds. The dense comparison freezes its 52 plants at 8 seconds. The views show the shared asymmetrical outline, centered underside, pond, rim, and crystal placement without the former upright hoop.

| Theme | Draws with 14 plants | Triangles with 14 plants | Draws with 52 plants | Triangles with 52 plants |
| --- | ---: | ---: | ---: | ---: |
| Balanced Warm | 624 | 75,624 | 2,134 | 168,100 |
| Warm Opal | 624 | 75,624 | 2,134 | 168,100 |
| Aurora Crystal | 630 | 75,632 | 2,140 | 168,108 |
| Original Opal | 624 | 75,624 | 2,134 | 168,100 |

These are full-frame counts, including plants, shadows, and postprocessing. Aurora's extra draws and triangles come from its atmosphere and glow. The browser measurements used Chrome 157 with Intel Arc 140V WebGL on a desktop. The mobile viewport checks cover layout and interaction.

The production build and all 32 Node tests passed. Twelve Garden browser checks verified one island request per renderer, shared model and grass buffers, fixed plant state across theme switches, growth, LOD, picking, and the dense scene. Geometry, texture, and shader-program counts stabilized across 12 switches, and each theme restored the same island color values. Three retry checks verified that an injected load failure kept the planted fallback visible and that six theme choices during retry shared the same pending GLB. No unexpected runtime or shader errors were recorded. [Garden results](browser-results.json) · [Retry results](retry-results.json)

Nine production browser checks passed using local account and audio fixtures. They verified theme persistence, account isolation, mobile layout, and the same audio element and continuing playback position through a theme update.
