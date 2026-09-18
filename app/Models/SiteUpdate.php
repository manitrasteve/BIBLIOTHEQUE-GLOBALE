<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
class SiteUpdate extends Model
{
    protected $fillable = ['uuid','created_by','title','description','published_on','icon','image_path'];
    protected static function booted(){ static::creating(function($m){ $m->uuid ??= (string) Str::uuid(); }); }
    protected $casts = ['published_on'=>'date'];
}
