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

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class);
    }
}
