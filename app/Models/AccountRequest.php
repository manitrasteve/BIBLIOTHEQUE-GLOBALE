<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountRequest extends Model
{
    use HasFactory;

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
    ];

    /**
     * Génération automatique de l'UUID,
     * de la date d'expiration et du numéro de demande.
     */
    protected static function booted(): void
    {
        static::creating(function (AccountRequest $req) {
            $req->uuid ??= (string) \Illuminate\Support\Str::uuid();

            $req->expires_at ??= now()->addDays(5);

            if (!$req->request_number) {
                $year = now()->year;

                $count = static::whereYear(
                    'created_at',
                    $year
                )->count() + 1;

                $req->request_number = sprintf(
                    'BM-%d-%04d',
                    $year,
                    $count
                );
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

    /**
     * Génère automatiquement un matricule
     * selon le rôle.
     *
     * ETU-2026-0001
     * ENS-2026-0001
     * CHR-2026-0001
     */
    public static function generateMatricule(
        string $role = 'etudiant'
    ): string {
        $prefixes = [
            'etudiant' => 'ETU',
            'enseignant' => 'ENS',
            'chercheur' => 'CHR',
        ];

        $prefix = $prefixes[$role] ?? 'USR';

        $year = now()->year;

        $count = static::where(
            'role',
            $role
        )
            ->whereYear(
                'created_at',
                $year
            )
            ->count() + 1;

        do {
            $matricule = sprintf(
                '%s-%d-%04d',
                $prefix,
                $year,
                $count++
            );
        } while (
            static::where(
                'matricule',
                $matricule
            )->exists()
            ||
            User::where(
                'matricule',
                $matricule
            )->exists()
        );

        return $matricule;
    }
}