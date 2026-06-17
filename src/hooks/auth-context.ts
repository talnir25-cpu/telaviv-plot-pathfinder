import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  session: Session | null;
  user: User | null;
  ready: boolean;
};

export const AuthContext = createContext<AuthState | null>(null);
