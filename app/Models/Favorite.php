<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Favorite extends Model
{
    protected $fillable = ['user_id','document_id'];
    public function document(){ return $this->belongsTo(Document::class); }
    public function user(){ return $this->belongsTo(User::class); }
}
