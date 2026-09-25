import { Clock3, CheckCircle2, XCircle, AlertTriangle, FileEdit, Archive, Send } from 'lucide-react';
import { Badge } from './ui/badge';

// Registre central des statuts utilisés dans l'app, avec icône + couleur
// cohérentes, pour que le même statut ait toujours la même signature
// visuelle partout(tickets, documents, comptes).
const REGISTRY = {
  en_attente: { label: 'En attente', icon: Clock3, cls: 'bg-indigo-100 text-brass-deep' },
  traitee: { label: 'Traitée', icon: CheckCircle2, cls: 'bg-blue-100 text-blue-700' },
  expiree: { label: 'Expirée', icon: XCircle, cls: 'bg-slate-100 text-ink-soft' },
  rejetee: { label: 'Rejetée', icon: XCircle, cls: 'bg-red-100 text-red-700' },
  en_cours: { label: 'En cours', icon: Send, cls: 'bg-indigo-100 text-brass-deep' },
  en_retard: { label: 'En retard', icon: AlertTriangle, cls: 'bg-red-100 text-red-700' },
  retourne: { label: 'Retourné', icon: CheckCircle2, cls: 'bg-blue-100 text-blue-700' },
  brouillon: { label: 'Brouillon', icon: FileEdit, cls: 'bg-slate-100 text-ink-soft' },
  publie: { label: 'Publié', icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
  archive: { label: 'Archivé', icon: Archive, cls: 'bg-slate-100 text-ink-soft' },
  actif: { label: 'Actif', icon: CheckCircle2, cls: 'bg-green-100 text-green-700' },
};

export default function StatusBadge({ status, label, icon: IconOverride }) {
  const cfg = REGISTRY[status] || { label: label || status, icon: Clock3, cls: 'bg-slate-100 text-ink-soft' };
  const Icon = IconOverride || cfg.icon;

  return (
    <Badge variant="secondary" className={`gap-1 border-0 ${cfg.cls}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label || cfg.label}
    </Badge>
  );
}
