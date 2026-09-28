<?php

namespace App\Services\Covers;

use RuntimeException;

/**
 * Outils communs aux couvertures générées (IA ou dessinées par le serveur).
 */
class CoverImage
{
    // Même limite que la règle « cover » de DocumentController (5 120 Ko), avec une marge.
    public const MAX_BYTES = 4_800_000;

    /**
     * Garantit que l'image passe la règle « cover » (image, 5 Mo max) du formulaire :
     * au-delà, elle est réduite et convertie en JPEG.
     *
     * @param  array{mime:string, data:string}  $image
     * @return array{mime:string, data:string}
     */
    public static function fit(array $image): array
    {
        if (strlen($image['data']) <= self::MAX_BYTES) {
            return $image;
        }

        $source = function_exists('imagecreatefromstring') ? @imagecreatefromstring($image['data']) : false;
        if (!$source) {
            throw new RuntimeException("L'image générée est trop lourde et n'a pas pu être réduite.");
        }

        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1, 1600 / max($width, 1));
        $target = imagecreatetruecolor(max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale)));
        imagefill($target, 0, 0, imagecolorallocate($target, 255, 255, 255)); // fond blanc pour la transparence PNG
        imagecopyresampled($target, $source, 0, 0, 0, 0, imagesx($target), imagesy($target), $width, $height);

        $data = '';
        foreach ([85, 70, 55] as $quality) {
            $data = self::jpeg($target, $quality);
            if (strlen($data) <= self::MAX_BYTES) {
                break;
            }
        }

        imagedestroy($source);
        imagedestroy($target);

        if (strlen($data) > self::MAX_BYTES) {
            throw new RuntimeException("L'image générée est trop lourde.");
        }

        return ['mime' => 'image/jpeg', 'data' => $data];
    }

    public static function jpeg(\GdImage $image, int $quality = 88): string
    {
        ob_start();
        imagejpeg($image, null, $quality);

        return (string) ob_get_clean();
    }
}
