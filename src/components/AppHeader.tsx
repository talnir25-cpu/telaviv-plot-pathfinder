import { Building2, TrendingUp } from "lucide-react";

export const AppHeader = () => {
  return (
    <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
      <div className="absolute inset-0 opacity-20" aria-hidden>
        <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-primary-glow/40 blur-3xl" />
      </div>
      <div className="container relative z-10 py-10 md:py-14">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-foreground/10 backdrop-blur-sm ring-1 ring-primary-foreground/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary-foreground/70">
              Tel Aviv • Urban Renewal Intelligence
            </p>
            <h1 className="text-2xl font-bold leading-tight md:text-3xl">
              דוח היתכנות התחדשות עירונית
            </h1>
          </div>
        </div>
        <p className="mt-4 max-w-2xl whitespace-pre-line text-sm text-primary-foreground/85 md:text-base">
          ניתוח מהיר ומבוסס נתונים לחלקות ברובעים 3 ו-4, תל אביב {"\n"}
          זכויות בנייה, פרופיל פיננסי, מיפוי סיכונים/הזדמנויות מבוסס תקנוני התכניות ומדיניות עירייה
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 ring-1 ring-primary-foreground/20">
            <TrendingUp className="h-3.5 w-3.5" /> תא/3616א רובע 3
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 ring-1 ring-primary-foreground/20">
            <TrendingUp className="h-3.5 w-3.5" /> תא/3729א רובע 4
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 ring-1 ring-primary-foreground/20">
            תא/5000 • מדיניות חניה מהדורה 8
          </span>
        </div>
      </div>
    </header>
  );
};
