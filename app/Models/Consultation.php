<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Consultation extends Model
{
    public $timestamps = false;

    protected $fillable = ['user_id', 'document_id', 'consulted_at'];

    protected $casts = ['consulted_at' => 'datetime'];

    // Date fixée par l'application, en UTC comme toutes les autres. La valeur par défaut de la colonne
    // (CURRENT_TIMESTAMP) suit le fuseau de la session MySQL (+03:00 sous XAMPP) : les consultations
    // étaient décalées de 3 heures dans les statistiques.
    protected static function booted(): void
    {
        static::creating(function (Consultation $consultation) {
            $consultation->consulted_at ??= now();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
