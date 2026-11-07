<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Category extends Model
{
    use HasFactory;

    protected $fillable = ['uuid', 'name', 'slug', 'description'];

    protected static function booted(): void
    {
        static::creating(function (Category $category) {
            $category->uuid ??= (string) \Illuminate\Support\Str::uuid();
            $category->slug ??= self::slugFor($category->name);
        });
    }

    /** Slug du nom ; repli aléatoire pour un nom sans lettre latine (« !!! », « 数学 »), dont le slug serait vide. */
    public static function slugFor(string $name): string
    {
        return \Illuminate\Support\Str::slug($name) ?: 'categorie-' . \Illuminate\Support\Str::lower(\Illuminate\Support\Str::random(8));
    }

    /** Catégorie saisie librement : retrouvée sans tenir compte de la casse (ou par son slug), sinon créée. */
    public static function resolveId(string $name): int
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));

        $slug = \Illuminate\Support\Str::slug($name);

        // Slug vide : il ne désigne rien (sinon deux noms sans lettre latine seraient confondus).
        $category = static::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->when($slug !== '', fn ($query) => $query->orWhere('slug', $slug))
            ->first();

        return ($category ?? static::create(['name' => $name]))->id;
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }
}
