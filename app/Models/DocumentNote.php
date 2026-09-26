<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentNote extends Model
{
    public const COLORS = ['jaune', 'vert', 'bleu', 'rose'];

    protected $fillable = ['user_id', 'document_id', 'page', 'body', 'color'];

    protected $casts = ['page' => 'integer'];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
