<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'recipient_id',
        'message',
        'read_at',
        'deleted_by_sender_at',
        'deleted_by_recipient_at',
    ];

    protected $casts = [
        'read_at' => 'datetime',
        'deleted_by_sender_at' => 'datetime',
        'deleted_by_recipient_at' => 'datetime',
    ];

    /**
     * Conversation à laquelle appartient le message.
     */
    public function conversation()
    {
        return $this->belongsTo(
            StaffConversation::class,
            'conversation_id'
        );
    }

    /**
     * Utilisateur qui a envoyé le message.
     */
    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    /**
     * Utilisateur qui reçoit le message.
     */
    public function recipient()
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }
}