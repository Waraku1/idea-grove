import type {World} from './domain.ts';
// Localize system-generated labels for display only. Never rewrite user content or history.
export function displayName(name:string):string{
 if(name==='私の思考の庭')return 'My Grove';
 const slot=name.match(/^空き区画 (\d+)$/);if(slot)return `Empty slot ${slot[1]}`;
 const house=name.match(/^新しい家 (\d+)$/);if(house)return `New house ${house[1]}`;
 const furniture=name.match(/^(本棚|展示壁|机|箱) (\d+)$/);if(furniture)return `${({本棚:'Shelf',展示壁:'Wall display',机:'Desk',箱:'Box'} as Record<string,string>)[furniture[1]]} ${furniture[2]}`;
 return name;
}
export function displayWorld(w:World):World{return{...w,name:displayName(w.name),rooms:w.rooms.map(r=>({...r,name:displayName(r.name)})),furniture:w.furniture.map(f=>({...f,name:displayName(f.name)}))};}
const legacyEvents:Record<string,string>={'情報を保存':'Saved a thought','保管状態を変更':'Changed archive status','情報を削除':'Deleted a thought','タグを編集':'Edited a tag','タグを削除':'Deleted a tag','空間を編集':'Edited a space','区画を統合':'Merged slots','家を削除':'Deleted a house','家具を配置':'Placed furniture','家具を削除':'Removed furniture','情報を配置':'Placed a thought','配置を解除':'Removed a placement','世界の名前を変更':'Renamed the grove','バックアップを復元':'Restored a backup'};
export function displayEvent(label:string):string{if(legacyEvents[label])return legacyEvents[label];const multi=label.match(/^(.*?)ほか (\d+) 件の変更$/);return multi?`${legacyEvents[multi[1]]??multi[1]} · ${multi[2]} changes`:label;}
