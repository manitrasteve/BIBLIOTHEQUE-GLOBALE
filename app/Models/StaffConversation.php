<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StaffConversation extends Model
{
    use HasFactory;

    protected $fillable = [
        'admin_id',
        'librarian_id',
    ];

    /**
     * Administrateur de la conversation.
     */
    public function admin()
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * Bibliothécaire de la conversation.
     */
    public function librarian()
    {
        return $this->belongsTo(User::class, 'librarian_id');
    }

    /**
     * Messages de la conversation.
     */
    public function messages()
    {
        return $this->hasMany(
            StaffMessage::class,
            'conversation_id'
        )->orderBy('created_at');
    }
}