import * as T from "three";

export function findOfficeRoute(start: T.Vector3, destinations: T.Vector3[], walkable: (x: number, z: number) => boolean) {
  const step = .12, radius = 65, width = radius * 2 + 1;
  const origin = radius * width + radius;
  const points = new Map<number, T.Vector2>([[origin, new T.Vector2(start.x, start.z)]]);
  const parents = new Map<number, number>();
  const queue = [origin];
  const clear = (a: T.Vector2, b: T.Vector2) => {
    const count = Math.max(1, Math.ceil(a.distanceTo(b) / .035));
    for (let i = 1; i <= count; i++) if (!walkable(T.MathUtils.lerp(a.x,b.x,i/count), T.MathUtils.lerp(a.y,b.y,i/count))) return false;
    return true;
  };
  let end: number | undefined;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const key = queue[cursor], point = points.get(key)!;
    if (destinations.some(goal => Math.hypot(point.x-goal.x,point.y-goal.z)<.15)) { end = key; break; }
    const x = key % width, z = Math.floor(key / width);
    for (const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx=x+dx,nz=z+dz,next=nz*width+nx;
      if(nx<0||nz<0||nx>=width||nz>=width||points.has(next))continue;
      const candidate = new T.Vector2(start.x+(nx-radius)*step,start.z+(nz-radius)*step);
      if(!clear(point,candidate))continue;
      points.set(next,candidate);parents.set(next,key);queue.push(next);
    }
  }
  if(end===undefined)return;
  const route: T.Vector2[]=[];
  for(let key=end;key!==origin;key=parents.get(key)!)route.unshift(points.get(key)!);
  const smooth: T.Vector2[]=[];
  let anchor=points.get(origin)!;
  while(route.length){
    let last=route.length-1;
    while(last>0&&!clear(anchor,route[last]))last--;
    anchor=route[last];smooth.push(anchor);route.splice(0,last+1);
  }
  return smooth;
}
