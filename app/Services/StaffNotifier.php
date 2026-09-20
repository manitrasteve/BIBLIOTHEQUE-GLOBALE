<?php

namespace App\Services;

use App\Models\Document;
use App\Models\Library;
use App\Models\User;
use Throwable;

/**
 * Notifications Administrateur ↔ Bibliothécaires lors d'une action sur un document.
 *
 * Réutilise NotificationService / AppNotification. Règles :
 *  - Bibliothécaire : ajout, modification, archivage  → administrateurs + bibliothécaires de la MÊME bibliothèque.
 *  - Administrateur : modification, archivage, suppression → bibliothécaires de la MÊME bibliothèque.
 *  - L'auteur de l'action ne reçoit jamais sa propre notification ; pas de doublon (un seul envoi par destinataire).
 *  - La publication n'est pas traitée ici : elle est déjà annoncée à tous par la diffusion « document_publie ».
 */
class StaffNotifier
{
    private const EVENTS = [
        'bibliothecaire' => ['ajoute', 'modifie', 'archive'],
        'administrateur' => ['modifie', 'archive', 'supprime'],
    ];

    private const TITLES = [
        'ajoute' => 'Nouveau document ajouté',
        'modifie' => 'Document modifié',
        'archive' => 'Document archivé',
        'supprime' => 'Document supprimé',
    ];

    private const VERBS = ['ajoute' => 'ajouté', 'modifie' => 'modifié', 'archive' => 'archivé', 'supprime' => 'supprimé'];

    private const FIELD_LABELS = [
        'title' => 'titre', 'subtitle' => 'sous-titre', 'abstract' => 'résumé', 'type' => 'type', 'niveau' => 'niveau',
        'category' => 'catégorie', 'library' => 'bibliothèque', 'year' => 'année', 'publisher' => 'éditeur', 'isbn' => 'ISBN',
        'language' => 'langue', 'edition' => 'édition', 'keywords' => 'mots-clés', 'access_level' => "niveau d'accès",
        'authors' => 'auteur(s)', 'fichier' => 'fichier PDF', 'couverture' => 'couverture',
    ];

    /**
     * @param  string  $event  ajoute | modifie | archive | supprime
     * @param  array   $changedFields  champs modifiés (clés du journal d'audit), pour l'événement « modifie »
     * @param  array   $extraLibraryIds  autres bibliothèques concernées (ex. ancienne bibliothèque après un déplacement)
     * @return int  nombre de notifications créées
     */
    public static function documentEvent(User $actor, Document $document, string $event, array $changedFields = [], array $extraLibraryIds = []): int
    {
        $actorRole = $actor->isAdmin() ? 'administrateur' : ($actor->isLibrarian() ? 'bibliothecaire' : null);

        if (!$actorRole || !in_array($event, self::EVENTS[$actorRole], true)) {
            return 0;
        }

        try {
            $libraryIds = collect([$document->library_id, ...$extraLibraryIds])->filter()->unique()->values()->all();

            $recipients = User::query()
                ->where('is_active', true)
                ->whereKeyNot($actor->id)
                ->where(function ($query) use ($actorRole, $libraryIds) {
                    $query->where(fn ($q) => $q->where('role', 'bibliothecaire')->whereIn('library_id', $libraryIds));

                    if ($actorRole === 'bibliothecaire') {
                        $query->orWhereIn('role', ['administrateur', 'admin']);
                    }
                })
                ->get()
                ->unique('id');

            if ($recipients->isEmpty()) {
                return 0;
            }

            $message = self::message($actor, $document, $event, $changedFields, $libraryIds);

            foreach ($recipients as $recipient) {
                NotificationService::send($recipient, "document_{$event}", self::TITLES[$event], $message, $document);
            }

            return $recipients->count();
        } catch (Throwable $e) {
            // Une notification ne doit jamais faire échouer l'action du document.
            report($e);

            return 0;
        }
    }

    private static function message(User $actor, Document $document, string $event, array $changedFields, array $libraryIds): string
    {
        $libraries = Library::whereIn('id', $libraryIds)->pluck('name')->implode(', ');
        $when = now()->setTimezone(config('app.display_timezone', 'Indian/Antananarivo'))->format('d/m/Y à H:i');

        $text = "« {$document->title} » a été " . self::VERBS[$event] . " par {$actor->name}"
            . ($libraries !== '' ? " ({$libraries})" : '')
            . " le {$when}.";

        $fields = collect($changedFields)->map(fn ($field) => self::FIELD_LABELS[$field] ?? $field)->unique()->values();
        if ($event === 'modifie' && $fields->isNotEmpty()) {
            $text .= ' Champs modifiés : ' . $fields->implode(', ') . '.';
        }

        return $text;
    }
}
