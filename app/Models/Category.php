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
            $category->slug ??= \Illuminate\Support\Str::slug($category->name);
        });
    }

    /** Catégorie saisie librement : retrouvée sans tenir compte de la casse (ou par son slug), sinon créée. */
    public static function resolveId(string $name): int
    {
        $name = trim(preg_replace('/\s+/u', ' ', $name));

        $category = static::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
            ->orWhere('slug', \Illuminate\Support\Str::slug($name))
            ->first();

        return ($category ?? static::create(['name' => $name]))->id;
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }
}
