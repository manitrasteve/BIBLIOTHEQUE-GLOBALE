<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
class AdminMessageRecipient extends Model
{
    protected $casts = ['read_at' => 'datetime', 'deleted_at' => 'datetime'];
    public function message(): BelongsTo
    {
        return $this->belongsTo(AdminMessage::class, 'admin_message_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected $fillable = ['admin_message_id','user_id','email','status','read_at','deleted_at','error'];
}
