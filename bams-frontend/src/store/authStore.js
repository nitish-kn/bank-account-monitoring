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
        org: null,
        accessToken: initialToken,
        isAuthenticated: Boolean(initialToken),

        login: (orgData, token) => {
          if (token) {
            Cookies.set("access_token", token, getCookieOptions());
          }
          set({
            org: orgData,
            isAuthenticated: Boolean(token),
            accessToken: token,
          });
        },

        setOrg: (orgData) => set({ org: orgData }),

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
            org: null,
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
        org: state.org,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
