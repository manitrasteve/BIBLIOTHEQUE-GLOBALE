<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseListItem extends Model
{
    protected $fillable = ['course_list_id', 'document_id', 'instruction', 'due_date', 'position'];

    protected $casts = ['due_date' => 'date:Y-m-d', 'position' => 'integer'];

    public function courseList(): BelongsTo
    {
        return $this->belongsTo(CourseList::class);
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }
}
