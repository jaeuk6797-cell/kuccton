"""Rebuild the SUP hero flower with Blender 5.2 from any working directory.

blender --background --factory-startup --python-exit-code 1 --python art/flora/generate_crystal_flower.py

Pass -- --draft for smaller previews while editing. Dimensions are in meters.
"""

import argparse
import random
import sys
from math import cos, pi, radians, sin, sqrt, tau
from pathlib import Path
from typing import NamedTuple

import bpy
from io_scene_gltf2.blender.com.material_helpers import create_settings_group, get_gltf_node_name
from mathutils import Vector
from mathutils.bvhtree import BVHTree


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
HEAD = Vector((.034, .013, .422))
WIDTH = (.11, .28, .49, .69, .84, .95, 1, .98, .89, .75, .57)
PETAL_STATIONS = (0, .26, .50, .73, .89, 1)
INNER_STATIONS = (0, .30, .59, .82, 1)
LOD_STATIONS = (0, .38, .74, 1)


class Petal(NamedTuple):
    angle: float
    length: float
    width: float
    rise: float
    sweep: float
    curl: float
    roll: float
    color: str


# The rows are deliberately spaced by eye. Sweep and roll loosen the spiral while
# the length, curl and rise set the outline of each individual lip.
OUTER = (
    Petal(-172, .180, .085, .069, -.037, -.028, .17, 'E4BADE'),
    Petal(-125, .204, .091, .040, -.018, -.026, -.07, 'F4C1CC'),
    Petal(-84, .181, .072, .071, -.024, -.011, .10, 'E4A9C5'),
    Petal(-41, .192, .093, .078, -.029, -.019, -.16, 'EAC5DE'),
    Petal(7, .211, .094, .065, -.015, -.028, .12, 'BDABE2'),
    Petal(50, .180, .079, .092, -.035, -.011, -.18, 'B5DBE6'),
    Petal(97, .192, .086, .084, -.031, -.024, .17, 'CFBAEB'),
    Petal(144, .167, .075, .099, -.024, -.013, -.14, 'D7BCE9'),
)
MIDDLE = (
    Petal(-151, .153, .069, .115, -.029, -.018, .15, 'EBC2DF'),
    Petal(-99, .139, .066, .093, -.016, -.012, -.10, 'F2BED1'),
    Petal(-49, .147, .063, .114, -.022, -.014, .18, 'E8ACCA'),
    Petal(4, .133, .061, .125, -.015, -.016, -.12, 'E0C7EA'),
    Petal(56, .149, .067, .136, -.024, -.020, .12, 'EDBCD9'),
    Petal(111, .154, .072, .134, -.036, -.026, -.18, 'F4D2DE'),
    Petal(158, .125, .060, .127, -.022, -.012, .21, 'E5C5E9'),
)
INNER = (
    Petal(-152, .090, .043, .145, -.019, -.022, -.12, 'F3CDD6'),
    Petal(-81, .084, .040, .110, -.019, -.020, .14, 'F5CCD7'),
    Petal(-12, .093, .046, .141, -.021, -.028, -.09, 'F7DBDD'),
    Petal(63, .082, .044, .163, -.024, -.023, .14, 'F9DDD8'),
    Petal(132, .097, .049, .151, -.023, -.027, -.15, 'F4D5E3'),
)


def rgb(hex_color):
    values = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in values)


def mix(a, b, amount):
    return tuple(x + (y - x) * amount for x, y in zip(a, b))


def material(name, color, roughness, metallic, coat, film=None, painted=True):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb(color), 1)
    mat.use_backface_culling = True
    nodes = mat.node_tree.nodes
    shader = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
    for socket, value in {
        'Base Color': (*rgb('FFFFFF' if painted else color), 1),
        'Roughness': roughness, 'Metallic': metallic, 'IOR': 1.46,
        'Coat Weight': coat, 'Coat Roughness': .13,
    }.items():
        shader.inputs[socket].default_value = value
    if painted:
        tint = nodes.new('ShaderNodeVertexColor')
        tint.layer_name = 'OpalTint'
        tint.location = (-280, 260)
        mat.node_tree.links.new(tint.outputs['Color'], shader.inputs['Base Color'])
    if film:
        strength, thickness = film
        shader.inputs['Thin Film Thickness'].default_value = thickness
        shader.inputs['Thin Film IOR'].default_value = 1.35
        group_name = get_gltf_node_name()
        settings = nodes.new('ShaderNodeGroup')
        settings.node_tree = bpy.data.node_groups.get(group_name) or create_settings_group(group_name)
        settings.inputs['Iridescence Factor'].default_value = strength
        settings.inputs['Iridescence Thickness Minimum'].default_value = thickness - 55
        settings.location = (-280, -20)
    return mat


class Geometry:
    def __init__(self):
        self.vertices = []
        self.faces = []
        self.colors = []
        self.smooth = []
        self.sharp = set()
        self.parts = {}

    def add(self, vertices, faces, colors, smooth, sharp=(), part=None):
        offset = len(self.vertices)
        self.vertices.extend(vertices)
        self.faces.extend(tuple(offset + i for i in face) for face in faces)
        self.colors.extend(colors)
        self.smooth.extend([smooth] * len(faces) if isinstance(smooth, bool) else smooth)
        self.sharp.update(tuple(sorted((offset + a, offset + b))) for a, b in sharp)
        if part:
            self.parts[part] = range(offset, len(self.vertices))

    def object(self, name, collection, mat, parent, location=(0, 0, 0)):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.update()
        mesh.materials.append(mat)
        for polygon, smooth in zip(mesh.polygons, self.smooth):
            polygon.use_smooth = smooth
        for edge in mesh.edges:
            edge.use_edge_sharp = tuple(sorted(edge.vertices)) in self.sharp
        tint = mesh.color_attributes.new(name='OpalTint', type='BYTE_COLOR', domain='POINT')
        for entry, color in zip(tint.data, self.colors):
            entry.color = (*color, 1)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.parent = parent
        obj.location = location
        for part, indices in self.parts.items():
            obj.vertex_groups.new(name=part).add(list(indices), 1, 'REPLACE')
        return obj


def profile_at(profile, t):
    index = t * (len(profile) - 1)
    a = min(int(index), len(profile) - 2)
    return profile[a] + (profile[a + 1] - profile[a]) * (index - a)


def shell(geo, surface, tint, thickness, part, stations, across, crease, lip_detail=False):
    """Carve a closed, thin lens. Shared rim vertices keep both sides economical."""
    vertices, colors = [surface(0, 0)], [tint(0, 0)]
    top, bottom = [], []
    lip, underside = rgb('FFF2E5'), rgb('A194C1')
    lip_samples = across
    lip_spans = list(range(len(across)))
    if lip_detail:
        lip_samples = (-1, (-1 + across[1]) / 2, *across[1:-1], (1 + across[-2]) / 2, 1)
        lip_spans = (0, 2, 3, 4, 6)
    for t in stations[1:]:
        top_row, bottom_row = [], []
        for s in lip_samples if t == 1 else across:
            point, color = surface(t, s), tint(t, s)
            top_row.append(len(vertices))
            if t == 1 or abs(s) == 1:
                bottom_row.append(len(vertices))
                vertices.append(point)
                colors.append(mix(color, lip, .14 * t))
                continue
            along = surface(min(t + .001, 1), s) - surface(t - .001, s)
            cross = surface(t, s + .001) - surface(t, s - .001)
            offset = along.cross(cross).normalized() * (thickness * .5 * (1 - .5 * abs(s)))
            bottom_row.append(len(vertices) + 1)
            vertices.extend((point + offset, point - offset))
            colors.extend((color, mix(color, underside, .26)))
        top.append(top_row)
        bottom.append(bottom_row)

    faces = []
    for j in range(len(across) - 1):
        faces.extend(((0, top[0][j], top[0][j + 1]), (0, bottom[0][j + 1], bottom[0][j])))
    for i in range(len(top) - 1):
        spans = lip_spans if i == len(top) - 2 else range(len(across))
        for j in range(len(across) - 1):
            a, b = spans[j], spans[j + 1] + 1
            faces.append((top[i][j], *top[i + 1][a:b], top[i][j + 1]))
            faces.append((bottom[i][j + 1], *reversed(bottom[i + 1][a:b]), bottom[i][j]))

    perimeter = [0, *(row[0] for row in top[:-1]), *top[-1], *(row[-1] for row in reversed(top[:-1]))]
    sharp = list(zip(perimeter, perimeter[1:] + perimeter[:1]))
    for side in (top, bottom):
        sharp.extend((a[crease], b[crease]) for a, b in zip(side[:-2], side[1:-1]))
    geo.add(vertices, faces, colors, True, sharp, part)


def petal(geo, spec, root_radius, cup, index, level, lod):
    angle = radians(spec.angle)
    radial = Vector((cos(angle), sin(angle), 0))
    lateral = Vector((-sin(angle), cos(angle), 0))
    phase = index * 2.41 + level * 1.75
    core = rgb(('B487B9', 'C186B2', 'C18FAD')[level])
    body, lip = rgb(spec.color), rgb(('F6DFE9', 'FBE1E2', 'FCEAD7')[level])
    flash = rgb(('9FCFE9', 'BCABEA', 'F6E3CB')[level])

    def surface(t, s):
        width = spec.width * profile_at(WIDTH, t) * (1 + .12 * s * sin(phase))
        # A broad cupped belly rolls into an asymmetric scallop at the distal edge.
        ruffle = (.036 * sin(5.3 * s + phase) + .010 * cos(8.4 * s - phase)) * t ** 4
        recurve = (.042 + .057 * level) * t ** 6
        length = root_radius + spec.length * (t - recurve - .18 * s * s * t ** 3 + ruffle)
        x = width * s + spec.sweep * t ** 1.65
        fold = abs(s + .23) - .23 if index % 2 == 0 else abs(s - .24) - .24
        z = (spec.rise * t ** 1.22 + .73 * spec.curl * t ** 5
             + (cup * s * s + .015 * fold) * sin(pi * t * .83)
             + width * s * spec.roll * t + spec.length * ruffle * .55)
        return radial * length + lateral * x + Vector((0, 0, z))

    def tint(t, s):
        color = mix(core, body, min(1, t * 1.64))
        color = mix(color, flash, .57 * t * max(0, sin(phase) * s))
        return mix(color, lip, .38 * t ** 4 + .12 * s * s * t)

    fold = -.23 if index % 2 == 0 else .24
    across = (-1, fold, 1) if lod else (-1, -.63, fold, .61, 1)
    stations = LOD_STATIONS if lod else INNER_STATIONS if level == 2 else PETAL_STATIONS
    shell(geo, surface, tint, (.010, .009, .008)[level], f'Petal {index + 1:02}',
          stations, across, crease=1 if lod else 2, lip_detail=level == 0 and not lod)


def stem_point(t):
    return Vector((HEAD.x * t - .031 * sin(tau * t), HEAD.y * t + .025 * sin(pi * t), HEAD.z * t))


def tapered_column(geo, path, radii, sides, palette, angle=0):
    vertices, colors, faces = [], [], []
    for i, (point, radius) in enumerate(zip(path, radii)):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        x = Vector((0, 1, 0)).cross(tangent).normalized()
        y = tangent.cross(x)
        for j in range(sides):
            a = angle + tau * j / sides + .08 * i
            vertices.append(point + radius * (cos(a) * x + sin(a) * y))
            colors.append(palette[(j + i // 3) % len(palette)])
    for i in range(len(path) - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.extend((tuple(reversed(range(sides))), tuple(range(len(vertices) - sides, len(vertices)))))
    geo.add(vertices, faces, colors, False)


def leaf(geo, base, angle, length, width, rise, twist, color, part, lod):
    forward = Vector((cos(angle), sin(angle), 0))
    lateral = Vector((-sin(angle), cos(angle), 0))
    profile = (.07, .33, .68, .93, 1, .84, .53, .22, .025)

    def surface(t, s):
        span = width * profile_at(profile, t) * s
        lengthwise = length * (t - .11 * abs(s) * sin(pi * t))
        z = rise * t + .023 * sin(pi * t) + twist * span * t - .60 * abs(span)
        return base + forward * lengthwise + lateral * (span + width * t * t * .56) + Vector((0, 0, z))

    def tint(t, s):
        shaded = mix(rgb('567E98'), rgb(color), .42 + .36 * t + .16 * s)
        return mix(shaded, rgb('D4EEE5'), .27 * t + .13 * (1 - abs(s)))

    stations = LOD_STATIONS if lod else (0, .28, .50, .73, .91, 1)
    shell(geo, surface, tint, .006, part, stations, (-1, 0, 1), crease=1)


def foliage(lod):
    geo = Geometry()
    stem_palette = tuple(map(rgb, ('5F8298', '90B8B8', '7BA4AA', '9F9EBE', '637E99', '7BA8B2', 'B1CDCA')))
    segments, sides = (5, 4) if lod else (8, 6)
    path = [stem_point(i / segments) for i in range(segments + 1)]
    # Keep every vertex above the root plane, including the angled first section.
    path[0].z = .0075
    path.insert(0, Vector((path[0].x, path[0].y, 0)))
    radii = [.0085] + [.0093 - .0032 * i / segments for i in range(segments + 1)]
    tapered_column(geo, path, radii, sides, stem_palette)
    for part, t, angle, length, width, rise, twist, color in (
        ('Low swept leaf', .29, -2.83, .154, .030, .060, -.62, 'A9DBDA'),
        ('Rising leaf', .48, -.39, .181, .034, .093, .68, 'AAD2DB'),
        ('Small back leaf', .66, 2.09, .099, .022, .058, -.44, 'B8B1D5'),
    ):
        # Insert leaf heights into the stem sampling so the roots meet the actual shaft.
        step = int(t * segments)
        base = path[step + 1].lerp(path[step + 2], t * segments - step)
        leaf(geo, base, angle, length, width, rise, twist, color, part, lod)
    calyx = [HEAD + Vector((0, 0, z)) for z in (-.023, .011, .025)]
    tapered_column(geo, calyx, (.006, .036, .028), sides, stem_palette, .26)
    return geo


def center_geometry(lod):
    geo = Geometry()
    rng = random.Random(232)
    colors = tuple(map(rgb, ('F5D8A9', 'F7DEB8', 'D8AA79', 'E4BA87', 'FFE7C4', 'EBBF8D')))
    tapered_column(geo, [Vector((0, 0, z)) for z in (-.057, -.012, .001)],
                   (.029, .038, .029), 5 if lod else 7, colors, .12)
    # A single mesh holds the small irregular cuts of champagne crystal.
    count = 6 if lod else 11
    for i in range(count):
        angle = i * 2.39996
        distance = .037 * sqrt((i + .4) / count)
        x, y = distance * cos(angle), distance * sin(angle)
        height = rng.uniform(.006, .015)
        tip = Vector((x, y, .014 - .018 * (distance / .04) ** 2 + height))
        base = Vector((x * .90, y * .90, -.010))
        radius = rng.uniform(.007, .010)
        rotation = rng.uniform(0, tau)
        shoulder = tip - Vector((0, 0, height * .65))
        sides = 4 if lod else 5
        vertices = [base, tip + Vector((radius * .23, 0, 0))]
        vertices.extend(shoulder + Vector((radius * cos(a), radius * sin(a), 0))
                        for a in (rotation + j * tau / sides for j in range(sides)))
        faces = []
        for j in range(sides):
            a, b = j + 2, (j + 1) % sides + 2
            faces.extend(((0, b, a), (1, a, b)))
        geo.add(vertices, faces, [colors[(j + i) % len(colors)] for j in range(len(vertices))], False)
    return geo


def collection(name, parent):
    group = bpy.data.collections.new(name)
    parent.children.link(group)
    return group


def pivot(name, group, location, parent=None):
    obj = bpy.data.objects.new(name, None)
    group.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.empty_display_type = 'PLAIN_AXES'
    obj.empty_display_size = .035
    return obj


def build_asset(scene, materials, lod=False):
    group = collection('SUP | Crystal flower LOD' if lod else 'SUP | Crystal flower asset', scene.collection)
    suffix = ' LOD' if lod else ''
    root = pivot('Crystal Flower' + suffix, group, (0, 0, 0))
    bloom = pivot('Bloom Pivot' + suffix, group, HEAD, root)
    opal, mineral, champagne = materials
    foliage(lod).object('Stem, calyx and foliage' + suffix, group, mineral, root)
    for level, (name, petals, z, radius, cup) in enumerate((
        ('Outer Petal Pivot', OUTER, .003, .024, .034),
        ('Middle Petal Pivot', MIDDLE, .017, .023, .027),
        ('Inner Petal Pivot', INNER, .039, .027, .020),
    )):
        # Each layer mesh has its origin at the base of that ring of petals.
        geo = Geometry()
        omit = ((2,), (3,), ())[level] if lod else ()
        for i, spec in enumerate(petals):
            if i not in omit:
                petal(geo, spec, radius, cup, i, level, lod)
        geo.object(name + suffix, group, opal, bloom, (0, 0, z))
    center_geometry(lod).object('Champagne heart' + suffix, group, champagne, bloom, (0, 0, .101))
    return group, root


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def camera(rig, name, target, offset, frame, top=False):
    data = bpy.data.cameras.new(name)
    data.type, data.ortho_scale = 'ORTHO', frame
    data.clip_start = .015
    obj = bpy.data.objects.new(name, data)
    rig.objects.link(obj)
    obj.location = Vector(target) + Vector(offset)
    if top:
        obj.rotation_euler.z = radians(-14)
    else:
        point_at(obj, target)
    return obj


def lighting(scene, rig, target, scale, context=False):
    world = bpy.data.worlds.new('Island lilac sky' if context else 'Studio ambient')
    scene.world = world
    nodes, links = world.node_tree.nodes, world.node_tree.links
    ambient = nodes.get('Background')
    ambient.inputs['Color'].default_value = (*rgb('D8D7EF'), 1)
    ambient.inputs['Strength'].default_value = .32
    if context:
        backdrop = nodes.new('ShaderNodeBackground')
        backdrop.inputs['Color'].default_value = (*rgb('B8ABCE'), 1)
        path = nodes.new('ShaderNodeLightPath')
        switch = nodes.new('ShaderNodeMixShader')
        links.new(path.outputs['Is Camera Ray'], switch.inputs[0])
        links.new(ambient.outputs[0], switch.inputs[1])
        links.new(backdrop.outputs[0], switch.inputs[2])
        links.new(switch.outputs[0], nodes.get('World Output').inputs['Surface'])

    for name, position, power, width, height, color in (
        ('Ivory softbox', (-.91, -.84, 1.44), 63, 1.05, .44, 'FFF2E7'),
        ('Lilac rim', (.46, .78, .91), 46, .42, .58, 'E7D4FF'),
        ('Aqua edge', (-.66, .48, .43), 24, .22, .71, 'C5F4FF'),
        ('Front bounce', (.72, -.77, .35), 17, .79, .70, 'FFE6DD'),
    ):
        data = bpy.data.lights.new(name, 'AREA')
        data.shape, data.energy = 'RECTANGLE', power * scale ** 2
        data.size, data.size_y, data.color = width * scale, height * scale, rgb(color)
        obj = bpy.data.objects.new(name, data)
        rig.objects.link(obj)
        obj.location = Vector(target) + Vector(position) * scale
        point_at(obj, target)


def render_settings(scene, draft, samples=64):
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 8
    scene.cycles.samples = 12 if draft else samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1080
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 52 if draft else 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Medium High Contrast'


def studio(scene):
    rig = collection('Studio | render only', scene.collection)
    backdrop = material('Studio slate', '474050', .82, 0, 0, painted=False)
    floor = bpy.data.meshes.new('Studio sweep')
    floor.from_pydata([(-100, -100, -.0005), (100, -100, -.0005),
                     (100, 100, -.0005), (-100, 100, -.0005)], [], [(0, 1, 2, 3)])
    floor.materials.append(backdrop)
    obj = bpy.data.objects.new('Studio sweep', floor)
    rig.objects.link(obj)
    obj.hide_set(True)
    lighting(scene, rig, (0, 0, .29), 1)
    return {
        'front': camera(rig, 'Front | elevated', (.022, .007, .308), (.42, -1.45, .79), .755),
        'side': camera(rig, 'Side | profile', (.018, .01, .302), (1.55, .08, .075), .74),
        'top': camera(rig, 'Top | axial', (.030, .010, .22), (0, 0, 1.63), .61, top=True),
    }


def render(scene, view, name):
    scene.camera = view
    scene.render.filepath = str(HERE / 'qa' / f'blender-flower-{name}.png')
    bpy.ops.render.render(write_still=True, scene=scene.name)


def island_stage(name, island):
    scene = bpy.data.scenes.new(name)
    bpy.context.window.scene = scene
    scene.collection.children.link(island)
    rig = collection('Island context | render only', scene.collection)
    bpy.context.view_layer.update()
    surface = next(obj for obj in island.all_objects if obj.name.startswith('Island_Surface |'))
    bvh = BVHTree.FromObject(surface, bpy.context.evaluated_depsgraph_get())
    inverse = surface.matrix_world.inverted()

    def plant_position(x, y):
        point, _, _, _ = bvh.ray_cast(inverse @ Vector((x, y, 4)), inverse.to_3x3() @ Vector((0, 0, -1)))
        if point is None:
            raise RuntimeError(f'Island planting point ({x}, {y}) missed the surface')
        return surface.matrix_world @ point

    return scene, rig, plant_position


def instance_flower(group, rig, name, location, rotation, scale):
    obj = pivot(name, rig, location)
    obj.instance_type, obj.instance_collection = 'COLLECTION', group
    obj.rotation_euler.z = rotation
    obj.scale = (scale,) * 3


def render_island_views(group, draft):
    # Append only the art collection in memory. The original island stays on disk.
    island_file = HERE.parent / 'island' / 'island.blend'
    with bpy.data.libraries.load(str(island_file)) as (_, target):
        target.collections = ['SUP_Floating_Island']
    island = target.collections[0]
    scene, rig, plant_position = island_stage('SUP | Island context', island)
    location = plant_position(1.82, 1.36)
    instance_flower(group, rig, 'Hero flower', location, radians(12), 1)
    target = (2.12, 1.77, location.z + .52)
    lighting(scene, rig, target, 2.2, context=True)
    render_settings(scene, draft)
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1080
    render(scene, camera(rig, 'Island cluster and flower', target, (1.86, -4.3, 1.62), 2.04), 'island-context')

    scene, rig, plant_position = island_stage('SUP | 50-flower validation', island)
    rng = random.Random(52)
    for i in range(50):
        angle, radius = i * 2.39996, .324 * sqrt(i + .45)
        location = plant_position(radius * cos(angle), radius * sin(angle))
        instance_flower(group, rig, f'Flower {i + 1:02}', location, rng.uniform(0, tau), rng.uniform(.78, 1.04))
    target = (0, 0, -.18)
    lighting(scene, rig, target, 5, context=True)
    render_settings(scene, draft, samples=32)
    scene.render.resolution_x = 1500
    scene.render.resolution_y = 1160
    render(scene, camera(rig, 'Garden of 50 full-detail flowers', target, (1.1, -8, 5.3), 8.9), '50-plants')


def export(scene, group, filename):
    bpy.context.window.scene = scene
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group.all_objects:
        obj.select_set(True)
    output = ROOT / 'public' / 'models' / 'flora' / filename
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True, use_active_scene=True,
                              export_yup=True, export_animations=False, export_cameras=False,
                              export_lights=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--draft', action='store_true', help='render reduced-size previews')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = 'SUP | Crystal flower'
    bpy.context.preferences.filepaths.save_version = 0
    materials = (
        material('01 | Petal opal', 'EDCADF', .193, .23, .49, (.18, 360)),
        material('02 | Aqua mineral', '95BABC', .275, .19, .32, (.14, 325)),
        material('03 | Champagne crystal', 'E9C08E', .25, .53, .32),
    )
    group, root = build_asset(scene, materials)
    views = studio(scene)
    scene.camera = views['front']
    render_settings(scene, args.draft)
    lod_scene = bpy.data.scenes.new('SUP | Distant LOD')
    lod, _ = build_asset(lod_scene, materials, lod=True)
    scene.unit_settings.system = lod_scene.unit_settings.system = 'METRIC'
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
                area.spaces.active.overlay.show_overlays = False
                area.spaces.active.shading.color_type = 'VERTEX'

    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'crystal_flower.blend'), compress=True)
    export(lod_scene, lod, 'crystal_flower_lod.glb')
    export(scene, group, 'crystal_flower.glb')
    (HERE / 'qa').mkdir(exist_ok=True)
    for name, view in views.items():
        render(scene, view, name)
    render_island_views(group, args.draft)


if __name__ == '__main__':
    main()
