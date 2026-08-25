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
        user: null,
        permissions: [],
        accessToken: initialToken,
        isAuthenticated: Boolean(initialToken),

        // `session` is the payload every auth endpoint returns:
        // { org, user, permissions, access_token }
        login: (session, token) => {
          if (token) {
            Cookies.set("access_token", token, getCookieOptions());
          }
          set({
            org: session?.org ?? null,
            user: session?.user ?? null,
            permissions: session?.permissions ?? [],
            isAuthenticated: Boolean(token),
            accessToken: token,
          });
        },

        setOrg: (orgData) => set({ org: orgData }),

        // Refreshes identity/permissions without touching the token, so a role
        // change applied by an admin lands on the next /auth/me read.
        setIdentity: ({ org, user, permissions }) =>
          set((state) => ({
            org: org ?? state.org,
            user: user ?? state.user,
            permissions: permissions ?? state.permissions,
          })),

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
            user: null,
            permissions: [],
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
        user: state.user,
        permissions: state.permissions,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
