// Zamiana tablicy bajtów na base64 i z powrotem, bez `Buffer`.
//
// `Buffer` jest globalem Node'a i w przeglądarce nie istnieje - wczytanie zapisu
// kończyło się tam komunikatem "Buffer is not defined". Wynik jest BAJT W BAJT
// taki sam jak z `Buffer.from(u8).toString('base64')`, więc zapisy zrobione
// wcześniej w terminalu wczytują się bez zmian, a odcisk stanu się nie przesuwa.

const CHUNK = 0x8000;   // `fromCharCode` z tysiącami argumentów przepełnia stos

export function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
