<?php

namespace App\Services;

use App\Models\Document;
use App\Models\ReadingProgress;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Digest hebdomadaire envoyé aux membres actifs (étudiants, enseignants, chercheurs) :
 * les nouveautés de la semaine + un rappel pour reprendre la lecture en cours.
 * N'envoie rien à un membre qui n'a ni nouveauté à découvrir ni lecture à reprendre.
 */
class WeeklyDigest
{
    private const MEMBER_ROLES = ['etudiant', 'enseignant', 'chercheur'];
    private const MAX_NEW_DOCUMENTS = 6;

    /**
     * Envoi de la semaine en cours, une seule fois : la semaine commence le lundi à 8 h (heure locale),
     * comme la tâche planifiée. Le planificateur et DigestKicker partagent ce verrou, sans double envoi.
     *
     * @return int|null  Nombre d'e-mails envoyés, ou null si trop tôt / déjà envoyé cette semaine.
     */
    public function sendThisWeekOnce(): ?int
    {
        if (! $this->isDue()) {
            return null;
        }

        if (! Cache::add(self::weekKey(), true, now()->addDays(8))) {
            return null;
        }

        return $this->sendAll();
    }

    /** Lundi 8 h passé et digest de la semaine pas encore envoyé (vérification légère, sans verrou). */
    public function isDue(): bool
    {
        $local = now(config('app.display_timezone'));

        return $local->gte($local->copy()->startOfWeek(Carbon::MONDAY)->setTime(8, 0))
            && ! Cache::has(self::weekKey());
    }

    private static function weekKey(): string
    {
        return 'weekly-digest-sent:' . now(config('app.display_timezone'))->format('o-W');
    }

    /**
     * Construit et envoie le digest à tous les membres éligibles.
     *
     * @return int  Nombre d'e-mails envoyés.
     */
    public function sendAll(): int
    {
        // Nouveautés communes à tous : documents publiés durant les 7 derniers jours.
        $since = now()->subWeek();
        $newDocuments = Document::query()
            ->where('status', 'publie')
            ->whereNotNull('published_at')
            ->where('published_at', '>=', $since)
            ->orderByDesc('published_at')
            ->limit(self::MAX_NEW_DOCUMENTS)
            ->get(['id', 'slug', 'title', 'type', 'published_at']);

        $sent = 0;

        User::query()
            ->whereIn('role', self::MEMBER_ROLES)
            ->where('is_active', true)
            ->whereNotNull('email')
            ->chunkById(200, function ($members) use ($newDocuments, &$sent) {
                foreach ($members as $member) {
                    if ($this->sendTo($member, $newDocuments)) {
                        $sent++;
                    }
                }
            });

        return $sent;
    }

    /**
     * Envoie le digest à un membre. Retourne false si rien n'était pertinent (aucun envoi).
     */
    public function sendTo(User $member, $newDocuments): bool
    {
        // Lecture en cours la plus récente (non terminée), sur un document toujours publié.
        $resume = ReadingProgress::query()
            ->where('user_id', $member->id)
            ->whereNull('completed_at')
            ->whereHas('document', fn ($q) => $q->where('status', 'publie'))
            ->with('document:id,slug,title')
            ->orderByDesc('updated_at')
            ->first();

        if ($newDocuments->isEmpty() && !$resume) {
            return false; // rien à dire à ce membre cette semaine
        }

        $base = rtrim((string) config('app.url'), '/');

        $documents = $newDocuments->map(fn (Document $d) => [
            'title' => $d->title,
            'type' => $d->type,
            'url' => "{$base}/documents/{$d->slug}",
        ])->all();

        $resumeData = null;
        if ($resume && $resume->document) {
            $total = (int) $resume->total_pages;
            $page = (int) $resume->last_page;
            $resumeData = [
                'title' => $resume->document->title,
                'page' => $page,
                'total' => $total,
                'percent' => $total > 0 ? min(100, (int) round(($page / $total) * 100)) : null,
                'url' => "{$base}/documents/{$resume->document->slug}",
            ];
        }

        try {
            Mail::send('emails.weekly-digest', [
                'memberName' => $member->name,
                'documents' => $documents,
                'resume' => $resumeData,
                'catalogueUrl' => "{$base}/recherche",
            ], function ($message) use ($member) {
                $message->to($member->email)->subject('Votre semaine de lecture — Bibliothèque Numérique');
            });
        } catch (\Throwable $e) {
            // Un envoi raté ne doit pas interrompre toute la campagne.
            Log::warning('digest.envoi_echoue', ['user_id' => $member->id, 'erreur' => $e->getMessage()]);

            return false;
        }

        return true;
    }
}
