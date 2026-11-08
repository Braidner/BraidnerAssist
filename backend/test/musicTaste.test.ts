import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';

test('music playlists are isolated by authenticated identity; re-import and likes are idempotent',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'pultra-taste-')),db=path.join(dir,'taste.db');
  process.env.DATABASE_URL='file:'+db;
  execFileSync('sqlite3',[db],{input:'CREATE TABLE AppUser(id TEXT PRIMARY KEY); INSERT INTO AppUser VALUES ("one"),("two");'+readFileSync(new URL('../prisma/migrations/20261109000100_music_taste/migration.sql',import.meta.url),'utf8')});
  const {musicTasteRouter}=await import('../src/api/musicTaste.js'); const {prisma}=await import('../src/db/client.js');
  const app=express();app.use((req,res,next)=>{res.locals.user={id:req.header('x-test-user')};next();},musicTasteRouter);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const addr=server.address() as {port:number};
  const call=(user:string,route='',method='GET',body?:unknown)=>fetch('http://127.0.0.1:'+addr.port+'/'+route,{method,headers:{'Content-Type':'application/json','x-test-user':user},body:body?JSON.stringify(body):undefined});
  try {
    const lists=[{name:'Мой список',tracks:[{artist:'A',title:'Two'},{artist:'B',title:'One'},{artist:'A',title:'Two'}]}];
    for(let i=0;i<2;i++)assert.deepEqual((await (await call('one','playlists','POST',{playlists:lists})).json()).playlists,lists);
    assert.equal((await call('one','playlists','POST',{playlists:[...lists,...lists]})).status,400);
    const id='e'.repeat(32);for(let i=0;i<2;i++)assert.equal((await call('one','likes/'+id,'PUT')).status,204);
    assert.deepEqual(await (await call('two')).json(),{likes:[],playlists:[]});
    assert.deepEqual(await (await call('one')).json(),{likes:[id],playlists:lists});
    assert.equal((await call('one','likes/'+id,'DELETE')).status,204);
    assert.equal((await call('app-token')).status,403);
  }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});}
});
