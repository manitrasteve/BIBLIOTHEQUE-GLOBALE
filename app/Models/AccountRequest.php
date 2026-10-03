<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountRequest extends Model
{
    use HasFactory;

    /** Durée de validité (en heures) du lien de création du mot de passe envoyé par e-mail. */
    public const SETUP_LINK_HOURS = 72;

    protected $fillable = [
        'uuid',
        'request_number',

        // Informations personnelles
        'last_name',
        'first_name',
        'email',
        'phone',
        'gender',
        'address',
        'date_of_birth',
        'birth_place',
        'cin_number',
        'cin_issued_at',

        // Informations étudiant
        'school',
        'filiere',
        'niveau_type',
        'niveau_detail',
        'student_card_number',

        // Informations enseignant
        'faculty',
        'department',
        'position',
        'teaching_specialty',

        // Informations chercheur
        'research_lab',
        'researcher_field',
        'specialty',
        'profession',
        'diploma',
        'workplace',
        'experience',

        // Compte
        'matricule',
        'role',
        'library_id',

        // Suivi de la demande
        'created_by',
        'status',
        'expires_at',
        'processed_by',
        'created_user_id',
        'processed_at',
        'validation_deadline_at',
        'rejection_reason',

        // Création du mot de passe
        'setup_token_hash',
        'setup_expires_at',
        'setup_reminder_sent_at',
    ];

    // Empreinte du lien de création du mot de passe : jamais renvoyée par l'API.
    protected $hidden = ['setup_token_hash'];

    protected $casts = [
        'date_of_birth' => 'date',
        'cin_issued_at' => 'date',
        'expires_at' => 'datetime',
        'processed_at' => 'datetime',
        'validation_deadline_at' => 'datetime',
        'setup_expires_at' => 'datetime',
        'setup_reminder_sent_at' => 'datetime',
    ];

    /**
     * Génération automatique de l'UUID,
     * de la date d'expiration et du numéro de demande.
     */
    protected static function booted(): void
    {
        // Nouveau délai pour le lien (validation, renvoi, restauration…) : un nouveau rappel pourra être envoyé.
        static::saving(function (AccountRequest $req) {
            if ($req->isDirty('setup_expires_at') && !$req->isDirty('setup_reminder_sent_at')) {
                $req->setup_reminder_sent_at = null;
            }
        });

        static::creating(function (AccountRequest $req) {
            $req->uuid ??= (string) \Illuminate\Support\Str::uuid();

            $req->expires_at ??= now()->addDays(5);

            // Filet de sécurité : même format que les demandes créées par les contrôleurs.
            if (!$req->request_number) {
                $req->request_number = \App\Support\AccountRequestRules::newRequestNumber($req->getAttributes());
            }
        });
    }

    /**
     * Bibliothèque associée à la demande.
     */
    public function library(): BelongsTo
    {
        return $this->belongsTo(Library::class);
    }

    /**
     * Utilisateur du Service Numérique
     * qui a créé/soumis la demande.
     *
     * created_by -> users.id
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_by'
        );
    }

    /**
     * Utilisateur ayant traité la demande.
     *
     * processed_by -> users.id
     *
     * Attention :
     * cette relation peut représenter le Service Numérique
     * lors d'une vérification/rejet, ou l'administrateur
     * lors de la validation finale/rejet.
     */
    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'processed_by'
        );
    }

    /**
     * Compte utilisateur créé à partir de cette demande.
     *
     * created_user_id -> users.id
     */
    /**
     * Compte supprimé définitivement : ses demandes disparaissent aussi du système. Sinon elles
     * resteraient « En attente » avec un bouton « Renvoyer le lien » voué à l'échec. Le numéro de
     * compte reste réservé (registre des membres + séquence) et l'action reste au journal d'audit.
     * À appeler AVANT la suppression (la clé étrangère remet ensuite created_user_id à NULL).
     */
    public static function deleteForDeletedAccounts(array $userIds): void
    {
        if ($userIds) {
            static::query()->whereIn('created_user_id', $userIds)->delete();
        }
    }

    /**
     * Demande dont le compte a été supprimé définitivement avant cette règle : un numéro de compte
     * (attribué uniquement à la création du compte) mais plus de compte associé.
     */
    public function scopeOrphaned($query)
    {
        return $query->whereNotNull('matricule')->whereNull('created_user_id');
    }

    public function createdUser(): BelongsTo
    {
        return $this->belongsTo(
            User::class,
            'created_user_id'
        );
    }

    /**
     * Vérifie si la demande est expirée.
     */
    public function isExpired(): bool
    {
        return $this->status === 'en_attente'
            && now()->greaterThan($this->expires_at);
    }

    // Le matricule (numéro de compte) est généré par User::generateNumeroCompte() :
    // séquence verrouillée qui tient compte des utilisateurs, du registre et des demandes.
    // L'ancien générateur de ce modèle (comptage non verrouillé) produisait des doublons.
}