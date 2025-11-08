import { getToken } from './auth.js';

const BASE_URL = "http://localhost:3000";
const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer ' + getToken()
});

export async function register(name, password){
  const res = await fetch(BASE_URL + '/api/auth/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, password })
  });
  if(!res.ok) throw new Error((await res.json()).error || 'register failed');
  return res.json();
}

export async function login(name, password){
  const res = await fetch(BASE_URL + '/api/auth/login', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name, password })
  });
  if(!res.ok) throw new Error((await res.json()).error || 'login failed');
  return res.json();
}

export async function me(){
  const res = await fetch(BASE_URL + '/api/users/me', { headers: headers() });
  if(!res.ok) throw new Error('not logged in');
  return res.json();
}

export async function searchUsers(q){
  const res = await fetch(BASE_URL + '/api/users/search?q='+encodeURIComponent(q), {
    headers: headers()
  });
  return res.json();
}

export async function uploadFile(file){
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(BASE_URL + '/api/upload', {
    method:'POST',
    headers:{ 'Authorization': 'Bearer ' + getToken() },
    body: fd
  });
  if(!res.ok) throw new Error('upload failed');
  return res.json();
}

export async function uploadAvatar(file){
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(BASE_URL + '/api/users/avatar', {
    method:'POST',
    headers:{ 'Authorization': 'Bearer ' + getToken() },
    body: fd
  });
  if(!res.ok) throw new Error('avatar upload failed');
  return res.json();
}
