<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReadingProgress extends Model
{
    protected $table = 'reading_progress';

    protected $fillable = ['user_id', 'document_id', 'last_page', 'total_pages'];

    protected $casts = ['last_page' => 'integer', 'total_pages' => 'integer'];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
