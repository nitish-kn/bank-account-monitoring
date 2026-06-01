import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import Cookies from "js-cookie";

const getCookieOptions = () => ({
  expires: 7,
  secure: window.location.protocol === "https:",
  sameSite: "strict",
});

export const useAuthStore = create(
  persist(
    (set) => {
      const initialToken = Cookies.get("access_token") || null;
      return {
        user: null,
        accessToken: initialToken,
        isAuthenticated: Boolean(initialToken),

        login: (userData, token) => {
          if (token) {
            Cookies.set("access_token", token, getCookieOptions());
          }
          set({
            user: userData,
            isAuthenticated: Boolean(token),
            accessToken: token,
          });
        },

        setUser: (userData) => set({ user: userData }),

        setToken: (token) => {
          if (token) {
            Cookies.set("access_token", token, getCookieOptions());
          } else {
            Cookies.remove("access_token");
          }
          set({ accessToken: token });
        },

        logout: () => {
          Cookies.remove("access_token");
          set({
            user: null,
            isAuthenticated: false,
            accessToken: null,
          });
        },
      };
    },
    {
      name: "auth-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
