<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThemeVersion extends Model
{
    public const DRAFT = 'draft';
    public const PUBLISHED = 'published';

    protected $fillable = ['status', 'version', 'colors', 'is_default', 'created_by', 'published_at'];

    protected $casts = [
        'colors' => 'array',
        'is_default' => 'boolean',
        'published_at' => 'datetime',
    ];

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', self::PUBLISHED);
    }

    public static function draft(): ?self
    {
        return static::where('status', self::DRAFT)->first();
    }

    // Thème actif : toujours la dernière version publiée.
    public static function current(): ?self
    {
        return static::published()->orderByDesc('version')->first();
    }
}
