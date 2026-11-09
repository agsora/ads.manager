@echo off
rem Sinkron menu Berkas In (hanya membaca DB sumber). Dipakai oleh Task Scheduler atau diklik dua kali.
cd /d "C:\coding\ads manager"
echo [%date% %time%] mulai >> "%USERPROFILE%\sync-berkas.log"
call "C:\Program Files\nodejs\npm.cmd" run sync:berkas >> "%USERPROFILE%\sync-berkas.log" 2>&1
echo [%date% %time%] selesai (kode %errorlevel%) >> "%USERPROFILE%\sync-berkas.log"
