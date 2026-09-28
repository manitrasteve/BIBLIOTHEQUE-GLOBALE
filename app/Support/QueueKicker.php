<?php

namespace App\Support;

/**
 * Ce projet ne fait pas toujours tourner un worker de file d'attente
 * (`queue:work`/`queue:listen`) en permanence. Sans lui, une tâche mise en
 * file avec `dispatch()` resterait en attente jusqu'à ce que quelqu'un
 * démarre un worker manuellement — un bouton "réussirait" sans jamais
 * produire d'effet (document jamais indexé, message jamais envoyé...).
 *
 * On dispatche donc toujours la tâche normalement, puis on lance en plus un
 * worker éphémère qui la traite et s'arrête (`--stop-when-empty`). Un worker
 * déjà actif (ex. via `composer run dev`) traite simplement la file plus
 * vite, sans conflit avec celui-ci.
 */
class QueueKicker
{
    public static function dispatch(object $job): void
    {
        dispatch($job);

        if (config('queue.default') !== 'database') {
            return;
        }

        try {
            $php = stripos(basename(PHP_BINARY), 'php') !== false ? PHP_BINARY : 'php';
            // Tâche placée sur une file nommée (->onQueue()) : le worker éphémère doit écouter cette file.
            $queue = property_exists($job, 'queue') && is_string($job->queue) && preg_match('/^[\w-]+$/', $job->queue)
                ? ' --queue=' . $job->queue
                : '';
            $worker = '"' . $php . '" "' . base_path('artisan') . '" queue:work' . $queue . ' --stop-when-empty --tries=1 --quiet';
            $command = PHP_OS_FAMILY === 'Windows'
                ? 'start /B "" ' . $worker . ' > NUL 2>&1'
                : $worker . ' > /dev/null 2>&1 &';
            pclose(popen($command, 'r'));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
