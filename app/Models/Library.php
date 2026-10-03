<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Library extends Model
{
    use HasFactory;

    protected $fillable = [
        'uuid', 'name', 'slug', 'description', 'address',
        'location', 'opening_hours', 'opening_days', 'photo_path', 'map_link',
    ];

    protected $appends = ['cover_url'];

    // Photo de couverture : null pour les bibliothèques créées avant l'ajout du champ.
    public function getCoverUrlAttribute(): ?string
    {
        // Adresse relative (et non asset()) : la photo reste visible si l'IP ou l'adresse du serveur change.
        return $this->photo_path ? '/storage/'.$this->photo_path : null;
    }

    protected static function booted(): void
    {
        static::creating(function (Library $library) {
            $library->uuid ??= (string) \Illuminate\Support\Str::uuid();
            $library->slug ??= \Illuminate\Support\Str::slug($library->name);
        });
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }

    public function memberRegistries(): HasMany
    {
        return $this->hasMany(MemberRegistry::class);
    }

    public function accountRequests(): HasMany
    {
        return $this->hasMany(AccountRequest::class);
    }
}
