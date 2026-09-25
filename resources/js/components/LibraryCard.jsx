import { MapPin, Clock } from 'lucide-react';

export default function LibraryCard({ library }) {
  return (
    <div className="rounded-xl border border-line bg-paper-dim p-5">
      <p className="font-display text-lg text-ink">{library.name}</p>
      {library.location && (
        <p className="flex items-center gap-1.5 text-sm text-ink-soft mt-1">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
          {library.location}
        </p>
      )}
      {library.opening_hours && (
        <p className="flex items-center gap-1.5 text-xs text-brass mt-3 uppercase tracking-wide">
          <Clock className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.5} />
          {library.opening_days} · {library.opening_hours}
        </p>
      )}
    </div>
  );
}
