import {getOpenAngleSpec} from './sofa-open-angle-variants.js?v=20261118-wood-modules-v65';
import {DEFAULT_TABLE_DESIGN} from './sofa-table-designs.js?v=20261118-wood-modules-v65';
import {SOFA_TABLE_DIMENSIONS,SOFA_TABLE_OUTLINES} from './sofa-table-dimensions.js?v=20261118-wood-modules-v65';
/** Shared profiles govern solids, placement, captions and saved selections. */
export function getTableProfile(type='angled'){
 if(type!=='square'&&type!=='rectangle')return {...getOpenAngleSpec(),type:'angled',design:DEFAULT_TABLE_DESIGN};
 const dimensions=SOFA_TABLE_DIMENSIONS[type];
 return {id:'standard',label:type==='square'?'Kare ahşap modül':'Dikdörtgen ahşap modül',type,design:type==='square'?'square-shelf':'half-shelf',dimensions,outline:SOFA_TABLE_OUTLINES[type],rearWidth:dimensions.width,frontWidth:dimensions.width,frontOffset:0,depth:dimensions.depth,height:dimensions.height,leftAngle:0,rightAngle:0,placementHalfWidth:dimensions.width/2};
}

/** Same physical DWG solid; direction changes its rigid placement only. */
export const normalizeTableDirection=(type,direction)=>type==='angled'&&direction==='back'?'back':'front';
export function getTablePlacement(type='angled',direction='front'){
 const profile=getTableProfile(type),back=normalizeTableDirection(type,direction)==='back',sign=back?-1:1;
 return {...profile,leftAngle:sign*profile.leftAngle,rightAngle:sign*profile.rightAngle,placementRotation:back?Math.PI:0,direction:back?'back':'front'};
}
