<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReadingProgress extends Model
{
    protected $table = 'reading_progress';

    protected $fillable = ['user_id', 'document_id', 'last_page', 'total_pages', 'completed_at'];

    protected $casts = ['last_page' => 'integer', 'total_pages' => 'integer', 'completed_at' => 'datetime'];

    protected static function booted(): void
    {
        // « Lu en entier » est conservé : revenir ensuite sur une page précédente ne l'efface pas.
        static::saving(function (ReadingProgress $progress) {
            if (!$progress->completed_at && $progress->total_pages && $progress->last_page >= $progress->total_pages) {
                $progress->completed_at = now();
            }
        });
    }

    /** Lu en entier : la dernière page a été atteinte au moins une fois (même si le lecteur est revenu en arrière). */
    public function isCompleted(): bool
    {
        return $this->completed_at !== null;
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
