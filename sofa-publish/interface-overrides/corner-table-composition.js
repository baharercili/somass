import {getTableProfile} from './sofa-table-profiles.js?v=20261124-reverse-v132';

const STANDARD_DEPTH=1.07;
const rotate=(x,z,a)=>({x:Math.cos(a)*x+Math.sin(a)*z,z:-Math.sin(a)*x+Math.cos(a)*z});
const world=(origin,x,z,a)=>{const p=rotate(x,z,a);return{x:origin.x+p.x,z:origin.z+p.z};};

/** A square connector replaces a concave upholstered turn, never an inline seat. */
export function sanitizeCornerTables(modules,value){
 if(!Array.isArray(value))return [];
 const eligible=new Set(modules.filter((node,index)=>index>0&&index<modules.length-1&&(
  node.type==='corner-right'&&node.reversed!==true||node.type==='corner-left'&&node.reversed===true
 )).map(node=>node.id)),used=new Set(),result=[];
 for(const entry of value){
  if(!entry||entry.type!=='square'||!eligible.has(entry.moduleId)||used.has(entry.moduleId))continue;
  used.add(entry.moduleId);result.push({moduleId:entry.moduleId,type:'square'});
 }
 return result;
}

/** The two inward table edges align with the fronts of both adjoining seats.
 * A 95 cm square is shallower than the 107 cm seat: its rear edges are 12 cm
 * inward of the seat backs. Keeping the front edges fixed avoids a recessed
 * table, an overlapping return, or resizing the approved timber module.
 */
export function createCornerTablePart(node,entry,theta,{beforeDepth=STANDARD_DEPTH,afterDepth=STANDARD_DEPTH}={}){
 const profile=getTableProfile('square'),d=profile.dimensions;
 const front=beforeDepth-STANDARD_DEPTH/2;
 const centre=world(entry,d.width/2,front-d.depth/2,theta);
 const exit=world(entry,afterDepth-STANDARD_DEPTH/2,front,theta);
 return{type:'table_square',kind:'table',moduleId:node.id,logicalType:node.type,
  tableId:'corner-wood-'+node.id,tablePosition:'corner:'+node.id,tableDesign:profile.design,tableVariant:'standard',
  width:d.width,depth:d.depth,height:d.height,seatHeight:0,approximate:false,outline:profile.outline.map(point=>[...point]),
  x:centre.x,z:centre.z,rotation:theta,role:'corner',cornerConnector:true,
  entry:{...entry},exit,entryTheta:theta,exitTheta:theta-Math.PI/2};
}
