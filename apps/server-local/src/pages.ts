export function page(path: string): string {
  const title =
    path === "/admin"
      ? "Dirección"
      : path === "/broadcast"
        ? "Transmisión OBS"
        : "¿Dónde está Kevin?";
  return (
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
    title +
    "</title><h1>" +
    title +
    '</h1><p id="status">Conectando…</p><label>Alias <input id="alias" maxlength="24"></label><button id="join">Unirme</button><button id="start">Iniciar</button><button id="reset">Nueva partida</button><p>Movimiento: flechas o WASD. Vista provisional para la beta.</p><pre id="map"></pre><pre id="details"></pre><script src="/beta-client.js"></script></html>'
  );
}
export const browserClient = `
const role=location.pathname==='/admin'?'director':location.pathname==='/broadcast'?'broadcast':'player';
const token=location.hash.slice(1)||sessionStorage.getItem('kevin.cap.'+role)||'';if(role!=='player'&&token)sessionStorage.setItem('kevin.cap.'+role,token);history.replaceState(null,'',location.pathname);
const ws=new WebSocket('ws://'+location.host+'/ws');
const status=document.getElementById('status'),map=document.getElementById('map'),details=document.getElementById('details');
let sequence=0,matchId=null,messageCounter=0;
function send(type,fields={}){if(ws.readyState===1)ws.send(JSON.stringify({protocolVersion:1,messageId:'client-'+(++messageCounter),type,...fields}));}
document.getElementById('start').hidden=role!=='director';document.getElementById('reset').hidden=role!=='director';
document.getElementById('join').hidden=role!=='player';document.getElementById('alias').parentElement.hidden=role!=='player';
ws.onopen=()=>send('room.access',{role,...(role!=='player'?{token}:{})});
ws.onclose=()=>status.textContent='Desconectado. Recarga para reconectar dentro de 30 segundos.';
ws.onmessage=({data})=>{
 const m=JSON.parse(data);
 if(m.type==='room.accessed'&&role==='player'){const saved=sessionStorage.getItem('kevin.session');if(saved)send('player.reconnect',{token:saved});}
 if(m.type==='player.joined'){sessionStorage.setItem('kevin.session',m.reconnectToken);sequence=m.nextSequence;matchId=m.matchId;}
 if(m.type==='error'){status.textContent=m.code;if(['INVALID_SESSION','UNKNOWN_PLAYER','RECONNECT_EXPIRED'].includes(m.code))sessionStorage.removeItem('kevin.session');}
 if(m.type==='match.status'||m.type==='match.finished'){if(matchId&&matchId!==m.status.matchId){sessionStorage.removeItem('kevin.session');matchId=null;map.textContent='';}status.textContent=m.status.phase+' — '+Math.ceil((m.status.phase==='countdown'?m.status.countdownMs:m.status.remainingMs)/1000)+' s';details.textContent=JSON.stringify(m.status,null,2);}
 if(m.type==='player.view'){const v=m.view,grid=Array.from({length:v.rows},()=>Array(v.columns).fill('?'));for(const c of v.explored)grid[c.row][c.column]=c.terrain==='wall'?'#':'.';for(const c of v.visible)grid[c.row][c.column]=c.terrain==='wall'?'#':' ';if(v.kevin)grid[v.kevin.row][v.kevin.column]='K';grid[v.position.row][v.position.column]='@';map.textContent=grid.map(r=>r.join('')).join('\\n');}
 if(m.type==='broadcast.state'){const s=m.state,grid=s.maze.cells.map(r=>r.map(c=>c==='wall'?'#':' '));grid[s.maze.kevin.row][s.maze.kevin.column]='K';s.positions.forEach((p,i)=>grid[p.position.row][p.position.column]=String(i+1));map.textContent=grid.map(r=>r.join('')).join('\\n');details.textContent=JSON.stringify(s.summary,null,2);}
};
document.getElementById('join').onclick=()=>send('player.join',{displayName:document.getElementById('alias').value});
document.getElementById('start').onclick=()=>send('admin.start');
document.getElementById('reset').onclick=()=>send('room.create');
document.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const d={ArrowUp:'up',w:'up',ArrowDown:'down',s:'down',ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right'}[e.key];if(d&&role==='player'){e.preventDefault();send('player.move',{direction:d,sequence:sequence++});}});
`;
