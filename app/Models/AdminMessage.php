<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class AdminMessage extends Model
{
    protected $casts = ['deleted_by_sender_at' => 'datetime'];

    protected $fillable = ['sender_id','subject','message','recipient_count','success_count','failure_count', 'deleted_by_sender_at'];
    public function sender(){ return $this->belongsTo(User::class,'sender_id'); }
    public function recipients(){ return $this->hasMany(AdminMessageRecipient::class); }
}
