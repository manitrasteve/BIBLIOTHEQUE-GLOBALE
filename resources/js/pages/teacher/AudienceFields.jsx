import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { api } from "../../lib/api";
import { useDebouncedValue } from "../../lib/search";

// Public d'une bibliographie : une des classes attribuées à l'enseignant, parcours facultatif,
// avec le nombre d'étudiants concernés calculé par le serveur.
export default function AudienceFields({ classes, value, onChange }) {
    const [count, setCount] = useState(null);
    const filiere = useDebouncedValue((value.filiere || "").trim(), 400);
    const classKey = value.school && value.level ? `${value.school}|${value.level}` : "";

    useEffect(() => {
        if (!classKey) return setCount(null);
        let active = true;
        api.previewCourseListAudience({ school: value.school, level: value.level, filiere: filiere || null })
            .then((r) => active && setCount(r.count))
            .catch(() => active && setCount(null));
        return () => { active = false; };
    }, [classKey, filiere]);

    if (!classes.length) {
        return (
            <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-700">
                Aucune classe ne vous est encore attribuée.{" "}
                <Link to="/mes-classes" className="font-semibold underline">Demandez une classe</Link> au Service Numérique
                pour pouvoir adresser une bibliographie à vos étudiants.
            </p>
        );
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
                Classe
                <select
                    required
                    value={classKey}
                    onChange={(e) => {
                        const [school, level] = e.target.value.split("|");
                        onChange({ ...value, school: school || "", level: level || "" });
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal"
                >
                    <option value="">Choisir une classe…</option>
                    {classes.map((c) => (
                        <option key={`${c.school}|${c.level}`} value={`${c.school}|${c.level}`}>{c.school} · {c.level}</option>
                    ))}
                </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">
                Parcours <span className="font-normal text-slate-500">(facultatif)</span>
                <input
                    value={value.filiere || ""}
                    onChange={(e) => onChange({ ...value, filiere: e.target.value })}
                    placeholder="Tous les parcours"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-surface px-3 py-2.5 text-sm font-normal"
                />
            </label>
            {count !== null && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-700 sm:col-span-2" aria-live="polite">
                    <Users className="h-4 w-4" />
                    {count} étudiant{count > 1 ? "s" : ""} concerné{count > 1 ? "s" : ""}
                    {count === 0 && <span className="text-slate-500"> (aucun étudiant inscrit avec ce profil pour le moment)</span>}
                </p>
            )}
        </div>
    );
}
