import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearCredentials,
  deriveCredentials,
  loadCredentials,
  saveCredentials,
  type Credentials,
} from "@/api/client";
import { ping } from "@/api/subsonic";
import { nameKey } from "@/lib/names";

interface AuthContextValue {
  isAuthenticated: boolean;
  /** True while we're verifying stored credentials on first load. */
  isLoading: boolean;
  username: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * The credentials with the username in lowercase: Navidrome's logins take any
 * case ("Youf" or "youf"), but the app compares names, and the Jam server
 * files everything under the lowercase one.
 */
function withCanonicalName(creds: Credentials): Credentials {
  const username = nameKey(creds.username);
  return username === creds.username ? creds : { ...creds, username };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = loadCredentials();
    if (!stored) {
      setIsLoading(false);
      return;
    }
    ping(stored)
      .then(() => withCanonicalName(stored))
      .then((fixed) => {
        if (fixed !== stored) saveCredentials(fixed);
        setCreds(fixed);
      })
      .catch(() => {
        clearCredentials();
        setCreds(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const derived = deriveCredentials(username, password);
    // Validate before persisting anything - throws SubsonicError on bad login.
    await ping(derived);
    const fixed = withCanonicalName(derived);
    saveCredentials(fixed);
    setCreds(fixed);
  }, []);

  const logout = useCallback(() => {
    clearCredentials();
    setCreds(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: creds !== null,
      isLoading,
      username: creds?.username ?? null,
      login,
      logout,
    }),
    [creds, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
