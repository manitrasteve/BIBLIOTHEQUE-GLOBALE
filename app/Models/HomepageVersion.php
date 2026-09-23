<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class HomepageVersion extends Model
{
    public const DRAFT = 'draft';
    public const PUBLISHED = 'published';

    protected $fillable = ['status', 'version', 'content', 'created_by', 'restored_from', 'published_at'];

    protected $casts = [
        'content' => 'array',
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

    // Version active sur la page publique : toujours la dernière publiée.
    public static function current(): ?self
    {
        return static::published()->orderByDesc('version')->first();
    }

    public function sections(): array
    {
        return $this->content['sections'] ?? [];
    }
}
