<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Classe (établissement + niveau) attribuée à un enseignant par le Service Numérique. */
class TeacherClass extends Model
{
    protected $fillable = ['user_id', 'school', 'level'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
