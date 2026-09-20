(function(){
  const DB_NAME='al-ikhwan-offline-db';
  const DB_VERSION=1;
  const STORES=['members','payments','profits','expenses','assets','notices','dividendVisibility','meta','queue'];
  function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=()=>{const db=r.result;STORES.forEach(s=>{if(!db.objectStoreNames.contains(s)){const st=db.createObjectStore(s,{keyPath:'id'});}});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
  async function all(store){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});}
  async function get(store,id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
  async function put(store,row){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(row);tx.oncomplete=()=>resolve(row);tx.onerror=()=>reject(tx.error);});}
  async function bulkPut(store,rows){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');const st=tx.objectStore(store);rows.forEach(r=>st.put(r));tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function remove(store,id){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function clear(store){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async function replace(store,rows){await clear(store);if(rows.length)await bulkPut(store,rows);}
  window.OfflineDB={open,all,get,put,bulkPut,remove,clear,replace};
})();
