<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;



class MemberRegistry extends Model
{
    protected $fillable = [
        'library_id', 'card_number', 'matricule', 'user_id', 'role', 'last_name', 'first_name',
        'email', 'phone', 'address', 'gender', 'status', 'profile_data',
    ];

    protected $casts = ['profile_data' => 'array'];

    public function library(): BelongsTo
    {
        return $this->belongsTo(Library::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
