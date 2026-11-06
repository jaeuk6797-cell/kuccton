"""Build the editable SUP fountain and export its Y-up GLB with Blender.

Run with blender --background --factory-startup --python generate_fountain.py
and add -- --render for the studio close-up. build_fountain() is also used
by the canonical island generator.
"""
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
TAU = math.tau


def rgb(hex_color):
    channels = [int(hex_color[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c < .04045 else ((c + .055) / 1.055) ** 2.4 for c in channels)


def material(name, color, roughness, metallic=0, coat=0, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb(color), alpha)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (*rgb(color), 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Coat Weight'].default_value = coat
    shader.inputs['Coat Roughness'].default_value = .22
    shader.inputs['Alpha'].default_value = alpha
    if alpha < 1:
        mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = True
    return mat


class Surface:
    def __init__(self):
        self.points = []
        self.faces = []

    def turn(self, profile, segments, scallop=0):
        """Revolve a bottom-to-top exterior or a center-to-edge disk profile."""
        previous = None
        for radius, height in profile:
            ring = []
            count = segments if radius else 1
            for i in range(count):
                angle = i * TAU / segments
                wave = scallop * math.cos(angle * 8) * max(0, (radius - .33) / .16)
                ring.append(len(self.points))
                self.points.append(((radius + wave) * math.cos(angle), (radius + wave) * math.sin(angle), height))
            if previous:
                for i in range(segments):
                    j = (i + 1) % segments
                    if len(previous) == 1:
                        self.faces.append((previous[0], ring[j], ring[i]))
                    elif len(ring) == 1:
                        self.faces.append((previous[i], previous[j], ring[0]))
                    else:
                        self.faces.append((previous[i], previous[j], ring[j], ring[i]))
            previous = ring

    def stream(self, angle, radius):
        forward = Vector((math.cos(angle), math.sin(angle), 0))
        across = Vector((-forward.y, forward.x, 0))
        start = len(self.points)
        steps, sides = 9, 5
        for i in range(steps):
            t = i / (steps - 1)
            position = forward * (.014 + radius * t)
            position.z = .404 + .21 * t - .384 * t * t
            tangent = (forward * radius + Vector((0, 0, .21 - .768 * t))).normalized()
            normal = across.cross(tangent)
            width = .0075 + .0025 * math.sin(t * math.pi)
            for j in range(sides):
                a = j * TAU / sides
                self.points.append(position + width * (math.cos(a) * normal + math.sin(a) * across))
        for i in range(steps - 1):
            for j in range(sides):
                a, b = start + i * sides + j, start + i * sides + (j + 1) % sides
                self.faces.append((a, b, b + sides, a + sides))

    def object(self, name, collection, mat):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        mesh.materials.append(mat)
        for face in mesh.polygons:
            face.use_smooth = True
        return obj


def build_fountain(collection):
    pearl = material('SUP Fountain porcelain', 'F1E7D5', .34, coat=.16)
    metal = material('SUP Fountain champagne', 'C5A382', .3, metallic=.54)
    water = material('SUP Fountain water', 'A3D8DE', .17, coat=.25, alpha=.87)

    basin = Surface()
    basin.turn([
        (0, 0), (.244, 0), (.285, .008), (.308, .026), (.302, .062),
        (.35, .106), (.443, .175), (.485, .238), (.489, .254), (.471, .273),
        (.428, .268), (.409, .236), (.345, .148), (0, .113),
    ], 32, scallop=.012)
    basin_obj = basin.object('Fountain_Basin', collection, pearl)

    nozzle = Surface()
    nozzle.turn([
        (.119, .113), (.115, .147), (.092, .179), (.059, .192), (.037, .278),
        (.045, .349), (.066, .365), (.053, .391), (.025, .404), (0, .403),
    ], 14)
    # A fine inlaid seam follows the scalloped lip as part of the nozzle draw.
    nozzle.turn([(.481, .263), (.474, .271)], 32, scallop=.012)
    nozzle_obj = nozzle.object('Fountain_Nozzle', collection, metal)

    pool = Surface()
    pool.turn([(.409, .231), (.29, .23), (0, .23)], 32, scallop=.009)
    pool_obj = pool.object('Fountain_Water_Surface', collection, water)

    flow = Surface()
    for i, radius in enumerate((.155, .175, .162)):
        flow.stream(.28 + i * TAU / 3, radius)
    # Two narrow, translucent relief bands read as ripples even in a still frame.
    for radius, width in ((.212, .010), (.303, .007)):
        flow.turn([(radius + width, .232), (radius, .234)], 20)
    flow_obj = flow.object('Fountain_Water_Flow', collection, water)
    return [basin_obj, nozzle_obj, pool_obj, flow_obj]


def studio(scene):
    rig = bpy.data.collections.new('Fountain studio')
    scene.collection.children.link(rig)
    ground = Surface()
    ground.points = [(-200, -200, -.003), (200, -200, -.003), (200, 200, -.003), (-200, 200, -.003)]
    ground.faces = [(0, 1, 2, 3)]
    ground.object('Studio floor', rig, material('Soft sage studio', '738582', .92))
    camera = bpy.data.objects.new('Fountain close-up', bpy.data.cameras.new('Fountain close-up'))
    rig.objects.link(camera)
    camera.location = (1.28, -2.30, 1.83)
    camera.rotation_euler = (Vector((0, 0, .19)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 1.37
    scene.camera = camera
    for name, position, size, energy, color in [
        ('Warm key', (-1.9, -2.1, 3.0), 2.4, 330, (1, .88, .75)),
        ('Cool rim', (1.6, 1.5, 2.6), 2, 245, (.72, .88, 1)),
        ('Soft fill', (1.7, -1.2, 1.4), 2, 80, (.92, .96, 1)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size, data.color = energy, size, color
        light = bpy.data.objects.new(name, data)
        rig.objects.link(light)
        light.location = position
        light.rotation_euler = (-light.location).to_track_quat('-Z', 'Y').to_euler()
    scene.world.color = (.25, .25, .25)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 40
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 900, 800
    scene.render.resolution_percentage = 100


def main():
    # A headless factory-startup scene keeps the export independent of user files.
    scene = bpy.context.scene
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    scene.name = 'SUP Pearl Fountain'
    collection = bpy.data.collections.new('SUP_Fountain')
    scene.collection.children.link(collection)
    objects = build_fountain(collection)
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(filepath=str(ROOT / 'public/models/fountain.glb'), export_format='GLB',
                              use_selection=True, export_yup=True, export_animations=False)
    studio(scene)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == 'VIEW_3D':
                area.spaces.active.region_3d.view_perspective = 'CAMERA'
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'art/fountain/fountain.blend'), compress=True)
    if '--render' in sys.argv:
        scene.render.filepath = str(ROOT / 'art/fountain/blender-closeup.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
