<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Document extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'uuid', 'slug', 'title', 'subtitle', 'abstract', 'type','niveau',
        'category_id', 'library_id', 'year', 'publisher', 'isbn',
        'language', 'edition', 'keywords', 'cover_path', 'file_path',
        'access_level', 'status', 'created_by', 'published_at',
    ];

    protected $casts = [
        'published_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Document $document) {
            $document->uuid ??= (string) \Illuminate\Support\Str::uuid();
            $document->slug ??= \Illuminate\Support\Str::slug($document->title) . '-' . \Illuminate\Support\Str::random(6);
        });
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function library(): BelongsTo
    {
        return $this->belongsTo(Library::class);
    }

    public function authors(): BelongsToMany
    {
        return $this->belongsToMany(Author::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function chunks(): HasMany
    {
        return $this->hasMany(DocumentChunk::class);
    }

    public function favorites(): HasMany
    {
        return $this->hasMany(Favorite::class);
    }

    public function consultations(): HasMany
    {
        return $this->hasMany(Consultation::class);
    }

    public function aiQueries(): HasMany
    {
        return $this->hasMany(AiQuery::class);
    }


// Un visiteur non connecté ne voit que titre/résumé/métadonnées, jamais le PDF.
    public function isPubliclyViewable(): bool
    {
        return $this->status === 'publie';
    }

    // Règle d'accès au CONTENU du document (PDF, IA, etc.), partagée par
    // tous les contrôleurs — à appeler partout où le contenu est exposé.
    public function isAccessibleBy(User $user): bool
    {
        if ($user->isAdmin() || $user->isLibrarian()) {
            return true;
        }

        if (!$user->is_active) {
            return false;
        }

        return match ($this->access_level) {
            'public' => true,
            'authentifie' => true,
            'restreint' => (int) ($user->library_id ?? 0) === (int) ($this->library_id ?? 0)
                && !is_null($user->library_id)
                && !is_null($this->library_id),
            default => true,
        };
    }
}