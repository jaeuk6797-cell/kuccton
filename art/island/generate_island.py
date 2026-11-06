"""Build the SUP mineral garden with Blender Python. Add -- --render for a preview."""
import math
import random
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Euler, noise
from mathutils.geometry import delaunay_2d_cdt

TAU = math.tau
sin, cos, pi = math.sin, math.cos, math.pi
rng = random.Random(61749)
ROOT = Path(__file__).resolve().parents[2]


def rgb(value):
    values = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def field(x, y, z=0):
    return noise.noise_vector(Vector((x, y, z)), noise_basis='PERLIN_ORIGINAL').x


def smooth(t):
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def enum(owner, prop, wanted):
    values = [v.identifier for v in owner.bl_rna.properties[prop].enum_items]
    if wanted not in values:
        raise ValueError((prop, wanted, values))
    setattr(owner, prop, wanted)


def collection(name, parent):
    item = bpy.data.collections.new(name)
    parent.children.link(item)
    return item


def material(name, color, rough=.45, metal=0, alpha=1, painted=False, glow=0, facet_alpha=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb(color), alpha)
    mat.use_nodes = True
    mat.use_backface_culling = 'foliage' not in name.lower()
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*rgb(color), 1)
    shader.inputs['Roughness'].default_value = rough
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Alpha'].default_value = alpha
    shader.inputs['IOR'].default_value = 1.46
    if alpha < 1 or facet_alpha:
        enum(mat, 'surface_render_method', 'BLENDED')
        mat.use_backface_culling = True
    if glow:
        shader.inputs['Emission Color'].default_value = (*rgb(color), 1)
        shader.inputs['Emission Strength'].default_value = glow
    if painted:
        tint = mat.node_tree.nodes.new('ShaderNodeVertexColor')
        tint.layer_name = 'Tint'
        mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
        if facet_alpha:
            mat.node_tree.links.new(tint.outputs['Alpha'], shader.inputs['Alpha'])
    return mat


def iridescence(mat, strength, thickness):
    from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Thin Film Thickness'].default_value = thickness
    shader.inputs['Thin Film IOR'].default_value = 1.3
    name = get_gltf_node_name()
    settings = bpy.data.node_groups.get(name) or create_settings_group(name)
    node = mat.node_tree.nodes.new('ShaderNodeGroup')
    node.node_tree = settings
    node.inputs['Iridescence Factor'].default_value = strength
    shader.inputs['Coat Weight'].default_value = .35
    shader.inputs['Coat Roughness'].default_value = .10


def mineral_grain(mat):
    import numpy as np
    generator = np.random.default_rng(8157)
    height = generator.normal(0, 1, (512, 512))
    height = (height + np.roll(height, 1, 0) + np.roll(height, 1, 1)) / 3
    dx = (np.roll(height, 1, 1) - np.roll(height, -1, 1)) * .22
    dy = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * .22
    vectors = np.stack((dx, dy, np.ones_like(dx)), axis=-1)
    vectors /= np.linalg.norm(vectors, axis=-1)[..., None]
    pixels = np.concatenate((vectors * .5 + .5, np.ones((512, 512, 1))), axis=-1).astype(np.float32)
    image = bpy.data.images.new('SUP Mineral micrograin 512', width=512, height=512, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
    texture.image = image
    normal = mat.node_tree.nodes.new('ShaderNodeNormalMap')
    normal.inputs['Strength'].default_value = .16
    mat.node_tree.links.new(texture.outputs['Color'], normal.inputs['Color'])
    shader = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mat.node_tree.links.new(normal.outputs['Normal'], shader.inputs['Normal'])


class Geometry:
    def __init__(self):
        self.vertices, self.faces, self.colors = [], [], []

    def add(self, vertices, faces, colors=None):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)
        if colors is not None:
            self.colors.extend(colors)

    def object(self, name, group, mat, flat=False):
        data = bpy.data.meshes.new(name)
        data.from_pydata(self.vertices, [], self.faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        group.objects.link(obj)
        obj.parent = asset
        data.materials.append(mat)
        if mat == mats.get('surface'):
            uv = data.uv_layers.new(name='MineralUV')
            for loop in data.loops:
                point = data.vertices[loop.vertex_index].co
                uv.data[loop.index].uv = ((point.x + 4.1) / 8.2, (point.y + 4.1) / 8.2)
        if self.colors:
            layer = data.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='POINT')
            layer.data.foreach_set('color', [v for color in self.colors for v in (color if len(color) == 4 else (*color, 1))])
            data.color_attributes.active_color = layer
            data.color_attributes.render_color_index = 0
        for polygon in data.polygons:
            polygon.use_smooth = not flat
        return obj


def tube(geo, path, width, sides=6, closed=False, color=None):
    vertices, faces = [], []
    length = len(path)
    for i, point in enumerate(path):
        before = Vector(path[(i - 1) % length] if i or closed else point)
        after = Vector(path[(i + 1) % length] if i < length - 1 or closed else point)
        tangent = (after - before).normalized()
        up = Vector((0, 0, 1)) if abs(tangent.z) < .95 else Vector((0, 1, 0))
        side = tangent.cross(up).normalized()
        normal = side.cross(tangent).normalized()
        radius = width[i] if isinstance(width, list) else width
        for j in range(sides):
            a = TAU * j / sides
            vertices.append(Vector(point) + radius * (normal * cos(a) + side * sin(a)))
    for i in range(length if closed else length - 1):
        start, end = i * sides, ((i + 1) % length) * sides
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((start + j, start + k, end + k, end + j))
    if not closed:
        faces += [tuple(range(sides - 1, -1, -1)), tuple((length - 1) * sides + j for j in range(sides))]
    geo.add(vertices, faces, [color] * len(vertices) if color else None)


def correct_normals(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()


def ground(x, y):
    radius = math.hypot(x, y)
    return smooth((radius - 2.34) / 1.5) * (.035 + .032 * field(x, y, 4))


# Broad mineral shoulders with small dressed corners, rather than a radial wobble.
OUTLINE_CORNERS = [(3.92, .45), (3.50, 1.94), (2.33, 3.20), (.75, 3.70),
                   (-.65, 3.86), (-2.29, 3.16), (-3.48, 2.05), (-3.91, .48),
                   (-3.67, -1.23), (-2.85, -2.81), (-1.17, -3.57),
                   (.63, -3.79), (2.23, -3.14), (3.72, -1.98), (3.98, -.68)]
OUTLINE = []
for index, corner in enumerate(OUTLINE_CORNERS):
    p = Vector(corner)
    before = p.lerp(Vector(OUTLINE_CORNERS[index - 1]), .075)
    after = p.lerp(Vector(OUTLINE_CORNERS[(index + 1) % len(OUTLINE_CORNERS)]), .075)
    for step in range(5):
        t = step / 4
        OUTLINE.append(tuple((1 - t) ** 2 * before + 2 * t * (1 - t) * p + t * t * after))


def perimeter(angle):
    dx, dy = cos(angle), sin(angle)
    for (ax, ay), (bx, by) in zip(OUTLINE, OUTLINE[1:] + OUTLINE[:1]):
        ex, ey = bx - ax, by - ay
        determinant = dx * ey - dy * ex
        if abs(determinant) < 1e-9:
            continue
        radius = (ax * ey - ay * ex) / determinant
        t = (ax * dy - ay * dx) / determinant
        if radius > 0 and -.000001 <= t <= 1.000001:
            return radius
    raise ValueError('Outline ray did not intersect')


def contains(x, y, poly):
    inside = False
    for (ax, ay), (bx, by) in zip(poly, poly[1:] + poly[:1]):
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def pond_point(a, scale=1):
    shape = 1 + .07 * sin(3 * a) + .045 * cos(5 * a + .7)
    u, v = .62 * scale * shape * cos(a), .43 * scale * shape * sin(a)
    return 2.99 + .92 * u - .39 * v, -.89 + .39 * u + .92 * v


def mineral_color(x, y, z, pale=False):
    n = smooth(.5 + .72 * field(x * .54, y * .54, z * .65 + 2))
    if not pale:
        n = smooth(.5 + .32 * cos(math.atan2(y, x) - .2) + .30 * field(x * .7, y * .7, z * .5))
    secondary = .5 + .42 * field(x * 1.8 + 5, y * 1.8, z * .9)
    colors = ('216E88', '70509F', '54BBC0') if not pale else ('4799A9', '9373B6', '80BABE')
    color = mix(rgb(colors[0]), rgb(colors[1]), smooth(n))
    return mix(color, rgb(colors[2]), secondary * .51)


def surface_and_rim():
    count = 128
    outer = [(perimeter(a) * cos(a), perimeter(a) * sin(a)) for a in [TAU * i / count for i in range(count)]]
    shore = [pond_point(TAU * i / 64) for i in range(64)]
    points = outer + shore + [(0, 0)]
    for ring in range(1, 23):
        radius = ring * .18
        samples = max(12, int(TAU * radius / .20))
        for i in range(samples):
            a = TAU * (i + .38 * (ring % 3)) / samples
            r = radius + rng.uniform(-.018, .018)
            x, y = r * cos(a), r * sin(a)
            if r < perimeter(a) - .065 and not contains(x, y, shore) and min(math.hypot(x - px, y - py) for px, py in shore) > .065:
                points.append((x, y))
    edges = [(i, (i + 1) % count) for i in range(count)] + [(count + i, count + (i + 1) % 64) for i in range(64)]
    vertices, _, faces, *_ = delaunay_2d_cdt([Vector(p) for p in points], edges, [], 0, 1e-6)
    geo = Geometry()
    for x, y in vertices:
        geo.vertices.append((x, y, ground(x, y)))
        color = mineral_color(x, y, .3, True)
        grain = field(x * 17, y * 17, 2)
        edge = smooth((math.hypot(x, y) - 2.35) / 1.3)
        color = mix(color, mineral_color(x, y, -.7), edge * .30)
        geo.colors.append(tuple(c * (1 + grain * .12) for c in color))
    for face in faces:
        x, y = [sum(vertices[i][j] for i in face) / len(face) for j in (0, 1)]
        if contains(x, y, outer) and not contains(x, y, shore):
            geo.faces.append(face)
    geo.object('Island_Surface | Opalescent planting clearing', groups['surface'], mats['surface'])

    geo = Geometry()
    for i in range(count):
        a = TAU * i / count
        depth = .115 + .025 * sin(a * 2 + .4) + .012 * cos(a * 3)
        height = ground(perimeter(a) * cos(a), perimeter(a) * sin(a))
        profile = [(-.036, .001), (.005, .007), (.030, -.012),
                   (.031, -.032), (.010, -depth), (-.025, -depth + .012)]
        for j, (r, z) in enumerate(profile):
            r += perimeter(a)
            geo.vertices.append((r * cos(a), r * sin(a), z + height))
            t = .5 + .34 * sin(a * 2 - .8) + .13 * sin(a * 7)
            geo.colors.append(mix(rgb('B67C96'), rgb('F0C5A5'), t))
            k, nxt = i * len(profile), ((i + 1) % count) * len(profile)
            h = (j + 1) % len(profile)
            geo.faces.append((k + j, nxt + j, nxt + h, k + h))
    obj = geo.object('Island_Metal_Rim | Contour-following rose-gold seam', groups['rim'], mats['copper'])
    correct_normals(obj)
    inlay = Geometry()
    path = []
    for i in range(count):
        a = TAU * i / count
        x, y = (perimeter(a) + .004) * cos(a), (perimeter(a) + .004) * sin(a)
        path.append((x, y, ground(x, y) + .008))
    tube(inlay, path, .006, 4, True)
    inlay.object('Island_Metal_Rim | Champagne upper seam', groups['rim'], mats['gold'])


def rock(geo, position, scale, rotation, seed, detail=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)
    bm.verts.index_update()
    rot = Euler(rotation).to_matrix()
    vertices, colors = [], []
    for v in bm.verts:
        x, y, z = v.co
        wobble = 1 + .23 * field(x * 2 + seed, y * 2, z * 2) + .07 * cos(5 * math.atan2(y, x) + seed)
        local = Vector((x * scale[0], y * scale[1], (z + .16 * x) * scale[2])) * wobble
        point = Vector(position) + rot @ local
        vertices.append(point)
        colors.append(mineral_color(*point))
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    geo.add(vertices, faces, colors)
    bm.free()


def underside():
    geo = Geometry()
    # The fine top seam joins a deliberately coarse fracture lattice below it.
    top_count, count = 128, 32
    for i in range(top_count):
        a = TAU * i / top_count
        r = perimeter(a) - .017
        x, y = r * cos(a), r * sin(a)
        geo.vertices.append((x, y, ground(x, y) - .070))
    profiles = [(.975, -.23), (.89, -.49), (.77, -.84),
                (.61, -1.19), (.42, -1.68), (.22, -2.12), (.055, -2.57)]
    angles = [TAU * i / count for i in range(count)]
    for level, (ratio, z) in enumerate(profiles):
        t = level / (len(profiles) - 1)
        for i, angle in enumerate(angles):
            a = angle + .022 * sin(level * 1.6 + i * .8) * sin(pi * t)
            ridge = (.18 * sin(a * 3 + .6) + .15 * cos(a * 7 - .8)) * sin(pi * t)
            radius = perimeter(a) * ratio + ridge
            point = (radius * cos(a) - .52 * t, radius * sin(a) - 1.18 * t ** 1.25,
                     z + sin(pi * t) * (.19 * cos(a * 4 + .3) + .11 * sin(a * 7)))
            geo.vertices.append(point)
            k = top_count + level * count + i
            nxt = top_count + level * count + (i + 1) % count
            if not level:
                top = [(i * 4 + j) % top_count for j in range(5)]
                geo.faces.append(tuple(reversed(top)) + (k, nxt))
            elif (i + level) % 3:
                geo.faces += [(k - count, k, nxt), (k - count, nxt, nxt - count)]
            else:
                geo.faces += [(k - count, k, nxt - count), (k, nxt, nxt - count)]
    geo.vertices.append((-.56, -1.23, -2.86))
    for i in range(count):
        last = top_count + (len(profiles) - 1) * count
        geo.faces.append((last + (i + 1) % count, last + i, len(geo.vertices) - 1))
    obj = geo.object('Island_Crystal_Underside | Asymmetric mineral keel', groups['under'], mats['mineral'], True)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bmesh.ops.dissolve_limit(bm, angle_limit=.13, verts=list(bm.verts), edges=list(bm.edges), delimit=set())
    # Narrow two-strip chamfers catch the sky without rounding the broad planes.
    creases = [edge for edge in bm.edges if len(edge.link_faces) == 2
               and min(vertex.co.z for vertex in edge.verts) > -2.3
               and edge.calc_length() > .12 and edge.calc_face_angle(0) > .18]
    bevel = bmesh.ops.bevel(bm, geom=creases, offset=.013, segments=2,
                          affect='EDGES', profile=.5, clamp_overlap=True)
    for face in bevel['faces']:
        face.smooth = True
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=list(bm.edges), dist=1e-6)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    tint = obj.data.color_attributes.new(name='Tint', type='FLOAT_COLOR', domain='CORNER')
    for face in obj.data.polygons:
        center = face.center
        color = mineral_color(*center)
        band = .5 + .5 * sin(center.z * 3.5 + math.atan2(center.y, center.x) * 1.7)
        color = mix(color, rgb('A0D8D8'), .11 * band + (.06 if face.use_smooth else 0))
        for index in face.loop_indices:
            tint.data[index].color = (*color, 1)
    obj.data.color_attributes.active_color = tint
    obj.data.color_attributes.render_color_index = 0


def prism(geo, position, width, height, lean, palette, seed, edges=None, transparent=False):
    local_rng = random.Random(seed)
    orientation = local_rng.random() * TAU
    radii = [width * local_rng.uniform(.78, 1.15) for _ in range(6)]
    angles = [orientation + TAU * i / 6 + local_rng.uniform(-.09, .09) for i in range(6)]
    shoulder = local_rng.uniform(.60, .76) * height
    slope = local_rng.uniform(-.16, .16)
    rot = Euler(lean).to_matrix()
    coordinates = []
    neck = min(.03, .5 * (shoulder - abs(slope) * max(radii)))
    for z, scale in [(-.035, .86), (neck, 1), (shoulder, 1)]:
        for r, a in zip(radii, angles):
            x, y = r * cos(a), r * sin(a)
            coordinates.append((x * scale, y * scale, z + (slope * x if z == shoulder else 0)))
    coordinates.append((width * .16, -width * .12, height))
    faces = [tuple(range(5, -1, -1))]
    for i in range(6):
        k = (i + 1) % 6
        faces += [(i, k, k + 6, i + 6), (i + 6, k + 6, k + 12, i + 12), (i + 12, k + 12, 18)]
    # Split vertices preserve planar normals and the distinct tint of each crystal face.
    palette = [rgb(c) for c in palette]
    for index, face in enumerate(faces):
        tint = palette[(index * 7 + seed) % len(palette)]
        transformed, colors = [], []
        for i in face:
            p = Vector(coordinates[i])
            transformed.append(Vector(position) + rot @ p)
            depth = max(0, min(1, p.z / height))
            color = mix(tint, rgb('E8F4F6'), .16 * depth)
            if transparent:
                opacity = (.77 - .30 * depth) * (.83 + .17 * sin(index * 1.7 + seed) ** 2)
                color = (*color, opacity)
            colors.append(color)
        geo.add(transformed, [tuple(range(len(face)))], colors)
    if edges is not None:
        for i in range(6):
            pair = [i + 12, 18]
            if i % 2 == 0:
                pair.insert(0, i + 6)
            tube(edges, [Vector(position) + rot @ Vector(coordinates[j]) for j in pair], .0028, 4)


def crystalline_details():
    palettes = [
        ['556BB4', 'B57DCC', '62C8D8', '8E86CE', 'C899C1', '7052A9'],
        ['43BCCB', 'B9E1E7', '9581CF', '478BB1', 'BC80C7', '74CED8'],
        ['CF91C6', 'A9B7DD', '78C9D0', 'E5B7D5', '9873BF', 'C0DCE8'],
    ]
    clusters = [(-2.85, .87, [(0, 0, .17, 1.39, -.13, .13), (.32, .12, .13, .92, .15, .36), (-.24, .16, .12, 1.03, -.15, -.26), (.04, -.30, .11, .73, .29, -.18), (-.35, -.11, .09, .57, .15, -.38)]),
                (2.35, 2.12, [(0, 0, .17, 1.12, -.12, .05), (.28, -.16, .12, .75, .27, .24), (-.26, .21, .12, .83, -.20, -.22), (.03, .33, .095, .61, -.29, .15)]),
                (.63, 3.13, [(0, 0, .15, 1.35, -.12, .12), (.27, .05, .12, .93, -.08, .31), (-.23, .14, .10, .76, -.20, -.24)])]
    edge_geometry = Geometry()
    for cluster_id, (cx, cy, specifications) in enumerate(clusters):
        for kind in range(3):
            geo = Geometry()
            for i, (dx, dy, width, height, lx, ly) in enumerate(specifications):
                if i % 3 != kind:
                    continue
                x, y = cx + dx, cy + dy
                prism(geo, (x, y, ground(x, y)), width, height, (lx, ly, .13 * i), palettes[kind], cluster_id * 23 + i, edge_geometry, True)
            geo.object(f'Island_Peripheral_Crystals | Cluster {cluster_id + 1} facet family {kind + 1}', groups['crystals'], mats[f'crystal{kind}'], True)
    edge_geometry.object('Island_Peripheral_Crystals | Polished facet edges', groups['crystals'], mats['silver'])
    # Fixed mineral fragments stay outside the protected planting area.
    chips = Geometry()
    for i in range(100):
        a = rng.uniform(0, TAU)
        r = rng.uniform(2.53, perimeter(a) - .14)
        x, y = r * cos(a), r * sin(a)
        if math.hypot((x - 2.99) / .75, (y + .89) / .55) < 1:
            continue
        prism(chips, (x, y, ground(x, y) - .024), rng.uniform(.025, .068), rng.uniform(.035, .09), (0, .17, a), palettes[i % 3], 700 + i)
    chips.object('Island_Accents | Scattered opal gravel', groups['accents'], mats['mineral'], True)

def ornamental_ring():
    geo = Geometry()
    center = Vector((-.70, 3.04, .89))
    def point(a, radius=.86, depth=0):
        shape = 1 + .045 * sin(a * 2 + .45) + .018 * cos(a * 3)
        return center + Vector((radius * shape * cos(a), depth, radius * shape * sin(a)))
    tube(geo, [point(TAU * i / 112) for i in range(112)], .025, 8, True)
    tube(geo, [point(.31 + i * 2.52 / 56, .892, .013) for i in range(57)], .008, 4)
    for angle in [pi / 2, .24, pi - .24]:
        tube(geo, [point(angle, r, -.025) for r in [.824, .89]], .008, 5)
    for x in [-.28, .28]:
        tube(geo, [center + Vector((x, 0, -.84)), center + Vector((x, 0, -.90))], .033, 8)
    geo.object('Island_Ornamental_Ring | Fine golden resonator', groups['ring'], mats['gold'])
    supports = Geometry()
    for x in [-.99, -.41]:
        rock(supports, (x, 3.04, .025), (.16, .13, .07), (0, 0, .4), x + 7, 2)
    supports.object('Island_Ornamental_Ring | Opal feet', groups['ring'], mats['mineral'])


def pond():
    geo = Geometry()
    count = 64
    rings = [(1, None, 'BCCDCB'), (.94, -.013, 'B4D3CD'), (.86, -.046, 'A1CFCF'), (.65, -.10, '77B5C0'), (.33, -.12, '8BA8C7')]
    for j, (scale, z, color) in enumerate(rings):
        for i in range(count):
            x, y = pond_point(TAU * i / count, scale)
            geo.vertices.append((x, y, ground(x, y) if z is None else z))
            geo.colors.append(mix(rgb(color), rgb('C3AED3'), .20 * (.5 + .5 * sin(i * .3))))
            if j:
                k, n = j * count + i, j * count + (i + 1) % count
                geo.faces.append((k - count, n - count, n, k))
    geo.vertices.append((2.99, -.89, -.12))
    geo.colors.append(rgb('87B5C6'))
    for i in range(count):
        last = (len(rings) - 1) * count
        geo.faces.append((last + i, last + (i + 1) % count, len(geo.vertices) - 1))
    geo.object('Island_Pond | Recessed mineral basin', groups['pond'], mats['surface'])
    geo = Geometry()
    geo.add([(*pond_point(TAU * i / count, .86), -.045) for i in range(count)], [tuple(range(count))])
    geo.object('Island_Pond | Single aqua water sheet', groups['pond'], mats['water'], True)
    geo = Geometry()
    for radius, start, finish in [(.25, .32, 1.64), (.33, .48, 1.51)]:
        tube(geo, [(3.01 + radius * cos(a), -.91 + radius * .4 * sin(a), -.043) for a in [start + (finish - start) * i / 25 for i in range(26)]], .004, 4)
    geo.object('Island_Pond | Quiet silver ripples', groups['pond'], mats['silver'])


def leaf(geo, start, end, width, color):
    start, end = Vector(start), Vector(end)
    delta = end - start
    side = delta.cross(Vector((0, 0, 1))).normalized()
    verts, faces, colors = [start], [], [rgb(color)]
    for i in range(1, 4):
        t = i / 4
        p = start + t * delta + Vector((0, 0, sin(pi * t) * delta.length * .16))
        w = width * sin(pi * t) ** .8
        for j in [-1, 0, 1]:
            verts.append(p + side * j * w + Vector((0, 0, (1 - abs(j)) * w * .22)))
            colors.append(mix(rgb(color), rgb('AFE4D8'), .28 if j else .07))
        n = 1 + (i - 1) * 3
        if i == 1:
            faces += [(0, n, n + 1), (0, n + 1, n + 2)]
        else:
            faces += [(n - 3, n, n + 1, n - 2), (n - 2, n + 1, n + 2, n - 1)]
    tip = len(verts)
    verts.append(end)
    colors.append(rgb(color))
    faces += [(tip - 3, tip, tip - 2), (tip - 2, tip, tip - 1)]
    geo.add(verts, faces, colors)


def vegetation():
    foliage, stems, lights = Geometry(), Geometry(), Geometry()
    plants = [(-2.93, -.53, .55), (-2.0, 2.55, .54), (-1.45, 3.21, .36), (1.49, 2.96, .51), (3.29, .42, .45), (2.00, -2.65, .29), (-2.1, -2.72, .25), (-3.25, 1.6, .46)]
    for plant_id, (x, y, height) in enumerate(plants):
        base = Vector((x, y, ground(x, y)))
        for frond in range(3):
            a = TAU * frond / 3 + plant_id * 1.2
            reach = Vector((cos(a) * height * .36, sin(a) * height * .36, height * (.85 + .12 * sin(frond))))
            tube(stems, [base + reach * i / 9 for i in range(10)], [.008 * (1 - i / 12) for i in range(10)], 4, color=rgb('7DBDBD'))
            for k in range(1, 6):
                t = .17 + k * .12
                stem = base + reach * t
                for direction in [-1, 1]:
                    side = Vector((-sin(a), cos(a), .23)) * direction
                    end = stem + side * height * .24 * (1.15 - t) + Vector((cos(a), sin(a), .3)) * height * .10
                    leaf(foliage, stem, end, height * .048 * (1.1 - t), ['709CA9', 'A38CB8', '78B6BA'][plant_id % 3])
    grasses = Geometry()
    for i in range(65):
        a = rng.uniform(0, TAU)
        r = rng.uniform(3.1, perimeter(a) - .15)
        x, y = r * cos(a), r * sin(a)
        if math.hypot(x - 2.99, y + .89) < .8:
            continue
        height = rng.uniform(.08, .27)
        base = Vector((x, y, ground(x, y)))
        path = [base + Vector((cos(a) * height * .27 * t * t, sin(a) * height * .27 * t * t, height * t)) for t in [j / 7 for j in range(8)]]
        tube(grasses, path, [.008 * (1 - j / 8) for j in range(8)], 4, color=rgb('A9BEBA'))
        tube(lights, path[-3:], [.005, .004, .001], 4)
    foliage.add(stems.vertices, stems.faces, stems.colors)
    foliage.add(grasses.vertices, grasses.faces, grasses.colors)
    foliage.object('Island_Vegetation | Ferns and bent grasses', groups['plants'], mats['foliage'])
    lights.object('Island_Accents | Luminous filament tips', groups['accents'], mats['light'])


def preview_backdrop(rig, camera):
    direction = (Vector((0, 0, -.25)) - camera.location).normalized()
    center = Vector((0, 0, -.25)) + direction * 14
    rotation = camera.rotation_euler.to_matrix()
    right, up = rotation @ Vector((1, 0, 0)), rotation @ Vector((0, 1, 0))
    geo = Geometry()
    for height, color in [(-12, 'A8CFD5'), (0, 'C3B5D9'), (12, 'E8BBCF')]:
        for side in [-1, 1]:
            geo.vertices.append(center + right * side * 20 + up * height)
            geo.colors.append(rgb(color))
    geo.faces = [(0, 1, 3, 2), (2, 3, 5, 4)]
    mat = bpy.data.materials.new('SUP Preview sky gradient')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    tint = nodes.new('ShaderNodeVertexColor')
    tint.layer_name = 'Tint'
    emission = nodes.new('ShaderNodeEmission')
    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(tint.outputs['Color'], emission.inputs['Color'])
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    backdrop = geo.object('SUP Preview sky backdrop', rig, mat)
    backdrop.parent = None
    return backdrop


def preview_rig():
    rig = collection('SUP_Preview_Rig | excluded from GLB', scene.collection)
    cam_data = bpy.data.cameras.new('SUP_Preview_Camera')
    camera = bpy.data.objects.new('SUP_Preview_Camera', cam_data)
    rig.objects.link(camera)
    camera.location = (0, -16.4, 6.6)
    camera.rotation_euler = (Vector((0, 0, -.25)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = 10.3
    scene.camera = camera
    for name, location, power, size, color in [
        ('Warm key', (5, -5, 8), 650, 4, 'FFF1E8'),
        ('Cyan fill', (-4, -1, 3), 400, 3, 'C4ECF4'),
        ('Lavender rim', (0, 5, 5.5), 950, 3, 'E7CCFA'),
        ('Underside bounce', (-3, -4, -2.0), 120, 3, 'C0E8E9'),
    ]:
        data = bpy.data.lights.new('SUP ' + name, 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        data.color = rgb(color)
        obj = bpy.data.objects.new('SUP ' + name, data)
        rig.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, -.4)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    world = bpy.data.worlds.new('SUP Preview Sky')
    world.use_nodes = True
    background = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
    background.inputs['Color'].default_value = (*rgb('889DB8'), 1)
    background.inputs['Strength'].default_value = .28
    scene.world = world
    try:
        scene.render.engine = 'CYCLES'
    except TypeError as error:
        raise RuntimeError(str(error))
    scene.cycles.samples = 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    # The static RNA enum does not expose every OCIO choice. Preserve the scene default.
    scene.view_settings.exposure = -.2
    scene.render.film_transparent = False
    preview_backdrop(rig, camera)


def build():
    global scene, asset, groups, mats
    rng.seed(61749)
    noise.seed_set(61749)
    # Preserve existing scenes when rebuilding in an interactive Blender session.
    if 'SOOP_Island' in bpy.data.scenes:
        bpy.data.scenes['SOOP_Island'].name = 'SOOP_Island_Previous_Study'
    scene = bpy.data.scenes.new('SOOP_Island')
    bpy.context.window.scene = scene
    root = collection('SUP_Floating_Island', scene.collection)
    asset = bpy.data.objects.new('SUP_Island_Root', None)
    root.objects.link(asset)
    groups = {key: collection(name, root) for key, name in [
        ('surface', 'Island_Surface'), ('rim', 'Island_Metal_Rim'), ('under', 'Island_Crystal_Underside'),
        ('crystals', 'Island_Peripheral_Crystals'), ('ring', 'Island_Ornamental_Ring'),
        ('plants', 'Island_Vegetation'), ('accents', 'Island_Accents'), ('pond', 'Island_Pond')]}
    mats = {
        'surface': material('SUP Opalescent ground', '6CA8B8', .39, .035, painted=True),
        'mineral': material('SUP Layered turquoise mineral', '5F9AAE', .32, .12, painted=True),
        'copper': material('SUP Brushed rose gold', 'DFABAA', .26, .60, painted=True),
        'gold': material('SUP Champagne gold', 'E6C299', .24, .55),
        'silver': material('SUP Pearl water highlights', 'E3ECEB', .22, .12),
        'water': material('SUP Still aqua water', 'B7E4E6', .18, .08, .64),
        'foliage': material('SUP Iridescent foliage', 'A0C1C2', .39, .08, painted=True),
        'light': material('SUP Warm luminous filaments', 'FBE4AB', .32, glow=2.8),
    }
    for i in range(3):
        crystal = material(['SUP Lavender quartz', 'SUP Cyan quartz', 'SUP Pink opal'][i], 'FFFFFF', .055 + i * .012, .04, painted=True, facet_alpha=True)
        iridescence(crystal, .32, 320 + i * 45)
        shader = next(n for n in crystal.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        shader.inputs['Specular Tint'].default_value = (*rgb(['C6B9E5', 'A4D9E4', 'E2B8DA'][i]), 1)
        shader.inputs['Coat Weight'].default_value = .12
        mats[f'crystal{i}'] = crystal
    iridescence(mats['mineral'], .32, 360)
    mineral_shader = next(n for n in mats['mineral'].node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    mineral_shader.inputs['Coat Weight'].default_value = .22
    mineral_shader.inputs['Coat Roughness'].default_value = .24
    # The broad ground uses inexpensive PBR reflections; thin-film coats stay on minerals.
    mineral_grain(mats['surface'])
    surface_and_rim()
    underside()
    crystalline_details()
    ornamental_ring()
    pond()
    vegetation()
    preview_rig()
    for ob in root.all_objects:
        if ob.type == 'MESH':
            ob.data.calc_loop_triangles()
    print('SUP build complete', sum(len(o.data.loop_triangles) for o in root.all_objects if o.type == 'MESH'), 'triangles')
    return root


def export(root):
    for obj in bpy.context.view_layer.objects:
        obj.select_set(False)
    for obj in root.all_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = asset
    destination = ROOT / 'public' / 'models' / 'island.glb'
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True, use_active_scene=True,
                              export_yup=True, export_animations=False, export_cameras=False,
                              export_lights=False, export_apply=True)
    # A temporary library transfers only this scene to a separate Blender process.
    # Saving there produces an ordinary editable .blend and preserves the live session.
    source_directory = (ROOT / 'art' / 'island').resolve()
    with tempfile.TemporaryDirectory(prefix='sup-source-', dir=source_directory) as directory:
        assert Path(directory).resolve().parent == source_directory
        library = Path(directory) / 'scene.blend'
        bpy.data.libraries.write(str(library), {scene}, fake_user=True, compress=True)
        result = subprocess.run([
            bpy.app.binary_path, '--background', '--factory-startup', '--python-exit-code', '1', '--python', __file__,
            '--', '--pack-source', str(library),
        ], capture_output=True, text=True, encoding='utf-8', errors='replace', check=True)
        print(result.stdout)
    print('Saved', destination)


def pack_source(library):
    bpy.context.preferences.filepaths.save_version = 0
    defaults = list(bpy.data.objects)
    default_scenes = list(bpy.data.scenes)
    with bpy.data.libraries.load(str(library), link=False) as (source, target):
        target.scenes = source.scenes
    bpy.context.window.scene = target.scenes[0]
    for obj in defaults:
        bpy.data.objects.remove(obj, do_unlink=True)
    for default in default_scenes:
        bpy.data.scenes.remove(default)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art' / 'island' / 'island.blend'), compress=True)


if __name__ == '__main__':
    if '--pack-source' in sys.argv:
        pack_source(sys.argv[sys.argv.index('--pack-source') + 1])
    else:
        island = build()
        export(island)
        if '--render' in sys.argv:
            scene.render.filepath = str(ROOT / 'art' / 'island' / 'preview.png')
            bpy.ops.render.render(write_still=True, scene=scene.name)
