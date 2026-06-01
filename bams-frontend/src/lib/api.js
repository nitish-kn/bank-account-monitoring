import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { setupAxiosInterceptors } from './axiosInterceptors';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
});

// Setup interceptors on this axios instance so refresh logic works for family page requests
setupAxiosInterceptors(api);

// Request interceptor to attach the Authorization token
api.interceptors.request.use(
  (config) => {
    // Get token directly from Zustand store
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default api;
