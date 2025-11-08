export function generateChatNumber(){
  // 10-digit numeric string, ensure not leading 0
  const first = Math.floor(1 + Math.random()*9);
  let rest = '';
  for (let i=0;i<9;i++) rest += Math.floor(Math.random()*10);
  return String(first) + rest;
}
