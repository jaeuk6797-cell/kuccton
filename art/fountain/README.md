# SUP garden fountain

The fountain sits in the former left crystal clearing, inside a planting exclusion the garden already uses. Its low scalloped porcelain bowl has a fine metal inlay, three short streams, and two ripple bands. The pond remains a separate feature on the opposite side. The island generator places the fountain on the actual terrain surface and exports it as part of the canonical GLB, so the garden loads one model per renderer.

| Asset | Source and output |
| --- | --- |
| Fountain | [Editable Blender file](fountain.blend) · [Generator](generate_fountain.py) · [Standalone GLB](../../public/models/fountain.glb) · [Blender close-up](blender-closeup.png) |
| Canonical island | [Editable Blender file](../island/island.blend) · [Generator](../island/generate_island.py) · [Island GLB](../../public/models/island-modern.glb) |

Rebuild from the repository root with Blender 5.2. The first command exports the standalone source and GLB and renders the close-up. The second builds the island with the same fountain meshes.

```sh
blender --background --factory-startup --python-exit-code 1 --python art/fountain/generate_fountain.py -- --render
blender --background --factory-startup --python-exit-code 1 --python art/island/generate_island.py
```

| Theme | Before | After | Rear | Side |
| --- | --- | --- | --- | --- |
| Balanced Warm | [Before](../unified-island/balanced-garden.png) | [After](gallery/balanced-garden.png) | [Rear](gallery/balanced-rear.png) | [Side](gallery/balanced-side.png) |
| Warm Opal | [Before](../unified-island/warm-garden.png) | [After](gallery/warm-garden.png) | [Rear](gallery/warm-rear.png) | [Side](gallery/warm-side.png) |
| Aurora Crystal | [Before](../unified-island/aurora-garden.png) | [After](gallery/aurora-garden.png) | [Rear](gallery/aurora-rear.png) | [Side](gallery/aurora-side.png) |
| Original Opal | [Before](../unified-island/default-garden.png) | [After](gallery/default-garden.png) | [Rear](gallery/default-rear.png) | [Side](gallery/default-side.png) |

The before captures are from the unified island on the same source tree as main `d5b12a3`. The browser data confirmed identical camera poses and plant IDs and positions before and after, including in the dense fixture. The front, rear, and side comparisons use a 520 × 900 garden and a fixed animation time of six seconds. The dense fixture uses 50 plants plus two pairs. [Dense garden](gallery/balanced-dense50.png) · [Mobile portrait](gallery/balanced-mobile50.png)

| Exported component | Triangles | Fountain materials and draws |
| --- | ---: | --- |
| Retained island | 12,539 | |
| Fountain | 1,486 | Three materials, four mesh draws |
| Instanced grass | 6,000 | One visible draw |
| **Total** | **20,025** | |

The standalone and embedded fountain have matching vertex data and faces. The retained island meshes preserve their authored vertex data and oriented faces. Grass retains its 1,000 clumps and clears the basin, pond and stems. The animation gently turns the water streams and scales the ripple mesh using the scene clock. Balanced alone receives `#91BD92` on the exposed planting surface, with lower gloss. Its pond and fountain water use separate materials.

| Full frame | Balanced, Warm, Original | Aurora |
| --- | ---: | ---: |
| 12 plants and two pairs | 618 draws / 75,550 triangles | 624 draws / 75,558 triangles |
| 50 plants and two pairs | 2,128 draws / 168,026 triangles | 2,134 draws / 168,034 triangles |

Each matched view uses six fewer draws and 74 fewer triangles than the crystal version. Counts include shadows and postprocessing. Dense frame intervals averaged 16.67–16.81 ms in Chrome on desktop Intel Arc WebGL. The mobile portrait is a browser viewport check.

The production build, 33 Node tests, 13 Garden browser checks, and three retry checks passed. They verified fountain palettes and water animation, terrain and blade clearance, matching geometry, stable resources across 12 theme switches, camera, growth, selection, LOD, and the dense garden. The one network error was deliberately injected to verify the planted fallback and retry. The Garden checks reported no runtime errors.

Nine production browser checks passed with local account and audio fixtures. Theme choices persisted through refresh and restart, and an open flower detail kept playing the same audio through a theme change. The production run reported zero console errors, page errors, or unexpected requests.
