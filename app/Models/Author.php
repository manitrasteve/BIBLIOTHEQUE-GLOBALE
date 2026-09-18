<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Author extends Model
{
    use HasFactory;

    protected $fillable = ['uuid', 'name', 'slug'];

    protected static function booted(): void
    {
        static::creating(function (Author $author) {
            $author->uuid ??= (string) \Illuminate\Support\Str::uuid();

            if (!$author->slug) {
                $base = \Illuminate\Support\Str::slug($author->name) ?: 'auteur';
                $slug = $base;
                $suffix = 2;

                while (static::where('slug', $slug)->exists()) {
                    $slug = $base . '-' . $suffix++;
                }

                $author->slug = $slug;
            }
        });
    }

    public function documents(): BelongsToMany
    {
        return $this->belongsToMany(Document::class);
    }
}
