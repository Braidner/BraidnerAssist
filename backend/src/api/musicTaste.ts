import express, { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";

const text = z.string().trim().min(1).max(512);
const playlist = z.object({ name: text, tracks: z.array(z.object({artist:text, title:text})).max(10_000) });
const batch = z.object({ playlists: z.array(playlist).min(1).max(800) });
const trackId = /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i;

async function taste(appUserId: string) {
  const [likes, lists] = await Promise.all([
    prisma.musicLike.findMany({ where:{appUserId}, select:{trackId:true} }),
    prisma.musicPlaylist.findMany({ where:{appUserId}, select:{name:true,tracks:true}, orderBy:{name:"asc"} }),
  ]);
  return { likes:likes.map(l=>l.trackId), playlists:lists.map(p=>({name:p.name,tracks:JSON.parse(p.tracks)})) };
}

export const musicTasteRouter = Router();
musicTasteRouter.use((_req, res, next) => {
  res.set("Cache-Control", "private, no-store");
  if (!res.locals.user?.id || res.locals.user.id === "app-token") return res.status(403).json({error:"Требуется личная учётная запись"});
  next();
});
musicTasteRouter.get("/", async (_req, res, next) => {
  try { res.json(await taste(res.locals.user.id)); } catch(e){ next(e); }
});
for (const method of ["put","delete"] as const) {
  musicTasteRouter[method]("/likes/:id", async (req, res, next) => {
    const id=String(req.params.id).toLowerCase().replaceAll("-","");
    if (!trackId.test(String(req.params.id))) return res.status(400).json({error:"Некорректный идентификатор трека"});
    const key={appUserId:String(res.locals.user.id),trackId:id};
    try {
      if (method==="put") await prisma.musicLike.upsert({where:{appUserId_trackId:key},create:key,update:{}});
      else await prisma.musicLike.deleteMany({where:key});
      res.status(204).end();
    } catch(e){next(e);}
  });
}
musicTasteRouter.post("/playlists",express.json({limit:"8mb"}), async(req,res,next)=>{
  const parsed=batch.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Прочитать плейлисты не удалось: проверьте названия, исполнителей и треки."});
  const lists=parsed.data.playlists;
  if(new Set(lists.map(x=>x.name)).size!==lists.length) return res.status(400).json({error:"В файле повторяются названия плейлистов. Переименуйте их перед импортом."});
  const appUserId=String(res.locals.user.id);
  try{
    // Apply the complete import atomically. Re-import replaces only lists of the same name.
    await prisma.$transaction(lists.map(({name,tracks})=>{
      const data=JSON.stringify(tracks);
      return prisma.musicPlaylist.upsert({where:{appUserId_name:{appUserId,name}},create:{appUserId,name,tracks:data},update:{tracks:data}});
    }));
    res.json(await taste(appUserId));
  }catch(e){next(e);}
});
