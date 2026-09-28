<?php

namespace App\Services\Covers;

use Illuminate\Support\Str;

/**
 * Couverture dessinée par le serveur (GD), sans IA : secours quand le service
 * d'images ne répond pas. Fond dégradé choisi selon la catégorie, type en tête,
 * titre et sous-titre centrés, catégorie en pied de page.
 */
class FallbackCoverRenderer
{
    private const WIDTH = 768;
    private const HEIGHT = 1024;
    private const TEXT_WIDTH = 580;

    // [haut du dégradé, bas du dégradé, accent]
    private const PALETTES = [
        [[27, 42, 74], [12, 20, 38], [201, 162, 39]],   // bleu nuit / laiton
        [[20, 83, 45], [8, 38, 22], [214, 184, 96]],    // vert forêt / or
        [[110, 28, 36], [52, 12, 18], [226, 190, 120]], // bordeaux / sable
        [[44, 62, 80], [20, 28, 38], [120, 190, 200]],  // ardoise / turquoise
        [[76, 29, 90], [34, 12, 44], [222, 170, 90]],   // prune / ambre
        [[15, 76, 92], [6, 36, 44], [236, 200, 120]],   // pétrole / miel
    ];

    /**
     * @return array{mime:string, data:string}
     */
    public function render(string $title, ?string $subtitle = null, ?string $category = null, ?string $type = null): array
    {
        [$top, $bottom, $accent] = self::PALETTES[crc32(mb_strtolower($category ?: $title)) % count(self::PALETTES)];

        $img = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        imagealphablending($img, true);

        for ($y = 0; $y < self::HEIGHT; $y++) {
            $t = $y / (self::HEIGHT - 1);
            $color = imagecolorallocate($img, ...array_map(fn ($a, $b) => (int) round($a + ($b - $a) * $t), $top, $bottom));
            imageline($img, 0, $y, self::WIDTH, $y, $color);
        }

        // Cercles décoratifs discrets.
        $halo = imagecolorallocatealpha($img, $accent[0], $accent[1], $accent[2], 115);
        imagefilledellipse($img, self::WIDTH - 60, 170, 420, 420, $halo);
        imagefilledellipse($img, 80, self::HEIGHT - 120, 300, 300, $halo);

        $accentColor = imagecolorallocate($img, ...$accent);
        $textColor = imagecolorallocate($img, 246, 241, 231);
        $softColor = imagecolorallocatealpha($img, 246, 241, 231, 35);

        // Double cadre.
        imagesetthickness($img, 2);
        imagerectangle($img, 34, 34, self::WIDTH - 35, self::HEIGHT - 35, $accentColor);
        imagesetthickness($img, 1);
        imagerectangle($img, 44, 44, self::WIDTH - 45, self::HEIGHT - 45, $accentColor);

        // Crimson Text (licence OFL, resources/fonts/OFL.txt).
        $bold = resource_path('fonts/CrimsonText-Bold.ttf');
        $regular = resource_path('fonts/CrimsonText-Regular.ttf');

        if (is_file($bold) && is_file($regular) && function_exists('imagettftext')) {
            $this->drawText($img, $bold, $regular, $title, $subtitle, $category, $type, $textColor, $softColor, $accentColor);
        } else {
            // Sans police TrueType : texte simple, sans accents.
            $lines = explode("\n", wordwrap(Str::ascii($title), 40, "\n", true));
            foreach (array_slice($lines, 0, 8) as $i => $line) {
                imagestring($img, 5, (int) ((self::WIDTH - strlen($line) * 9) / 2), 440 + $i * 22, $line, $textColor);
            }
        }

        $data = CoverImage::jpeg($img, 90);
        imagedestroy($img);

        return ['mime' => 'image/jpeg', 'data' => $data];
    }

    private function drawText(\GdImage $img, string $bold, string $regular, string $title, ?string $subtitle, ?string $category, ?string $type, int $text, int $soft, int $accent): void
    {
        $cx = self::WIDTH / 2;

        if ($type = trim((string) $type)) {
            $this->centered($img, $regular, 17, 130, mb_strtoupper($type), $accent);
        }
        imagefilledrectangle($img, (int) $cx - 40, 160, (int) $cx + 40, 162, $accent);

        // Titre : la plus grande taille qui tient en 6 lignes.
        $size = 54;
        do {
            $lines = $this->wrap($bold, $size, $title);
            $size -= 4;
        } while (count($lines) > 6 && $size >= 26);
        $size += 4;
        $lines = array_slice($lines, 0, 6);
        $lineHeight = (int) round($size * 1.35);

        $subLines = ($subtitle = trim((string) $subtitle)) ? array_slice($this->wrap($regular, 22, $subtitle), 0, 3) : [];
        $blockHeight = count($lines) * $lineHeight + ($subLines ? 50 + count($subLines) * 34 : 0);
        $y = (int) max(250, 500 - $blockHeight / 2) + $size;

        foreach ($lines as $line) {
            $this->centered($img, $bold, $size, $y, $line, $text);
            $y += $lineHeight;
        }

        if ($subLines) {
            $y += 20;
            foreach ($subLines as $line) {
                $this->centered($img, $regular, 22, $y, $line, $soft);
                $y += 34;
            }
        }

        imagefilledrectangle($img, (int) $cx - 110, self::HEIGHT - 150, (int) $cx + 110, self::HEIGHT - 149, $accent);
        if ($category = trim((string) $category)) {
            $this->centered($img, $regular, 16, self::HEIGHT - 105, mb_strtoupper(Str::limit($category, 40, '…')), $accent);
        }
    }

    private function centered(\GdImage $img, string $font, int $size, int $y, string $text, int $color): void
    {
        $box = imagettfbbox($size, 0, $font, $text);
        $x = (int) round((self::WIDTH - ($box[2] - $box[0])) / 2 - $box[0]);
        imagettftext($img, $size, 0, $x, $y, $color, $font, $text);
    }

    /** @return list<string> */
    private function wrap(string $font, int $size, string $text): array
    {
        $lines = [];
        $current = '';

        foreach (preg_split('/\s+/u', trim($text)) ?: [] as $word) {
            $candidate = $current === '' ? $word : "{$current} {$word}";
            $box = imagettfbbox($size, 0, $font, $candidate);
            if ($current !== '' && ($box[2] - $box[0]) > self::TEXT_WIDTH) {
                $lines[] = $current;
                $current = $word;
            } else {
                $current = $candidate;
            }
        }

        if ($current !== '') {
            $lines[] = $current;
        }

        return $lines;
    }
}
