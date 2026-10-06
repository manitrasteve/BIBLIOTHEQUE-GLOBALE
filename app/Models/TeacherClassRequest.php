<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Demande d'un enseignant pour une classe (établissement + niveau), traitée par le Service Numérique. */
class TeacherClassRequest extends Model
{
    protected $fillable = ['user_id', 'school', 'level', 'message', 'status', 'reason', 'processed_by', 'processed_at'];

    protected $casts = ['processed_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function processedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'processed_by');
    }
}
