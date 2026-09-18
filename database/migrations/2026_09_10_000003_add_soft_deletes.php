<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
 public function up(): void {
  foreach (['users','documents'] as $tableName) {
   if (!Schema::hasColumn($tableName,'deleted_at')) Schema::table($tableName, fn(Blueprint $t) => $t->softDeletes());
  }
 }
 public function down(): void {
  foreach (['users','documents'] as $tableName) if (Schema::hasColumn($tableName,'deleted_at')) Schema::table($tableName, fn(Blueprint $t) => $t->dropSoftDeletes());
 }
};
