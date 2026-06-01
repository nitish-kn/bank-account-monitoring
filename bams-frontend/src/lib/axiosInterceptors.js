import axios from "axios";
import { useAuthStore } from "../store/authStore";

// Global state for token refresh management
let isRefreshing = false;
let failedQueue = [];
let lastRefreshTime = 0;
const TOKEN_REFRESH_INTERVAL = 270 * 60 * 1000; // Refresh every 4.5 hours (token expires in 5 hours)
let refreshPromise = null;

/**
 * Process queued API requests after token refresh completes.
 * Resolves or rejects all promises waiting for a new token.
 */
const processQueue = (error, token = null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Proactively refresh the access token before expiry.
 * Uses stored credentials to get a new JWT token from the backend.
 */
const performTokenRefresh = async () => {
  const expiredToken = useAuthStore.getState().accessToken;
  if (!expiredToken) {
    useAuthStore.getState().logout();
    return null;
  }

  try {
    const response = await axios.post(
      "http://localhost:8000/api/auth/refresh",
      { token: expiredToken },
      { _skipInterceptor: true } // Skip interceptors to avoid infinite loops
    );

    const { access_token, user } = response.data;

    // Safety check: if the user manually logged out while refresh was in-flight, do not log back in
    if (!useAuthStore.getState().accessToken) {
      return null;
    }

    // Save new token and update timestamp
    useAuthStore.getState().login(user, access_token);
    lastRefreshTime = Date.now();
    return access_token;
  } catch (error) {
    console.error("Proactive token refresh failed:", error);
    // Don't logout here - let the 401 interceptor handle it
    return null;
  }
};

/**
 * Request interceptor for proactive token refresh.
 * Checks if token should be refreshed before making API calls.
 */
const requestInterceptor = async (config) => {
  // Skip interceptor if marked
  if (config._skipInterceptor) {
    delete config._skipInterceptor;
    return config;
  }

  const { accessToken, isAuthenticated } = useAuthStore.getState();

  // Only refresh if authenticated and token exists
  if (isAuthenticated && accessToken) {
    const timeSinceLastRefresh = Date.now() - lastRefreshTime;

    // Proactively refresh if 4.5 hours have passed since last refresh
    if (timeSinceLastRefresh >= TOKEN_REFRESH_INTERVAL) {
      try {
        // If refresh is already in progress, wait for it
        if (refreshPromise) {
          await refreshPromise;
        } else {
          // Start refresh and store the promise
          refreshPromise = performTokenRefresh().finally(() => {
            refreshPromise = null;
          });
          await refreshPromise;
        }

        // Use the latest token from store
        const latestToken = useAuthStore.getState().accessToken;
        if (latestToken) {
          config.headers["Authorization"] = `Bearer ${latestToken}`;
        }
      } catch (error) {
        console.error("Token refresh failed:", error);
        // Continue with existing token - 401 handler will catch it
      }
    }
  }

  return config;
};

/**
 * Response interceptor for handling 401 Unauthorized errors.
 * Attempts token refresh and retries failed requests.
 */
const responseInterceptor = async (error) => {
  const originalRequest = error.config;

  // Check if error status is 401 Unauthorized and request hasn't been retried yet
  if (
    error.response &&
    error.response.status === 401 &&
    !originalRequest._retry
  ) {
    // Avoid infinite refresh loops if the refresh endpoint itself returns 401
    if (
      originalRequest.url &&
      originalRequest.url.includes("/api/auth/refresh")
    ) {
      useAuthStore.getState().logout();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // If refresh is already in progress, queue this request
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers["Authorization"] = `Bearer ${token}`;
          return axios(originalRequest);
        })
        .catch((err) => {
          return Promise.reject(err);
        });
    }

    // Mark this request as retried to prevent infinite loops
    originalRequest._retry = true;
    isRefreshing = true;

    // Try to refresh the access token using the refresh endpoint
    const expiredToken = useAuthStore.getState().accessToken;
    if (!expiredToken) {
      useAuthStore.getState().logout();
      isRefreshing = false;
      return Promise.reject(error);
    }

    try {
      const response = await axios.post(
        "http://localhost:8000/api/auth/refresh",
        {
          token: expiredToken,
        },
        { _skipInterceptor: true }
      );

      const { access_token, user } = response.data;

      // Safety check: if the user manually logged out while refresh was in-flight, do not log back in
      if (!useAuthStore.getState().accessToken) {
        isRefreshing = false;
        processQueue(new Error("User logged out during token refresh"), null);
        return Promise.reject(error);
      }

      // Save new token in the store and update cookie and refresh time
      useAuthStore.getState().login(user, access_token);
      lastRefreshTime = Date.now();

      // Resume all queued up calls with the new access token
      processQueue(null, access_token);
      isRefreshing = false;

      // Re-attempt original request with the fresh token
      originalRequest.headers["Authorization"] = `Bearer ${access_token}`;
      return axios(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      isRefreshing = false;
      useAuthStore.getState().logout();
      return Promise.reject(refreshError);
    }
  }

  return Promise.reject(error);
};

/**
 * Setup axios interceptors for authentication and token refresh.
 * Should be called once during app initialization.
 */
export const setupAxiosInterceptors = (axiosInstance = axios) => {
  // Add request interceptor for proactive token refresh
  axiosInstance.interceptors.request.use(
    requestInterceptor,
    (error) => Promise.reject(error)
  );

  // Add response interceptor for 401 error handling
  axiosInstance.interceptors.response.use(
    (response) => response,
    responseInterceptor
  );
};
