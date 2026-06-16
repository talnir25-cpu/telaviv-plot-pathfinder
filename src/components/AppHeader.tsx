import { Building2, LogOut, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const AppHeader = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };
  return (
    <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
      {/* Background pattern + decorative blobs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(hsl(var(--primary-glow)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-primary-glow/30 blur-3xl" />
      </div>

      <div className="container relative z-10 py-7 md:py-10">
        <div className="flex flex-col items-start gap-6">
          {/* Eyebrow + beta scope */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 shadow-lg backdrop-blur-md">
              <Building2 className="h-6 w-6 text-primary-foreground" strokeWidth={2.25} />
              <Sparkles className="absolute -right-1.5 -top-1.5 h-4 w-4 text-accent drop-shadow-[0_0_6px_hsl(var(--accent))]" strokeWidth={2.5} />
            </div>
            <span className="rounded-full border border-primary-foreground/25 bg-primary-foreground/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary-foreground/90">
              Tel Aviv • Urban Renewal Intelligence
            </span>
            <div className="h-px w-12 bg-primary-foreground/30" />
            <span className="text-sm font-light text-primary-foreground/70">
              גרסת בטא: רובעים 3-4, תל אביב*
            </span>
            <div className="mr-auto flex items-center gap-2">
              {user?.email && (
                <span className="hidden text-xs text-primary-foreground/70 md:inline" dir="ltr">
                  {user.email}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={signOut}
                className="text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="ml-1 h-4 w-4" />
                התנתק
              </Button>
            </div>
          </div>

          {/* Headline */}
          <div className="max-w-3xl">
            <h1 className="mb-5 text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
              מנוע בדיקות היתכנות
              <br />
              <span className="bg-gradient-to-l from-accent to-primary-foreground bg-clip-text text-transparent">
                בהתחדשות עירונית
              </span>
            </h1>
            <p className="max-w-2xl text-base font-light leading-relaxed text-primary-foreground/80 md:text-lg">
              ניתוח מהיר ומבוסס נתונים לחישוב זכויות בנייה, פרופיל פיננסי ומיפוי
              סיכונים/הזדמנויות — מבוסס תקנוני התכניות ומדיניות העירייה.
            </p>
          </div>

          {/* Reference badges */}
          <div className="mt-2 flex flex-wrap gap-3">
            <ReferenceBadge dotClass="bg-accent" label="תא/3616א רובע 3" pulse />
            <ReferenceBadge dotClass="bg-primary-glow" label="תא/3729א רובע 4" />
            <ReferenceBadge
              dotClass="bg-emerald-400"
              label="תא/5000 • מדיניות חניה מהדורה 8"
            />
          </div>
        </div>
      </div>
    </header>
  );
};

const ReferenceBadge = ({
  label,
  dotClass,
  pulse,
}: {
  label: string;
  dotClass: string;
  pulse?: boolean;
}) => (
  <div className="group inline-flex items-center gap-2 rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 px-4 py-2 backdrop-blur-md transition-all hover:border-accent/50 hover:bg-primary-foreground/10">
    <span
      className={`h-2 w-2 rounded-full ${dotClass} ${pulse ? "animate-pulse" : ""}`}
    />
    <span className="whitespace-nowrap text-sm font-medium text-primary-foreground/90">
      {label}
    </span>
  </div>
);
