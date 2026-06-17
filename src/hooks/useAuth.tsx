import { useContext } from "react";
import { AuthContext, type AuthState } from "@/hooks/auth-context";

const fallback: AuthState = {
  session: null,
  user: null,
  ready: false,
};

export const useAuth = (): AuthState => {
  const value = useContext(AuthContext);
  if (!value) {
    console.error(
      "[useAuth] נקרא מחוץ ל-AuthProvider. ודאו שקומפוננטה עטופה ב-AuthProvider."
    );
    return fallback;
  }
  return value;
};

export { AuthProvider } from "@/hooks/AuthProvider";
