<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
class Feedback extends Model
{
    protected $table = 'feedbacks';
    protected $fillable = ['uuid','user_id','type','subject','message','rating','status','admin_reply','replied_at'];
    protected $casts = ['replied_at'=>'datetime'];
    protected static function booted(){ static::creating(function($m){ $m->uuid ??= (string) Str::uuid(); }); }
    public function user(){ return $this->belongsTo(User::class); }
}
