<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $fillable = [
        'uuid',
        'matricule',
        'name',
        'email',
        'password',
        'password_set_at',
        'role',
        'address',
        'phone',
        'gender',
        'library_id',
        'is_active',
        'date_of_birth','photo_path','faculty','department','position','teaching_specialty','research_lab',
        'school','filiere','niveau_type','niveau_detail','specialty','diploma','workplace','researcher_field','profession','experience',
        'birth_place', 'cin_number', 'cin_issued_at', 'student_card_number',
    ];

    // Préfixe du matricule selon le rôle de l'utilisateur.
    private const MATRICULE_PREFIXES = [
        'etudiant' => 'ETU',
        'enseignant' => 'ENS',
        'chercheur' => 'CHR',
        'bibliothecaire' => 'BIB',
        'administrateur' => 'ADM',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (User $user) {
            // Le matricule est attribué par le processus de validation.
            // Une demande en attente ne doit donc jamais recevoir de matricule.
            $user->uuid ??= (string) \Illuminate\Support\Str::uuid();
        });
    }

    /**
     * Une adresse e-mail identifie un seul compte. Un compte dans la corbeille (restaurable)
     * la réserve encore ; après sa suppression définitive, l'adresse est de nouveau libre.
     * Renvoie le message à afficher si l'adresse est déjà prise, null si elle est libre.
     */
    public static function emailUnavailableMessage(?string $email, ?int $exceptUserId = null): ?string
    {
        $owner = static::withTrashed()
            ->where('email', trim((string) $email))
            ->when($exceptUserId, fn ($query) => $query->whereKeyNot($exceptUserId))
            ->first();

        if (! $owner) {
            return null;
        }

        return $owner->trashed()
            ? 'Un compte supprimé utilisant cette adresse e-mail se trouve encore dans la corbeille. Restaurez-le, ou supprimez-le définitivement pour pouvoir réutiliser l’adresse.'
            : 'Un compte existe déjà avec cette adresse e-mail.';
    }

    // Génère le numéro de compte du type ETU-2026-0001, unique par rôle et par année.
    // Le numéro est stocké dans la colonne historique `matricule` (renommer la colonne
    // serait risqué pour les données et contraintes existantes).
    public static function generateNumeroCompte(string $role): string
    {
        return self::generateMatricule($role);
    }

    // Conservée pour compatibilité : logique de séquence verrouillée + historique.
    public static function generateMatricule(string $role): string
    {
        $prefix = self::MATRICULE_PREFIXES[$role] ?? 'USR';
        $year = now()->year;

        return DB::transaction(function () use ($role, $prefix, $year) {
            DB::table('matricule_sequences')->insertOrIgnore([
                'year' => $year,
                'role' => $role,
                'next_number' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $sequence = DB::table('matricule_sequences')
                ->where('year', $year)
                ->where('role', $role)
                ->lockForUpdate()
                ->first();

            $highestHistoricalNumber = max(
                self::highestMatriculeNumber(
                    static::query()->where('role', $role)->pluck('matricule'),
                    $prefix,
                    $year
                ),
                self::highestMatriculeNumber(
                    DB::table('member_registries')
                        ->where('role', $role)
                        ->pluck('matricule'),
                    $prefix,
                    $year
                ),
                self::highestMatriculeNumber(
                    DB::table('account_requests')
                        ->where('role', $role)
                        ->pluck('matricule'),
                    $prefix,
                    $year
                )
            );

            // La séquence peut avoir été créée avant l'import d'un historique.
            // Chaque attribution la réaligne donc sur le plus grand matricule connu.
            $number = max((int) $sequence->next_number, $highestHistoricalNumber + 1);

            DB::table('matricule_sequences')
                ->where('year', $year)
                ->where('role', $role)
                ->update([
                    'next_number' => $number + 1,
                    'updated_at' => now(),
                ]);

            return sprintf('%s-%d-%04d', $prefix, $year, $number);
        });
    }

    private static function highestMatriculeNumber($matricules, string $prefix, int $year): int
    {
        $pattern = '/^' . preg_quote($prefix, '/') . '-' . $year . '-(\d{4,})$/';
        $highest = 0;

        foreach ($matricules as $matricule) {
            if (preg_match($pattern, (string) $matricule, $matches)) {
                $highest = max($highest, (int) $matches[1]);
            }
        }

        return $highest;
    }

    protected $appends = ['photo_url', 'numero_compte'];

    // Alias d'affichage : le numéro de compte est l'ancien matricule stocké en base.
    public function getNumeroCompteAttribute(): ?string
    {
        return $this->attributes['matricule'] ?? null;
    }

    public function getPhotoUrlAttribute(): ?string
    {
        // Adresse relative (et non asset()) : la photo reste visible si l'IP ou l'adresse du serveur change.
        return $this->photo_path ? '/storage/'.$this->photo_path : null;
    }

    public function library(): BelongsTo
    {
        return $this->belongsTo(Library::class);
    }

    public function documentsCreated(): HasMany
    {
        return $this->hasMany(Document::class, 'created_by');
    }

    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class);
    }

    public function aiQueries(): HasMany
    {
        return $this->hasMany(AiQuery::class);
    }


    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function feedbacks(): HasMany
    {
        return $this->hasMany(Feedback::class);
    }

    public function problemReports(): HasMany
    {
        return $this->hasMany(ProblemReport::class);
    }

    public function appNotifications(): HasMany
    {
        return $this->hasMany(AppNotification::class);
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ActivityLog::class);
    }

    public function isAdmin(): bool
    {
        return in_array($this->role, ['administrateur', 'admin'], true);
    }

    public function isLibrarian(): bool
    {
        return $this->role === 'bibliothecaire';
    }

    /**
     * Périmètre de gestion : Bibliothèque Numérique Globale — l'administrateur ET le bibliothécaire
     * (compte global, non rattaché à une bibliothèque particulière) gèrent toutes les bibliothèques.
     * Toujours déduit du compte authentifié, jamais d'un paramètre de requête.
     */
    public function managesLibrary(?int $libraryId): bool
    {
        return $this->isAdmin() || $this->isLibrarian();
    }

    /** Bibliothèque Numérique Globale : aucune restriction par bibliothèque pour l'administrateur ni le bibliothécaire. */
    public function restrictToManagedLibrary($query, string $column = 'library_id')
    {
        if ($this->isAdmin() || $this->isLibrarian()) {
            return $query;
        }

        return $query->whereRaw('1 = 0');
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'user_permissions')->withTimestamps();
    }

    public function hasPermission(string $permission): bool
    {
        return $this->isAdmin() || $this->permissions()->where('name', $permission)->exists();
    }
}
