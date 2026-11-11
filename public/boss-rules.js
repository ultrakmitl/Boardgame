export const colors = [
  ['yellow','เหลือง','#f4c976','การเมือง'],
  ['blue','ฟ้า','#8cd5e0','วิจัย'],
  ['red','แดง','#f1a29b','สื่อ'],
  ['purple','ม่วง','#c3b1eb','เทคโนโลยี'],
  ['orange','ส้ม','#f7a768','กฎหมาย'],
  ['green','เขียว','#9ac987','การเงิน']
];
const [Y,B,R,P,O,G] = [0,1,2,3,4,5];
export const board = [
  [6,[1,B],[4,P,Y,R,G,O]], [3,[2,R,B]], [5,[4,O,R,P,G,Y]],
  [4,[1,G,P],[2,O,B,Y]], [6,[2,G,P,O],[3,B,Y,R]],
  [4,[1,R,B],[1,G,P],[1,Y]], [3,[2,O,P]], [4,[3,R,O,Y,P]],
  [6,[3,P,G,Y,O],[2,B,R]], [5,[4,G,P,B,O,R,Y]], [4,[3,B,O,R]],
  [5,[2,G,B,R],[2,P,O,Y]], [6,[2,P,G],[3,Y,R,B,O]],
  [4,[2,G,P],[1,B,Y]], [4,[1,Y,B],[1,P,R],[1,O,G]], [3,[2,Y,G]]
].map(([shares,...groups]) => ({shares,groups:groups.map(([count,...teams]) => ({count,teams}))}));
export const track = [[1,1],[1,2],[1,3],[1,4],[1,5],[2,5],[3,5],[4,5],[5,5],[5,4],[5,3],[5,2],[5,1],[4,1],[3,1],[2,1]];
export const dividends = [2,2,2,3,3,3,3,4,4,4,4,4,5,5,5];
export const cardName = ({kind,team}) => ({
  team:'Team สี'+colors[team]?.[1], travel:'Travel สี'+(colors[team]?.[1] ?? 'เทา'),
  recruitment:'Recruitment', boss:'Boss', stop:'Stop'
})[kind];
export const art = (group,file) => '/assets/boss/'+group+'/'+file+'.png';
export const dealArt = (number,side) => art('deals','deal-'+String(number).padStart(2,'0')+'-'+side);
export function cardArt({kind,team}) {
  if (kind === 'team') return art('cards','team-'+colors[team][0]+([B,G].includes(team) ? '' : '-v2'));
  if (kind === 'travel') return art('cards','travel-'+(colors[team]?.[0] ?? 'wild')+'-v2');
  return art('cards',kind+'-v2');
}
