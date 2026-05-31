import { MapPin, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  gush: number;
  helka: number;
}

/**
 * GovMap iframe centered on a Tel Aviv plot by Gush/Helka.
 * Uses the public govmap.gov.il viewer — no API key required.
 */
export const PlotMap = ({ gush, helka }: Props) => {
  // GovMap public viewer with parcel search query
  const src = `https://www.govmap.gov.il/?q=${gush}/${helka}&z=10&layers=PARCEL_ALL`;
  const externalUrl = `https://www.govmap.gov.il/?q=${gush}/${helka}`;

  return (
    <Card className="overflow-hidden p-0 shadow-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="text-base font-bold">מיקום החלקה</h3>
          <span className="text-xs text-muted-foreground">
            גוש {gush} • חלקה {helka}
          </span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <a href={externalUrl} target="_blank" rel="noopener noreferrer">
            פתח ב-GovMap
            <ExternalLink className="me-1 h-3.5 w-3.5" />
          </a>
        </Button>
      </div>
      <div className="relative h-[420px] w-full bg-muted">
        <iframe
          key={`${gush}-${helka}`}
          title={`מפת חלקה ${gush}/${helka}`}
          src={src}
          className="absolute inset-0 h-full w-full border-0"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </Card>
  );
};
