<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SearchHistory extends Model
{
    protected $fillable = ['user_id', 'query', 'filters'];

    protected $casts = ['filters' => 'array'];
}
