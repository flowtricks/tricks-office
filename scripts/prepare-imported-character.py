import bpy, math, os, sys, numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PREVIEW='--preview' in sys.argv
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT,'scripts/assets/character-source.glb'))
obj=next(o for o in bpy.context.scene.objects if o.type=='MESH')
bpy.context.view_layer.objects.active=obj;obj.select_set(True)
matrix=obj.matrix_world.copy();obj.parent=None;obj.matrix_world=matrix
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
lo=min(v.co.z for v in obj.data.vertices);hi=max(v.co.z for v in obj.data.vertices);scale=3.3/(hi-lo)
for v in obj.data.vertices:v.co=Vector((v.co.x*scale,v.co.y*scale,(v.co.z-lo)*scale))
obj.name='CharacterSurface';obj.data.update()
for o in list(bpy.context.scene.objects):
 if o!=obj:bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene
scene.render.resolution_x=1024;scene.render.resolution_y=1536;scene.render.resolution_percentage=50
# Match the reference camera before projecting its color onto the actual surface.
target=Vector((-.025,0,1.63));yaw=.10;pitch=.18
bpy.ops.object.camera_add(location=target+Vector((math.sin(yaw)*8,-math.cos(yaw)*8,math.sin(pitch)*8)))
cam=bpy.context.object;cam.name='ReferenceProjection';cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=3.46;scene.camera=cam
bpy.context.view_layer.update()
me=obj.data;n=len(me.vertices)
coords=np.empty(n*3,dtype=np.float32);me.vertices.foreach_get('co',coords);coords=coords.reshape(-1,3)
normals=np.empty(n*3,dtype=np.float32);me.vertices.foreach_get('normal',normals);normals=normals.reshape(-1,3)
view=np.array(cam.matrix_world.inverted());local=np.column_stack((coords,np.ones(n)))@view.T
uv=np.column_stack((local[:,0]/(3.46*2/3)+.5,local[:,1]/3.46+.5))
rows=(1-uv[:,1])*768
source_rows=np.interp(rows,[0,17,65,110,147,177,208,259,280,370,468,495,620,648,681,755,768],[0,18,56,108,143,174,201,254,275,365,465,490,610,638,665,763,768])
uv[:,1]=1-source_rows/768
headBlend=np.clip((coords[:,2]-2.15)/.2,0,1)
uv[:,0]-=headBlend*.015
loops=np.empty(len(me.loops),dtype=np.int32);me.loops.foreach_get('vertex_index',loops)
projection=me.uv_layers.new(name='ReferenceProjection');projection.data.foreach_set('uv',uv[loops].astype(np.float32).ravel())
# Side and back colors follow the same clothing and facial regions.
x,y,z=coords.T; ax=np.abs(x)
skin=np.array([.63,.29,.10]);shirt=np.array([.095,.029,.010]);pants=np.array([.022,.023,.021]);shoes=np.array([.62,.57,.47]);hair=np.array([.048,.021,.008]);beard=np.array([.105,.047,.017])
base=np.tile(skin,(n,1));rough=np.full(n,.68);region=np.zeros(n,dtype=np.int32)
isShoe=z<.37
isPants=(z>=.43)&(z<1.31)&(ax<.48)
torsoWidth=np.interp(z,[1.25,1.5,1.8,2.0,2.2],[.35,.37,.40,.44,.23])
neckline=2.20+.13*np.clip((y+.1)/.35,0,1)
isShirt=(z>1.28)&(z<2.33)&((ax<torsoWidth)|((z>(1.69+.45*(ax-.4)))&(z<2.25)&(ax<.68)))&~((ax<.19)&(z>neckline))
base[isShoe]=shoes;rough[isShoe]=.7;region[isShoe]=4
base[isPants]=pants;rough[isPants]=.88;region[isPants]=3
base[isShirt]=shirt;rough[isShirt]=.87;region[isShirt]=2
head=(z>2.35)|((z>2.17)&(y<-.14))
# Hairline drops at the temples and nape; the beard follows the jaw.
hairline=3.04-.24*np.clip((ax-.20)/.22,0,1)-.30*np.clip((y+.06)/.32,0,1)
isHair=head&(z>hairline)
beardline=2.47+.28*np.clip((ax-.14)/.26,0,1)
isBeard=head&(z<beardline)&(y<.11)&~isHair
base[isHair]=hair;rough[isHair]=.85;region[isHair]=5
base[isBeard]=beard;rough[isBeard]=.86;region[isBeard]=6
# Projection is strongest on camera-facing surfaces and fades to the back fill.
direction=np.array((cam.location-target).normalized())
facing=normals@direction
strength=np.clip((facing-.06)/.60,0,1);strength=strength*strength*(3-2*strength)
strength[y>.18]=0
# Preserve genuine dark eyes and eyewear, but reject background pixels outside the silhouette.
photo=bpy.data.images.load(os.path.join(ROOT,'public/reference/character-cutout.png'));photo.pack()
pixels=np.array(photo.pixels[:],dtype=np.float32).reshape(photo.size[1],photo.size[0],4)
sample=pixels[np.clip((uv[:,1]*photo.size[1]).astype(int),0,photo.size[1]-1),np.clip((uv[:,0]*photo.size[0]).astype(int),0,photo.size[0]-1),:3]
print('REFERENCE_SAMPLE',pixels[int(.75*photo.size[1]),int(.45*photo.size[0]),:3],flush=True)
strength[(sample.max(axis=1)<.09)&~head&~isPants]=0
strength[(region==0)&~head&((sample[:,0]<.35)|(sample[:,1]/np.maximum(sample[:,0],.001)<.32))]=0
# Seed separate eyeballs and shoes from their actual connected geometry.
parent=list(range(n))
def find(a):
 while parent[a]!=a:parent[a]=parent[parent[a]];a=parent[a]
 return a
for e in me.edges:
 a,b=map(find,e.vertices)
 if a!=b:parent[a]=b
parts={}
for i in range(n):parts.setdefault(find(i),[]).append(i)
isEye=np.zeros(n,dtype=bool)
for ids in parts.values():
 if len(ids)<500:continue
 p=coords[ids];low=p.min(0);high=p.max(0)
 if high[2]<.5 and low[2]<.05:
  isShoe[ids]=True;base[ids]=shoes;rough[ids]=.72;region[ids]=4
 if low[2]>2.65 and high[2]<2.84 and high[0]-low[0]<.12:
  isEye[ids]=True
# Reference pixels add detail within materials, never background across a boundary.
strength[isShoe|isPants|isShirt]=0
strength[head&~isHair&~isBeard]=0
strength[(region==0)&~head]=0
brows=head&(z>2.87)&(z<2.96)&(ax>.055)&(ax<.29)&(y<-.19)
strength[brows]=np.clip((facing[brows]-.05)/.4,0,1)
# Use the sculpt's own feature boundaries for the final material masks.
# Reference luminance supplies local hair detail without projecting portrait shadows onto skin.
def smooth(a,b,value):
 t=np.clip((value-a)/(b-a),0,1);return t*t*(3-2*t)
base[head]=skin;strength[head]=0;rough[head]=.68;region[head]=0
hairline=3.10-.30*smooth(.28,.41,ax)-.30*smooth(-.05,.35,y)
hairWeight=smooth(hairline-.008,hairline+.008,z)*head
hairDetail=np.clip(sample[:,0]/.3,.78,1.25)
hairColor=hair[None,:]*hairDetail[:,None]
base=base*(1-hairWeight[:,None])+hairColor*hairWeight[:,None]
rough=np.where(hairWeight>.5,.88,rough);region[hairWeight>.5]=5
beardline=2.50+.38*smooth(.12,.38,ax)
beardWeight=(1-smooth(beardline-.012,beardline+.012,z))*head*(1-smooth(.08,.20,y))*(1-hairWeight)
mouthOpening=((x+.005)/.14)**2+((z-2.475)/.046)**2
beardWeight*=smooth(.85,1.2,mouthOpening)
beardDetail=np.clip(sample[:,0]/.4,.8,1.2)
base=base*(1-beardWeight[:,None])+(beard[None,:]*beardDetail[:,None])*beardWeight[:,None]
rough=np.where(beardWeight>.5,.88,rough);region[beardWeight>.5]=6
mustache=((x+.005)/.20)**2+((z-2.535)/.037)**2
mustacheWeight=(1-smooth(.75,1.15,mustache))*(y<-.29)
base=base*(1-mustacheWeight[:,None])+(beard[None,:]*beardDetail[:,None])*mustacheWeight[:,None]
browCenter=np.where(x<0,-.175,.15)
browDistance=((x-browCenter)/.092)**2+((z-2.871)/.024)**2
browWeight=(1-smooth(.8,1.1,browDistance))*(y<-.19)
base=base*(1-browWeight[:,None])+hair[None,:]*browWeight[:,None]
# Outline the sculpted frame in a calibrated frontal projection, then restrict
# the paint to its raised depth so the nose and recessed lenses remain skin.
px=x/1.1*1024+512;py=512-(z-2.75)/1.1*1024
def inside(points):
 result=np.zeros(n,dtype=bool)
 for i,(a,b) in enumerate(points):
  c,d=points[i-1]
  crossing=((b>py)!=(d>py))&(px<(c-a)*(py-b)/(d-b+1e-10)+a)
  result^=crossing
 return result
leftOuter=[(180,453),(209,434),(280,426),(359,428),(415,439),(456,455),(475,476),(465,539),(441,589),(415,611),(360,625),(284,623),(241,609),(220,582),(211,542),(203,504),(198,474),(180,476)]
leftInner=[(241,465),(284,449),(359,449),(405,460),(434,476),(437,521),(420,571),(402,590),(350,598),(284,596),(252,582),(240,541),(235,503)]
rightOuter=[(535,476),(551,449),(598,433),(674,427),(744,432),(802,447),(822,455),(819,480),(803,488),(798,541),(789,584),(769,611),(724,624),(656,623),(591,614),(562,591),(547,547)]
rightInner=[(565,479),(589,461),(641,450),(709,449),(756,459),(774,477),(774,518),(764,563),(748,588),(711,597),(645,598),(604,590),(583,568),(572,530)]
bridgeMask=inside([(453,455),(478,450),(514,448),(540,453),(559,461),(551,490),(535,490),(528,482),(493,482),(481,491),(469,509)])
frontFrame=((inside(leftOuter)&~inside(leftInner))|(inside(rightOuter)&~inside(rightInner))|bridgeMask)&(y<-.265)&(y>-.395)
temples=(ax>.32)&(ax<.44)&(z>2.795)&(z<2.845)&(y<.15)
isFrame=frontFrame|temples
base[isFrame]=(.009,.008,.006);rough[isFrame]=.24;strength[isFrame]=0;region[isFrame]=7
base[isEye]=(.008,.005,.003);rough[isEye]=.2;strength[isEye]=0;region[isEye]=8
lipDistance=((x+.005)/.15)**2+((z-2.46)/.026)**2
lipWeight=(1-smooth(.7,1.1,lipDistance))*(y<-.30)*.25
base=base*(1-lipWeight[:,None])+np.array([.5,.19,.07])[None,:]*lipWeight[:,None]
ears=(ax>.365)&(y>-.05)&(z>2.48)&(z<2.83)
base[ears]=skin;rough[ears]=.68;strength[ears]=0;region[ears]=0
fiber=np.maximum.reduce([hairWeight,beardWeight,mustacheWeight,browWeight]);fiber[ears|isFrame|isEye]=0
np.savez('/tmp/character-paint-data.npz',coords=coords,region=region,rough=rough,uv=uv)
for name,values in [('BackFill',np.column_stack((base,np.ones(n)))),('ProjectionBlend',np.column_stack((strength,strength,strength,np.ones(n)))),('SurfaceRoughness',np.column_stack((rough,rough,rough,np.ones(n)))),('FiberDetail',np.column_stack((fiber,fiber,fiber,np.ones(n))))]:
 attr=me.color_attributes.new(name=name,type='FLOAT_COLOR',domain='POINT');attr.data.foreach_set('color',values.astype(np.float32).ravel())
# Material remains physically shaded. The photo contributes pigmentation and fine detail.
mat=bpy.data.materials.new('Reference character');mat.use_nodes=True;nodes=mat.node_tree.nodes;links=mat.node_tree.links;nodes.clear()
out=nodes.new('ShaderNodeOutputMaterial');bs=nodes.new('ShaderNodeBsdfPrincipled');bs.inputs['Roughness'].default_value=.75;links.new(bs.outputs['BSDF'],out.inputs['Surface'])
tex=nodes.new('ShaderNodeTexImage');tex.image=photo;tex.interpolation='Linear';tex.extension='EXTEND'
uvNode=nodes.new('ShaderNodeUVMap');uvNode.uv_map='ReferenceProjection';links.new(uvNode.outputs['UV'],tex.inputs['Vector'])
scaleNode=nodes.new('ShaderNodeMixRGB');scaleNode.blend_type='MULTIPLY';scaleNode.inputs[0].default_value=1;scaleNode.inputs[2].default_value=(.62,.62,.62,1);links.new(tex.outputs['Color'],scaleNode.inputs[1])
fallback=nodes.new('ShaderNodeVertexColor');fallback.layer_name='BackFill'
blend=nodes.new('ShaderNodeVertexColor');blend.layer_name='ProjectionBlend'
mix=nodes.new('ShaderNodeMixRGB');links.new(blend.outputs['Color'],mix.inputs[0]);links.new(fallback.outputs['Color'],mix.inputs[1]);links.new(scaleNode.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],bs.inputs['Base Color'])
roughNode=nodes.new('ShaderNodeVertexColor');roughNode.layer_name='SurfaceRoughness';links.new(roughNode.outputs['Color'],bs.inputs['Roughness'])
detail=nodes.new('ShaderNodeVertexColor');detail.layer_name='FiberDetail'
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=450;noise.inputs['Detail'].default_value=2
heightMix=nodes.new('ShaderNodeMixRGB');links.new(detail.outputs['Color'],heightMix.inputs[0]);links.new(noise.outputs['Fac'],heightMix.inputs[1]);links.new(tex.outputs['Color'],heightMix.inputs[2])
bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.22;bump.inputs['Distance'].default_value=.004;links.new(heightMix.outputs[0],bump.inputs['Height']);links.new(bump.outputs['Normal'],bs.inputs['Normal'])
me.materials.clear();me.materials.append(mat)
for p in me.polygons:p.use_smooth=True
# Neutral studio rendering for texture alignment checks.
scene.world=bpy.data.worlds.new('World');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.15,.15,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for pos,power,size in [((-3,-4,5),550,4),((3,-2,4),150,3)]:
 bpy.ops.object.light_add(type='AREA',location=pos);o=bpy.context.object;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,0,1.7))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.film_transparent=True
scene.render.filepath='/tmp/character-texture-preview.png'
bpy.ops.wm.save_as_mainfile(filepath='/tmp/character-projection.blend')
bpy.ops.render.render(write_still=True)
