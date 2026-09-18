<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($request->user()->load('library'));
    }

    public function update(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'email' => ['required','email','max:255','unique:users,email,'.$user->id],
            'phone' => ['nullable','string','max:50'],
            'address' => ['nullable','string','max:255'],
            'date_of_birth' => ['nullable','date'],
            'photo' => ['nullable','image','mimes:jpg,jpeg,png,webp','max:2048'],
            'school' => ['nullable','string','max:255'], 'filiere'=>['nullable','string','max:255'],
            'niveau_type'=>['nullable','string','max:50'], 'niveau_detail'=>['nullable','string','max:80'],
            'faculty'=>['nullable','string','max:255'], 'department'=>['nullable','string','max:255'],
            'position'=>['nullable','string','max:255'], 'teaching_specialty'=>['nullable','string','max:255'],
            'specialty'=>['nullable','string','max:255'], 'diploma'=>['nullable','string','max:255'],
            'workplace'=>['nullable','string','max:255'], 'researcher_field'=>['nullable','string','max:255'],
            'profession'=>['nullable','string','max:255'], 'experience'=>['nullable','string','max:2000'],
        ]);
        unset($data['photo']);
        if ($request->hasFile('photo')) {
            if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
            $data['photo_path'] = $request->file('photo')->store('profiles','public');
        }
        $user->update($data);
        return response()->json($user->fresh()->load('library'));
    }

    public function deletePhoto(Request $request)
    {
        $user = $request->user();
        if ($user->photo_path) Storage::disk('public')->delete($user->photo_path);
        $user->update(['photo_path'=>null]);
        return response()->json($user->fresh());
    }
}
