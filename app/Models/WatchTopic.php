<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WatchTopic extends Model
{
    protected $fillable = ['user_id', 'type', 'term', 'category_id', 'last_seen_at'];

    protected $casts = ['last_seen_at' => 'datetime'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /** Documents publiés correspondant au thème (même logique de recherche que le catalogue). */
    public function matchingDocuments()
    {
        $query = Document::query()->where('status', 'publie');

        if ($this->type === 'domaine') {
            return $query->where('category_id', $this->category_id);
        }

        $term = $this->term;

        return $query->where(function ($q) use ($term) {
            $q->where('title', 'like', "%{$term}%")
              ->orWhere('keywords', 'like', "%{$term}%")
              ->orWhereHas('authors', fn ($a) => $a->where('name', 'like', "%{$term}%"));
        });
    }
}
