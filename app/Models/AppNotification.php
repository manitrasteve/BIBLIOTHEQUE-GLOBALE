<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AppNotification extends Model
{
    use HasFactory;

    protected $table = 'app_notifications';

    protected $fillable = [
        'uuid', 'user_id', 'type', 'title', 'message',
        'related_type', 'related_id', 'read_at',
    ];

    protected $casts = ['read_at' => 'datetime'];

    protected static function booted(): void
    {
        static::creating(function (AppNotification $n) {
            $n->uuid ??= (string) \Illuminate\Support\Str::uuid();
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function markAsRead(): void
    {
        $this->update(['read_at' => now()]);
    }

    public function scopeUnread($query)
    {
        return $query->whereNull('read_at');
    }
}
