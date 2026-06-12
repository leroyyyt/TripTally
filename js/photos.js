/* ============================================================
   Photo storage — IndexedDB. Keeps image blobs OUT of localStorage
   (and therefore out of JSON/QR exports). The expense only holds a
   photoId; the bytes live here.
   ============================================================ */
const DB_NAME = "triptally";
const STORE = "photos";
let _dbp = null;

function db(){
  if(_dbp) return _dbp;
  _dbp = new Promise((resolve, reject) => {
    if(!("indexedDB" in window)){ reject(new Error("IndexedDB unavailable")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { const d = req.result; if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbp;
}
function store(mode){ return db().then(d => d.transaction(STORE, mode).objectStore(STORE)); }

export async function savePhoto(id, blob){
  const s = await store("readwrite");
  return new Promise((res, rej) => { const r = s.put(blob, id); r.onsuccess = () => res(id); r.onerror = () => rej(r.error); });
}
export async function loadPhoto(id){
  if(!id) return null;
  try{
    const s = await store("readonly");
    return await new Promise((res, rej) => { const r = s.get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); });
  }catch{ return null; }
}
export async function deletePhoto(id){
  if(!id) return;
  try{
    const s = await store("readwrite");
    await new Promise((res) => { const r = s.delete(id); r.onsuccess = () => res(); r.onerror = () => res(); });
  }catch{ /* ignore */ }
}

// Delete any stored photos whose ids are no longer referenced by an expense
// (e.g. left over from a deleted expense). Runs quietly on boot.
export async function purgeOrphans(referencedIds){
  try{
    const s = await store("readwrite");
    const keys = await new Promise((res, rej) => { const r = s.getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); });
    const keep = new Set(referencedIds || []);
    for(const k of keys) if(!keep.has(k)) s.delete(k);
  }catch{ /* ignore */ }
}

// Downscale a File/Blob to a JPEG no larger than `maxDim` on its long edge.
export async function downscaleImage(file, maxDim = 1280, quality = 0.7){
  let width, height, source, bitmap = null;
  try{ bitmap = await createImageBitmap(file); }catch{ bitmap = null; }
  if(bitmap){ width = bitmap.width; height = bitmap.height; source = bitmap; }
  else {
    const url = URL.createObjectURL(file);
    try{
      source = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      width = source.naturalWidth; height = source.naturalHeight;
    } finally { URL.revokeObjectURL(url); }
  }
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(source, 0, 0, w, h);
  if(bitmap && bitmap.close) bitmap.close();
  return new Promise((res) => canvas.toBlob(b => res(b), "image/jpeg", quality));
}
