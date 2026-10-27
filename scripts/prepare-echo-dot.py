"""Convert the user-supplied EchoDot FBX and PBR textures to a browser-ready GLB."""
import bpy, math, sys
from pathlib import Path
from mathutils import Matrix, Vector
source = Path(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else Path.home() / 'Desktop/EchoDot'
root = Path(__file__).resolve().parent.parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=str(source / '3D/Fbx/EchoDot.fbx'))
objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in objects:
    o.animation_data_clear()
    world = o.matrix_world.copy()
    o.parent = None
    o.data.transform(world)
    o.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
points = [o.matrix_world @ Vector(c) for o in objects for c in o.bound_box]
low = Vector(tuple(min(p[i] for p in points) for i in range(3)))
high = Vector(tuple(max(p[i] for p in points) for i in range(3)))
scale = .47 / max(high.x-low.x, high.y-low.y)
origin = Vector(((low.x+high.x)/2, (low.y+high.y)/2, low.z))
textures = source / 'Textures/Textures/Textures 1024x1024'
material = bpy.data.materials.new('Echo Dot fabric, buttons and blue ring')
material.use_nodes = True
nodes, links = material.node_tree.nodes, material.node_tree.links
shader = nodes.get('Principled BSDF')
def texture(name, color=False):
    node = nodes.new('ShaderNodeTexImage')
    node.image = bpy.data.images.load(str(textures / ('EchoDot_'+name+'.jpg')))
    if not color: node.image.colorspace_settings.name = 'Non-Color'
    return node
links.new(texture('Base_Color', True).outputs['Color'], shader.inputs['Base Color'])
links.new(texture('Roughness').outputs['Color'], shader.inputs['Roughness'])
links.new(texture('Metallic').outputs['Color'], shader.inputs['Metallic'])
links.new(texture('Emissive', True).outputs['Color'], shader.inputs['Emission Color'])
shader.inputs['Emission Strength'].default_value = 3
normal = nodes.new('ShaderNodeNormalMap')
links.new(texture('Normal_OpenGL').outputs['Color'], normal.inputs['Color'])
links.new(normal.outputs['Normal'], shader.inputs['Normal'])
for o in objects:
    o.data.transform(Matrix.Scale(scale, 4) @ Matrix.Translation(-origin))
    o.data.materials.clear()
    o.data.materials.append(material)
    o.select_set(True)
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=str(root/'public/models/echo-dot.glb'), export_format='GLB', use_selection=True, export_animations=False, export_cameras=False, export_lights=False)
print('Echo Dot export:', [(o.name, tuple(o.dimensions), len(o.data.polygons)) for o in objects])
# Local render for checking orientation, UVs and the lit ring.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.render.resolution_x = scene.render.resolution_y = 700
scene.render.resolution_percentage = 100
scene.world.color = (.2,.2,.2)
bpy.ops.object.camera_add(location=(.6,-.75,.62))
camera=bpy.context.object
camera.rotation_euler=(Vector((0,0,.10))-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.type='ORTHO'; camera.data.ortho_scale=.72
scene.camera=camera
for location, energy, size in [((0,-1,1.5),80,1),((1,1,.8),45,.7)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light=bpy.context.object; light.data.energy=energy; light.data.shape='DISK'; light.data.size=size
    light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath='/tmp/office-echo-preview.png'
bpy.ops.render.render(write_still=True)
