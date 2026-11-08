import { apiFetch } from "./api";
export interface ImportedTrack { artist:string; title:string }
export interface MusicPlaylist { name:string; tracks:ImportedTrack[] }
export interface MusicTaste { likes:string[]; playlists:MusicPlaylist[] }

async function request(path:string,init:RequestInit={}) {
  const res=await apiFetch('/api/music/taste'+path,{...init,cache:'no-store'});
  if(!res.ok) {
    const body=await res.json().catch(()=>null);
    throw new Error(body?.error || (res.status===413?'Слишком большой импорт: разделите файл на несколько частей.':'Не удалось сохранить или прочитать музыкальную коллекцию.'));
  }
  return res;
}
export async function getMusicTaste():Promise<MusicTaste>{return (await request('')).json();}
export async function setMusicLike(id:string,liked:boolean):Promise<void>{await request('/likes/'+encodeURIComponent(id),{method:liked?'PUT':'DELETE'});}
export async function importMusicPlaylists(playlists:MusicPlaylist[]):Promise<MusicTaste>{
  return (await request('/playlists',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playlists})})).json();
}

const maxText=16*1024*1024;
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const isList=(v:unknown)=>isObj(v)&&Array.isArray(v.tracks);
function track(input:unknown):ImportedTrack {
  if(!isObj(input)) throw new Error('Вместо названия и исполнителя трека получен пустой элемент или ID.');
  const v=isObj(input.track)?input.track:input;
  const artists=Array.isArray(v.artists)?v.artists.map(a=>str(isObj(a)?a.name:a)).filter(Boolean).join(', '):'';
  const artist=str(v.artist)||artists||str(v.artistName), title=str(v.title)||str(v.track)||str(v.trackName);
  if(!artist||!title) throw new Error('В треке отсутствует исполнитель или название. Экспортируйте список с метаданными, а не только ID.');
  return {artist,title};
}
function list(v:unknown, fallback:string):MusicPlaylist {
  if(!isObj(v)||!Array.isArray(v.tracks))throw new Error('Нет массива tracks.');
  const name=str(v.name)||str(v.title)||fallback;
  if(!name||v.tracks.length>10_000)throw new Error('Не указано название плейлиста или в нём больше 10 000 треков.');
  if(typeof v.trackCount==='number'&&v.trackCount!==v.tracks.length)throw new Error('Экспорт содержит неполный трек-лист.');
  return {name,tracks:v.tracks.map(track)};
}
// BOM, quoted delimiters, escaped quotes and CRLF/newlines inside fields.
function csvRows(text:string,sep:string):string[][]{
  const rows:string[][]=[];let row:string[]=[],s='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}
    else if(ch===sep&&!quoted){row.push(s);s='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(s);if(row.some(x=>x.trim()))rows.push(row);row=[];s='';}
    else s+=ch;
  }
  if(quoted)throw new Error('Незакрытая кавычка в CSV.');
  row.push(s);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
function readText(path:string,raw:string):MusicPlaylist[] {
  const name=path.split('/').pop()!.replace(/\.[^.]+$/,''), content=raw.replace(/^\uFEFF/,'').trim();
  if(/\.json$/i.test(path)){
    const obj:unknown=JSON.parse(content), v=isObj(obj)&&'result' in obj?obj.result:obj;
    if(isObj(v)&&Array.isArray(v.playlists))return v.playlists.map(x=>list(x,''));
    if(Array.isArray(v)&&v.length&&v.every(isList))return v.map(x=>list(x,''));
    if(isList(v))return [list(v,name)];
    if(Array.isArray(v)&&v.length&&v.every(x=>isObj(x)&&!('endReason' in x)&&!('playedAt' in x)&&!('timestamp' in x)))return [list({tracks:v},name)];
    return [];
  }
  if(/\.csv$/i.test(path)){
    const h=content.split(/\r?\n/,1)[0];const sep=h.includes(';')?';':h.includes('\t')?'\t':',';
    const [head,...data]=csvRows(content,sep);if(!head)return [];
    const headers=head.map(x=>x.trim().toLowerCase());
    const key=(names:string[])=>headers.findIndex(x=>names.includes(x));
    const a=key(['artist','artists','artist name','artist name(s)','артист','исполнитель']), t=key(['track','track name','title','трек','название трека']), p=key(['playlist','playlist name','плейлист']);
    if(a<0||t<0)return [];
    const groups=new Map<string,ImportedTrack[]>();for(const r of data){const n=(p>=0?r[p]?.trim():'')||name;const row=track({artist:r[a],title:r[t]});const g=groups.get(n)||[];g.push(row);groups.set(n,g);}
    return [...groups].map(([name,tracks])=>({name,tracks}));
  }
  if(/\.txt$/i.test(path)){const lines=content.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
    if(!lines.length||!lines.every(l=>/^.+?\s[—–-]\s.+$/.test(l)))return [];
    return [{name,tracks:lines.map(l=>{const m=l.match(/^(.+?)\s[—–-]\s(.+)$/)!;return track({artist:m[1],title:m[2]});})}];}
  return [];
}
async function archive(file:File):Promise<{name:string;text:string}[]>{
  const {Unzip,UnzipInflate}=await import('fflate');
  let bytes=0,entries=0;const result:{name:string;text:string}[]=[];
  const zip=new Unzip(f=>{
    if(++entries>5000)throw new Error('В ZIP слишком много файлов.');
    if(!/\.(json|csv|txt)$/i.test(f.name)||/(^|\/)(__MACOSX|\.)|history|история|account|passport|readme/i.test(f.name))return;
    if((f.originalSize||0)>maxText-bytes)throw new Error('Архив слишком велик. Выберите распакованные файлы плейлистов.');
    let text='';const decoder=new TextDecoder('utf-8',{fatal:true});
    f.ondata=(err,chunk,final)=>{if(err)throw err;bytes+=chunk.length;if(bytes>maxText)throw new Error('Превышен объём распакованного архива.');text+=decoder.decode(chunk,{stream:!final});if(final)result.push({name:f.name,text});};
    f.start();
  });
  zip.register(UnzipInflate);const input=new Uint8Array(await file.arrayBuffer());
  for(let i=0;i<input.length;i+=8192)zip.push(input.subarray(i,i+8192),i+8192>=input.length);
  return result;
}
export async function readMusicPlaylists(files:File[]):Promise<MusicPlaylist[]>{
  const lists:MusicPlaylist[]=[];
  if(files.reduce((a,f)=>a+f.size,0)>32*1024*1024)throw new Error('Выберите не более 32 МБ файлов за один раз.');
  for(const f of files){
    const zipped=/\.zip$/i.test(f.name);
    let entries:{name:string;text:string}[];
    try{entries=zipped?await archive(f):[{name:f.name,text:await f.text()}];}
    catch{throw new Error('Не удалось распаковать ZIP. Распакуйте архив локально и выберите файлы плейлистов.');}
    for(const {name,text} of entries){
      if(zipped&&/\.(json|txt|csv)$/i.test(name)&&!/playlist|плейлист|нравит|liked/i.test(name)){
        // A personal-data archive may also contain account records; only consider an explicitly wrapped list.
        if(!/\.json$/i.test(name)||!/"(playlists|tracks)"\s*:/.test(text.slice(0,16384)))continue;
      }
      const batch=readText(name,text);
      if(!zipped&&!batch.length)throw new Error('В файле «'+name+'» не найдены плейлисты.');
      lists.push(...batch);
    }
  }
  if(!lists.length)throw new Error('Не найдены списки треков. Выберите JSON, CSV или TXT с исполнителями и названиями.');
  if(lists.length>800||lists.some(l=>l.tracks.length>10_000)||new Blob([JSON.stringify({playlists:lists})]).size>8*1024*1024)throw new Error('Разделите импорт на несколько файлов (до 8 МБ или 800 плейлистов за раз).');
  if(new Set(lists.map(l=>l.name)).size!==lists.length)throw new Error('Некоторые плейлисты имеют одинаковые названия. Разделите или переименуйте их.');
  return lists;
}
