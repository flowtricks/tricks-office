import bpy, math, os, tempfile, subprocess, numpy as np
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.wm.open_mainfile(filepath='/tmp/character-projection.blend')
obj=bpy.data.objects['CharacterSurface'];me=obj.data;scene=bpy.context.scene
bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
print('UNWRAP_START',flush=True)
atlas=me.uv_layers.new(name='CharacterAtlas');me.uv_layers.active=atlas;atlas.active_render=True
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(70),island_margin=.003,area_weight=.5,correct_aspect=True)
bpy.ops.object.mode_set(mode='OBJECT')
mat=me.materials[0];nodes=mat.node_tree.nodes;links=mat.node_tree.links
bs=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');out=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
colorSocket=bs.inputs['Base Color'].links[0].from_socket
roughSocket=bs.inputs['Roughness'].links[0].from_socket
emission=nodes.new('ShaderNodeEmission');links.new(emission.outputs[0],out.inputs['Surface'])
scene.cycles.samples=1;scene.render.bake.margin=12;scene.render.bake.use_clear=True
textures={}
for label,socket,size,colorspace in [('albedo',colorSocket,4096,'sRGB'),('roughness',roughSocket,2048,'Non-Color')]:
 print('BAKE_'+label.upper(),flush=True)
 image=bpy.data.images.new('character-'+label,width=size,height=size,alpha=False);image.colorspace_settings.name=colorspace
 target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target;target.select=True
 links.new(socket,emission.inputs['Color']);bpy.ops.object.bake(type='EMIT')
 image.filepath_raw=os.path.join(ROOT,'public/models/character-'+label+'.png');image.file_format='PNG';image.save();image.pack();textures[label]=image
print('BAKE_NORMAL',flush=True)
links.new(bs.outputs[0],out.inputs['Surface'])
normalImage=bpy.data.images.new('character-normal',width=4096,height=4096,alpha=False);normalImage.colorspace_settings.name='Non-Color'
target=nodes.new('ShaderNodeTexImage');target.image=normalImage;nodes.active=target
bpy.ops.object.bake(type='NORMAL')
normalImage.filepath_raw=os.path.join(ROOT,'public/models/character-normal.png');normalImage.file_format='PNG';normalImage.save();normalImage.pack();textures['normal']=normalImage
# Use standard glTF PBR nodes for a portable, self-contained model.
nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');links.new(bs.outputs[0],out.inputs['Surface'])
for label,target in [('albedo','Base Color'),('roughness','Roughness')]:
 node=nodes.new('ShaderNodeTexImage');node.image=textures[label];links.new(node.outputs['Color'],bs.inputs[target])
normalTex=nodes.new('ShaderNodeTexImage');normalTex.image=textures['normal'];normalNode=nodes.new('ShaderNodeNormalMap');links.new(normalTex.outputs['Color'],normalNode.inputs['Color']);links.new(normalNode.outputs['Normal'],bs.inputs['Normal'])
# Remove the camera projection and painting attributes after baking.
me.uv_layers.remove(me.uv_layers['ReferenceProjection'])
for attribute in list(me.color_attributes):me.color_attributes.remove(attribute)
print('RIG_START',flush=True)
armData=bpy.data.armatures.new('CharacterSkeleton');rig=bpy.data.objects.new('OfficeCharacter',armData);bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig;rig.select_set(True);obj.select_set(False);bpy.ops.object.mode_set(mode='EDIT')
def bone(name,head,tail,parent=None):
 b=armData.edit_bones.new(name);b.head=head;b.tail=tail
 if parent:b.parent=armData.edit_bones[parent]
 return b
bone('Body',(0,.10,1.30),(0,.10,2.12))
bone('Head',(0,.10,2.21),(0,.10,3.12),'Body')
for sign,side in [(-1,'Left'),(1,'Right')]:
 bone(side+'Arm',(sign*.41,.10,2.08),(sign*.55,.06,1.55),'Body')
 bone(side+'Forearm',(sign*.55,.06,1.55),(sign*.55,-.015,1.04),side+'Arm')
 bone(side+'Hand',(sign*.55,-.015,1.04),(sign*.52,-.10,.88),side+'Forearm')
 bone(side+'Leg',(sign*.205,.12,1.28),(sign*.205,.12,.78),'Body')
 bone(side+'Shin',(sign*.205,.12,.78),(sign*.205,.12,.32),side+'Leg')
 bone(side+'Foot',(sign*.205,.12,.32),(sign*.205,-.25,.12),side+'Shin')
bpy.ops.object.mode_set(mode='OBJECT')
obj.parent=rig
modifier=obj.modifiers.new('Character skin','ARMATURE');modifier.object=rig;modifier.use_deform_preserve_volume=True
names=[b.name for b in armData.bones];groups={name:obj.vertex_groups.new(name=name) for name in names}
def smooth(a,b,v):
 t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
for v in me.vertices:
 x,y,z=v.co;ax=abs(x);side='Left' if x<0 else 'Right';weights={}
 headWeight=smooth(2.18,2.39,z) if (ax<.28 or y<-.1 or z>2.35) else smooth(2.32,2.42,z)
 armWeight=smooth(.37,.49,ax)*(1-smooth(2.08,2.28,z))*smooth(.85,1.12,z)
 legWeight=1-smooth(1.14,1.36,z)
 if z<.7:legWeight=1
 if z<1.36 and ax>.46:legWeight=0
 if z>2.39:headWeight=1;armWeight=0;legWeight=0
 if headWeight>.001:weights['Head']=headWeight
 if armWeight>.001 and headWeight<.99:
  armWeight*=1-headWeight
  fore=1-smooth(1.43,1.68,z);hand=1-smooth(.98,1.12,z)
  weights[side+'Arm']=armWeight*(1-fore)
  weights[side+'Forearm']=armWeight*fore*(1-hand)
  weights[side+'Hand']=armWeight*fore*hand
 if legWeight>.001 and armWeight<.5:
  legWeight*=1-headWeight
  shin=1-smooth(.67,.89,z);foot=1-smooth(.29,.44,z)
  weights[side+'Leg']=legWeight*(1-shin)
  weights[side+'Shin']=legWeight*shin*(1-foot)
  weights[side+'Foot']=legWeight*shin*foot
 total=sum(weights.values());weights['Body']=max(0,1-total);total=sum(weights.values())
 for name,value in weights.items():
  if value>.0001:groups[name].add([v.index],value/total,'REPLACE')
# Keep the editable rig and baked maps; export only the character and skeleton.
rig['reference']='Friendly bearded 3D character cutout.png';rig['source']='Imported Meshy geometry'
scene.render.use_border=False;scene.render.use_crop_to_border=False
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'scripts/imported-character.blend'))
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);obj.select_set(True)
print('EXPORT_START',flush=True)
with tempfile.TemporaryDirectory(prefix='reference-character-') as temp:
 raw=os.path.join(temp,'rigged.glb')
 bpy.ops.export_scene.gltf(filepath=raw,export_format='GLB',use_selection=True,export_yup=True,export_apply=False,export_animations=False,export_skins=True,export_extras=True,export_image_format='AUTO')
 subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.1','meshopt',raw,os.path.join(ROOT,'public/models/reference-character.glb'),'--quantize-position','16','--quantize-normal','12'],check=True)
print('CHARACTER_READY',flush=True)
