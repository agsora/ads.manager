@echo off
rem Sinkron menu Berkas In (hanya membaca DB sumber).
rem   tanpa argumen  : sinkron penuh (jadwal harian 06:30, atau klik dua kali)
rem   --if-requested : hanya bila tombol "Sinkron sekarang" di menu sudah ditekan (dijadwalkan tiap 5 menit);
rem                    pemeriksaan kosong tidak dicatat di log supaya log tidak penuh
cd /d "C:\coding\ads manager"
if "%1"=="--if-requested" (
  call "C:\Program Files\nodejs\npm.cmd" run sync:berkas -- --if-requested > "%TEMP%\sync-berkas-cek.txt" 2>&1
  findstr /C:"Tidak ada permintaan" /C:"Sinkron sedang berjalan" "%TEMP%\sync-berkas-cek.txt" >nul || type "%TEMP%\sync-berkas-cek.txt" >> "%USERPROFILE%\sync-berkas.log"
  goto :eof
)
echo [%date% %time%] mulai >> "%USERPROFILE%\sync-berkas.log"
call "C:\Program Files\nodejs\npm.cmd" run sync:berkas >> "%USERPROFILE%\sync-berkas.log" 2>&1
echo [%date% %time%] selesai (kode %errorlevel%) >> "%USERPROFILE%\sync-berkas.log"
