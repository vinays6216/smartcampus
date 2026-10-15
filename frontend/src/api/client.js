import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

// Adds "Authorization: Bearer <token>" to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const res = error.response;
    // file downloads use responseType "blob": turn an error blob back into JSON
    if (res && res.data instanceof Blob) {
      try { res.data = JSON.parse(await res.data.text()); } catch { /* ignore */ }
    }
    // expired / invalid token -> back to login
    if (res && res.status === 401 && !String(error.config.url).includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// get('/path', {params}) -> response body  ({ success, data, pagination ... })
export const get = (url, params) => api.get(url, { params }).then((r) => r.data);
export const post = (url, body) => api.post(url, body).then((r) => r.data);
export const put = (url, body) => api.put(url, body).then((r) => r.data);
export const patch = (url, body) => api.patch(url, body).then((r) => r.data);
export const del = (url) => api.delete(url).then((r) => r.data);

export default api;
