<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
class ProblemReport extends Model
{
    protected $fillable = ['uuid','user_id','type','custom_type','subject','description','screenshot_path','status','admin_reply','replied_at'];
    protected $casts = ['replied_at'=>'datetime'];
    protected $appends = ['screenshot_url'];
    protected static function booted(){
        static::creating(function($m){ $m->uuid ??= (string) Str::uuid(); });
        // Signalement supprimé : la capture d'écran ne reste pas publique sur le disque.
        static::deleted(function($m){ if($m->screenshot_path) Storage::disk('public')->delete($m->screenshot_path); });
    }
    // Adresse relative, comme photo_url : l'image reste visible si l'IP ou l'adresse du serveur change.
    public function getScreenshotUrlAttribute(): ?string { return $this->screenshot_path ? '/storage/'.$this->screenshot_path : null; }
    public function user(){ return $this->belongsTo(User::class); }
}
