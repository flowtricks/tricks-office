import bpy, math, random, os, tempfile, subprocess
import numpy as np
from mathutils import Vector
from math import sin, cos, pi, sqrt
random.seed(18)
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)

def vec(p): return Vector((p[0],-p[2],p[1]))
def material(name,color,rough=.65,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 return m
skin=material('warm skin',(.46,.235,.11),.64)
cloth=material('chestnut cotton',(.105,.032,.011),.9)
seam=material('cotton seams',(.1,.029,.009),.9)
trouser=material('charcoal twill',(.022,.027,.021),.88)
trouserSeam=material('trouser stitching',(.045,.048,.034),.9)
leather=material('ivory leather',(.72,.68,.55),.66)
sole=material('cream rubber',(.62,.59,.49),.88)
laces=material('woven laces',(.8,.76,.63),.95)
hair=material('chestnut hair',(.019,.007,.002),.8)
hairLight=material('hair highlights',(.027,.011,.003),.78)
beard=material('short beard',(.09,.039,.012),.87)
beardLight=material('beard highlights',(.11,.047,.016),.84)
frames=material('dark tortoise frames',(.018,.018,.01),.24)
frameEdge=material('warm frame edge',(.07,.047,.019),.3)
eye=material('dark brown eyes',(.009,.006,.003),.3)
white=material('eye catchlight',(.85,.82,.72),.2)
lip=material('warm lips',(.24,.09,.035),.75)
nostril=material('nose and ear shading',(.26,.1,.038),.85)
coffee=material('kraft cup',(.31,.18,.055),.9)
lid=material('black lid',(.013,.016,.01),.57)

def grain(mat,kind,scale):
 n=768; rng=np.random.default_rng(5)
 yy,xx=np.mgrid[0:n,0:n]
 if kind=='weave': h=(np.sin(xx*pi)*np.cos(yy*pi/2)+np.sin(yy*pi)*np.cos(xx*pi/2))*.12+rng.normal(0,.04,(n,n))
 else: h=rng.normal(0,.12,(n,n))
 dy,dx=np.gradient(h);a=np.ones((n,n,4),dtype=np.float32);a[:,:,0]=.5-dx*scale;a[:,:,1]=.5-dy*scale;a[:,:,2]=1
 image=bpy.data.images.new(mat.name+' normal',n,n);image.pixels.foreach_set(a.flatten());image.pack();image.colorspace_settings.name='Non-Color'
 nodes=mat.node_tree.nodes;links=mat.node_tree.links
 tex=nodes.new('ShaderNodeTexImage');tex.image=image
 normal=nodes.new('ShaderNodeNormalMap');normal.inputs['Strength'].default_value=.16 if kind=='weave' else .09
 links.new(tex.outputs['Color'],normal.inputs['Color']);links.new(normal.outputs['Normal'],nodes.get('Principled BSDF').inputs['Normal'])
for m in [cloth,trouser,laces]:grain(m,'weave',.3)
for m in [skin,leather]:grain(m,'noise',.2)

def empty(name,position=(0,0,0),parent=None):
 o=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(o);o.location=vec(position)
 if parent:o.parent=parent
 return o

def make_mesh(name,verts,faces,mat,parent=None,uvs=None):
 me=bpy.data.meshes.new(name);me.from_pydata([vec(p) for p in verts],[],faces);me.update();o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o)
 if parent:o.parent=parent
 o.data.materials.append(mat)
 for p in me.polygons:p.use_smooth=True
 if uvs:
  layer=me.uv_layers.new()
  for polygon in me.polygons:
   for li in polygon.loop_indices:layer.data[li].uv=uvs[me.loops[li].vertex_index]
 return o

def ellipsoid(name,p,s,mat,parent=None,segments=48,rings=32):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=vec(p));o=bpy.context.object;o.name=name;o.scale=(s[0],s[2],s[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 if parent:o.parent=parent
 o.data.materials.append(mat)
 for f in o.data.polygons:f.use_smooth=True
 return o

def curve(name,pts,r,mat,parent=None,res=2):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=8;cu.bevel_depth=r;cu.bevel_resolution=res
 sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
 for b,p in zip(sp.bezier_points,pts):b.co=vec(p);b.handle_left_type='AUTO';b.handle_right_type='AUTO'
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);o.data.materials.append(mat)
 if parent:o.parent=parent
 return o

def rings(name,profile,mat,parent=None,segments=64):
 verts=[];uv=[]
 for j,(y,rx,rz,zc) in enumerate(profile):
  for i in range(segments):
   a=i/segments*2*pi;verts.append((sin(a)*rx,y,cos(a)*rz+zc));uv.append((i/segments,j/(len(profile)-1)))
 faces=[]
 for j in range(len(profile)-1):
  for i in range(segments):faces.append((j*segments+i,j*segments+(i+1)%segments,(j+1)*segments+(i+1)%segments,(j+1)*segments+i))
 faces.append(tuple(reversed(range(segments))));faces.append(tuple((len(profile)-1)*segments+i for i in range(segments)))
 o=make_mesh(name,verts,faces,mat,parent,uv)
 return o

def subdiv(o,n=2):
 mod=o.modifiers.new('sculpt smoothing','SUBSURF');mod.levels=n;mod.render_levels=n;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
 return o

def tube(name,points,radii,mat,parent=None,sides=20):
 verts=[];uv=[];faces=[]
 for j,p in enumerate(points):
  tangent=vec(points[min(j+1,len(points)-1)])-vec(points[max(0,j-1)])
  tangent.normalize();ref=Vector((1,0,0)) if abs(tangent.x)<.8 else Vector((0,1,0));u=tangent.cross(ref).normalized();v=tangent.cross(u).normalized()
  for i in range(sides):
   q=vec(p)+(u*cos(i*2*pi/sides)+v*sin(i*2*pi/sides))*radii[j]
   verts.append((q.x,q.z,-q.y));uv.append((i/sides,j/(len(points)-1)))
 for j in range(len(points)-1):
  for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
 faces.append(tuple(reversed(range(sides))));faces.append(tuple((len(points)-1)*sides+i for i in range(sides)))
 return make_mesh(name,verts,faces,mat,parent,uv)

def fuse(name,objects,mat,voxel=.012):
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
 mod=o.modifiers.new('continuous sculpt','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel;mod.use_smooth_shade=True;bpy.ops.object.modifier_apply(modifier=mod.name)
 mod=o.modifiers.new('relax','SMOOTH');mod.factor=.6;mod.iterations=4;bpy.ops.object.modifier_apply(modifier=mod.name)
 o.data.materials.clear();o.data.materials.append(mat)
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(island_margin=.02);bpy.ops.object.mode_set(mode='OBJECT')
 return o

character=empty('OfficeCharacter')
character.scale.x=.86
body=empty('Body',parent=character)
head=empty('Head',(0,2.68,0),body)
head.scale=(.82,.92,.96)
profile=[(-.46,.03,.03,.025),(-.44,.16,.18,.035),(-.40,.29,.30,.025),(-.30,.41,.37,.012),(-.17,.49,.418,0),(0,.535,.445,0),(.2,.53,.44,-.012),(.37,.49,.40,-.02),(.51,.38,.32,-.03),(.59,.18,.16,-.03),(.61,.001,.001,-.03)]
base=subdiv(rings('face sculpt',profile,skin,head,80),2)
noseA=ellipsoid('nose bridge',(0,.005,.432),(.072,.125,.058),skin,head)
noseB=ellipsoid('nose tip',(0,-.055,.489),(.088,.076,.077),skin,head)
noseC=ellipsoid('nose wing L',(-.075,-.1,.467),(.053,.043,.049),skin,head)
noseD=ellipsoid('nose wing R',(.075,-.1,.467),(.053,.043,.049),skin,head)
headMesh=fuse('Sculpted face',[base,noseA,noseB,noseC,noseD],skin,.009)
headMesh.parent=head
for s in [-1,1]:
 ellipsoid('ear', (s*.525,-.005,-.015),(.112,.175,.092),skin,head)
 ellipsoid('ear concha',(s*.579,-.012,.041),(.036,.104,.026),nostril,head)
 curve('ear helix',[(s*.565,-.12,.053),(s*.607,-.04,.063),(s*.595,.09,.043),(s*.551,.12,.035)],.015,skin,head)
 ellipsoid('nostril',(s*.068,-.112,.51),(.022,.012,.009),nostril,head,24,16)
 ellipsoid('eye',(s*.205,.085,.435),(.045,.064,.029),eye,head)
 curve('eyelid',[(s*.25,.07,.437),(s*.24,.136,.432),(s*.198,.152,.438),(s*.162,.124,.443)],.008,skin,head)

for attribute in list(headMesh.data.color_attributes):headMesh.data.color_attributes.remove(attribute)
faceMat=skin.copy();faceMat.name='skin and beard complexion';headMesh.data.materials[0]=faceMat

def strand_batch(name,strands,mat,parent,radius=.0012):
 verts=[];faces=[]
 for points in strands:
  off=len(verts)
  for j,p in enumerate(points):
   r=radius*(1-j/(len(points)-.3))
   tangent=vec(points[min(j+1,len(points)-1)])-vec(points[max(0,j-1)])
   if tangent.length<1e-8:tangent=Vector((0,0,1))
   tangent.normalize();ref=Vector((1,0,0)) if abs(tangent.x)<.8 else Vector((0,1,0));u=tangent.cross(ref).normalized();v=tangent.cross(u).normalized()
   for k in range(3):
    q=vec(p)+(u*cos(k*2*pi/3)+v*sin(k*2*pi/3))*r;verts.append((q.x,q.z,-q.y))
  for j in range(len(points)-1):
   for k in range(3):faces.append((off+j*3+k,off+j*3+(k+1)%3,off+(j+1)*3+(k+1)%3,off+(j+1)*3+k))
 return make_mesh(name,verts,faces,mat,parent)

strands=[[],[]]
for i in range(22000):
 a=random.random()*2*pi;y=-.45+random.random()*.51
 x=sin(a)*(.46 if y<-.3 else .51);z=cos(a)*(.35 if y<-.35 else .415)
 top=-.28+.30*max(0,min(1,(abs(x)-.12)/.36))
 if y>top or z<-.17:continue
 # Ray onto the actual sculpt for roots that follow the jaw.
 direction=Vector((sin(a),-cos(a),0)); origin=Vector((0,0,y))
 hit,loc,normal,face=headMesh.ray_cast(origin,direction)
 if not hit:continue
 p=np.array([loc.x,loc.z,-loc.y]);n=np.array([normal.x,normal.z,-normal.y]);length=.008+random.random()*.011
 drift=np.array([sin(a)*.3,-1,.08]);drift=drift/np.linalg.norm(drift)
 pts=[tuple(p+n*.002),tuple(p+n*.006+drift*length*.5),tuple(p+n*.004+drift*length)]
 strands[i%2].append(pts)
for i,m in enumerate([beard,beardLight]):strand_batch('individual beard fibers',strands[i],m,head,.00065)
# Swept moustache follows the lip, with separate fine hair fibers.
for side in [-1,1]:
 ellipsoid('moustache base',(side*.083,-.182,.443),(.105,.022,.018),beard,head)
 hairs=[]
 for i in range(650):
  t=random.random();x=side*(.008+t*.17);y=-.165-random.random()*.032;z=.447+sqrt(max(0,1-(t-.5)**2))*.018
  hairs.append([(x,y,z),(x+side*.014,y-.009,z+.003),(x+side*.023,y-.016,z)])
 strand_batch('moustache fibers',hairs,beardLight,head,.0008)
 curve('smile crease',[(-.18,-.216,.416),(-.09,-.245,.437),(0,-.252,.444),(.09,-.245,.437),(.18,-.216,.416)],.0035,lip,head)


def scalp(u,t):
 # Full, asymmetric swept crown; short sides taper to the temples.
 front=max(0,cos(u));theta=t*(1.65-.65*cos(u))
 x=sin(theta)*sin(u)*.54
 y=.15+.50*math.copysign(sqrt(abs(cos(theta))),cos(theta))
 z=sin(theta)*cos(u)*.467-.028
 sweep=max(0,1-t*t)*front
 y+=.12*sin(theta)*sweep*(1-.55*sin(u))
 x-=.065*sin(theta)*sweep
 return (x,y,z)
verts=[];uv=[];faces=[]
for j in range(49):
 for i in range(97):verts.append(scalp(i/96*2*pi,j/48));uv.append((i/96,j/48))
for j in range(48):
 for i in range(96):n=j*97+i;faces.append((n,n+1,n+98,n+97))
make_mesh('sculpted hair cap',verts,faces,hair,head,uv)
hairBatches=[[],[]]
for i in range(26000):
 u=random.random()*2*pi;t=random.random()**.5
 length=.14+random.random()*.14
 pts=[]
 for j in range(4):
  f=j/3;uu=u+f*.55;tt=max(0,t-f*length)
  p=np.array(scalp(uu,tt));p[1]+=.002+sin(f*pi)*.003;p[2]+=.001*cos(u);pts.append(tuple(p))
 hairBatches[i%2].append(pts)
for i,m in enumerate([hair,hairLight]):strand_batch('combed hair fibers',hairBatches[i],m,head,.00065)
for s in [-1,1]:
 brow=[]
 for i in range(800):
  x=s*(.08+random.random()*.29);y=.252+.038*sin((abs(x)-.08)/.29*pi)+random.random()*.028;z=.403-(abs(x)-.2)*.07
  brow.append([(x,y,z),(x+s*.009,y+.012,z+.004),(x+s*.018,y+.015,z)])
 strand_batch('eyebrow hairs',brow,hair,head,.0012)
 # Rounded rectangular lenses with softened, subtly tapered lower corners.
 pts=[]
 for i in range(81):
  a=i/80*2*pi;cx=math.copysign(abs(cos(a))**.53,cos(a))*.205;cy=math.copysign(abs(sin(a))**.6,sin(a))*.137
  pts.append((s*.224+cx*(1+.08*cy),.085+cy,.478-.075*abs(cx)))
 curve('acetate eyewear',pts,.016,frames,head,3)
 curve('amber inner eyewear edge',[(p[0],p[1]-.004,p[2]+.012) for p in pts],.0025,frameEdge,head,2)
 curve('temple arms',[(s*.425,.184,.456),(s*.523,.22,.19),(s*.535,.14,-.065)],.016,frames,head,3)
 ellipsoid('hinge pin',(s*.4,.195,.47),(.012,.004,.005),sole,head,16,8)
curve('glasses bridge',[(-.035,.14,.486),(0,.157,.499),(.035,.14,.486)],.017,frames,head,3)

shirtProfile=[(1.02,.29,.2,0),(1.045,.40,.27,0),(1.09,.46,.30,0),(1.28,.48,.325,0),(1.57,.46,.31,0),(1.78,.5,.3,0),(1.86,.51,.29,0),(1.94,.42,.26,0),(2.04,.27,.21,0),(2.08,.21,.175,0)]
shirtProfile=[(1.28+(y-1.02)*.84,rx,rz,zc) for y,rx,rz,zc in shirtProfile]
torsoObj=subdiv(rings('soft cotton torso',shirtProfile,cloth,body,80),2)
neck=ellipsoid('neck',(0,2.22,-.015),(.19,.16,.17),skin,body)
for y in [1.31,1.327]:curve('shirt hem',[(sin(i*2*pi/120)*.432,y,cos(i*2*pi/120)*.288) for i in range(121)],.004,seam,body)
curve('ribbed collar',[(sin(i*2*pi/120)*.224,2.153-.025*max(0,cos(i*2*pi/120)),cos(i*2*pi/120)*.188) for i in range(121)],.013,seam,body)
for side,name in [(-1,'LeftArm'),(1,'RightArm')]:
 arm=empty(name,(side*.43,1.965,0),body)
 
 subdiv(tube('tailored sleeve',[(-side*.10,0,0),(side*.075,-.10,0),(side*.13,-.25,.005),(side*.15,-.34,.005)],[.16,.19,.18,.17],cloth,arm,32),2)
 curve('sleeve seam',[(side*.15+cos(a)*.156,-.316+cos(a)*side*.04,sin(a)*.156) for a in np.linspace(0,2*pi,81)],.003,seam,arm)
 elbow=empty('LeftForearm' if side<0 else 'RightForearm',(side*.15,-.43,0),arm)
 upper=ellipsoid('upper arm',(side*.145,-.36,0),(.125,.15,.125),skin,arm)
 fore=tube('tapered forearm',[(0,.035,0),(side*.012,-.07,.01),(side*.018,-.25,.015),(.12 if side<0 else 0,-.48,.025)],[.12,.128,.108,.082],skin,elbow,32)
 subdiv(fore,2)
 hand=empty('LeftHand' if side<0 else 'RightHand',(.12 if side<0 else 0,-.45,.035),elbow)
 ellipsoid('palm',(0,0,0),(.102,.14,.067),skin,hand)
 if side>0:
  for i in range(4):
   x=-.072+i*.047;length=[.13,.16,.17,.14][i]
   subdiv(tube('finger',[(x,-.055,.015),(x,-.13,.035),(x-.012,-.055-length,.045)],[.031,.028,.018],skin,hand,16),1)
  subdiv(tube('thumb',[(-.09,.025,.012),(-.14,-.02,.045),(-.148,-.1,.053)],[.043,.035,.016],skin,hand,20),1)
 else:
  elbow.rotation_euler.x=-1.58
  hand.rotation_euler.x=1.50
  for i in range(4):
   yy=.15-i*.075
   ellipsoid('curled finger',(0,yy,.205),(.108,.038,.04),skin,hand)
   curve('finger root',[(-.095,yy,.03),(-.115,yy,.12),(-.075,yy,.2)],.036,skin,hand,3)
  curve('gripping thumb',[(-.085,.07,0),(-.12,.015,-.025),(-.12,-.05,.035)],.036,skin,hand,3)
  cup=empty('Cup',(0,.095,.065),hand)
  rings('kraft coffee cup',[(-.16,.092,.092,0),(-.15,.1,.1,0),(.17,.127,.127,0),(.18,.128,.128,0)],coffee,cup)
  rings('lid ridges',[(.177,.14,.14,0),(.195,.142,.142,0),(.202,.13,.13,0),(.224,.125,.125,0),(.229,.105,.105,0),(.23,.001,.001,0)],lid,cup)
  curve('sip opening',[(-.025,.232,.076),(0,.235,.08),(.025,.232,.076)],.009,frames,cup)

ellipsoid('trouser seat',(0,1.28,-.03),(.425,.13,.19),trouser,body)
for side,name in [(-1,'LeftLeg'),(1,'RightLeg')]:
 leg=empty(name,(side*.225,1.28,0),character)
 profile=[(-.70,.125,.15,0),(-.66,.16,.18,0),(-.51,.17,.19,0),(-.34,.178,.207,0),(-.20,.19,.222,0),(-.07,.205,.23,0),(.065,.215,.233,0),(.095,.16,.18,0)]
 subdiv(rings('relaxed trouser leg',profile,trouser,leg,64),2)
 rings('rolled trouser cuff',[(-.70,.151,.18,0),(-.68,.175,.205,0),(-.59,.175,.205,0),(-.57,.16,.19,0)],trouser,leg,64)
 curve('outer trouser seam',[(side*.178,-.65,.01),(side*.185,-.36,0),(side*.205,-.06,0)],.003,trouserSeam,leg)
 ellipsoid('ankle',(0,-.83,0),(.115,.19,.12),skin,leg)
 foot=empty('shoe',(0,-1.23,.065),leg)
 foot.scale=(1.23,1.25,1.16)
 foot.rotation_euler.z=side*.22
 # Horizontal layers define the high-top sneaker's continuous sole and upper.
 subdiv(rings('sneaker sole',[(-.028,.13,.26,.075),(-.012,.194,.34,.085),(.055,.204,.355,.085),(.083,.196,.347,.085)],sole,foot,80),2)
 upperProfile=[(.065,.191,.335,.085),(.105,.191,.33,.085),(.155,.186,.315,.073),(.21,.17,.285,.045),(.26,.142,.21,-.015),(.3,.132,.15,-.045),(.315,.12,.13,-.055)]
 subdiv(rings('leather sneaker upper',upperProfile,leather,foot,80),2)
 for yy in [.018,.04,.071]:curve('sole piping',[(sin(a)*.199,yy,cos(a)*.349+.085) for a in np.linspace(0,2*pi,121)],.003,sole,foot)
 for side2 in [-1,1]:
  curve('side panel stitching',[(side2*.105,.1,.31),(side2*.166,.13,.13),(side2*.132,.22,-.08),(side2*.09,.29,-.15)],.0025,laces,foot)
  curve('heel panel seam',[(side2*.08,.25,-.15),(side2*.12,.15,-.17),(side2*.13,.085,-.17)],.002,laces,foot)
 for i in range(6):
  z=-.005+i*.043;yy=.33-i*.014
  curve('cotton shoelace',[(-.10,yy-.015,z),(0,yy+.004,z+.012),(.1,yy-.015,z+.006)],.009,laces,foot,3)
  for ss in [-1,1]:ellipsoid('lace eyelet',(ss*.105,yy-.015,z),(.014,.005,.014),sole,foot,20,10)
 curve('lace knot',[(-.05,.326,.02),(0,.34,.025),(.05,.326,.02)],.009,laces,foot,2)
 for i in range(6):
  for j in range(4):ellipsoid('toe perforation',(-.08+j*.052,.227-i*.006,.24+i*.019),(.004,.002,.004),sole,foot,12,8)

# Replace overlapping elbow pieces with a flowing anatomical contour.
for side, armName in [(-1,'LeftArm'),(1,'RightArm')]:
 arm=bpy.data.objects[armName]
 for o in list(arm.children_recursive):
  if o.name.startswith('upper arm') or o.name.startswith('tapered forearm'):
   bpy.data.objects.remove(o,do_unlink=True)
 if side>0:
  pts=[(.145,-.27,0),(.155,-.36,0),(.162,-.46,.008),(.158,-.60,.015),(.15,-.77,.025),(.15,-.92,.035)]
  radii=[.134,.14,.133,.12,.095,.087]
 else:
  pts=[(-.145,-.27,0),(-.155,-.37,0),(-.15,-.44,.04),(-.12,-.45,.17),(-.06,-.44,.32),(-.03,-.43,.46)]
  radii=[.134,.14,.14,.125,.103,.087]
 subdiv(tube('continuous arm contour',pts,radii,skin,arm,40),2)

# Weld all skin from shoulder to fingertips in the reference pose.
# The shoulder remains articulated; the bent coffee arm keeps its resting elbow pose.
bpy.context.view_layer.update()
for armName in ['LeftArm','RightArm']:
 arm=bpy.data.objects[armName]
 pieces=[]
 for o in list(arm.children_recursive):
  if o.type not in {'MESH','CURVE'} or not o.data.materials or o.data.materials[0]!=skin:continue
  if o.type=='CURVE':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
  matrix=o.matrix_world.copy();o.parent=None;o.matrix_world=matrix
  pieces.append(o)
 sculpt=fuse('continuous arm and hand',pieces,skin,.0045)
 matrix=sculpt.matrix_world.copy();sculpt.parent=arm;sculpt.matrix_world=matrix

# Consolidate tiny details by material within each articulation node.
for parent in [o for o in bpy.data.objects if o.type=='EMPTY']:
 children=[o for o in parent.children if o.type in {'MESH','CURVE'}]
 bins={}
 for o in children:
  if o.type=='CURVE':
   bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
  key=tuple(m.name for m in o.data.materials);bins.setdefault(key,[]).append(o)
 for group in bins.values():
  if len(group)<2:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in group:o.select_set(True)
  bpy.context.view_layer.objects.active=group[0];bpy.ops.object.join()
# Keep an editable source and export an efficient articulated GLB.
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'scripts/office-character.blend'))
with tempfile.TemporaryDirectory(prefix='office-character-') as temp:
 raw=os.path.join(temp,'character.glb')
 bpy.ops.export_scene.gltf(filepath=raw,export_format='GLB',export_yup=True,export_apply=True,export_normals=True,export_texcoords=True,export_materials='EXPORT',export_image_format='AUTO')
 subprocess.run(['npx','--yes','@gltf-transform/cli@4.5.1','meshopt',raw,os.path.join(ROOT,'public/models/office-character.glb'),'--quantize-position','16','--quantize-normal','12'],check=True)
print('CHARACTER_EXPORTED',os.path.join(ROOT,'public/models/office-character.glb'))
