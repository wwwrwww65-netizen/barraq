@echo off
chcp 65001 >nul
title إعادة ضبط شاملة - Mister Casher

echo.
echo  ██████╗ ███████╗███████╗███████╗████████╗
echo  ██╔══██╗██╔════╝██╔════╝██╔════╝╚══██╔══╝
echo  ██████╔╝█████╗  ███████╗█████╗     ██║
echo  ██╔══██╗██╔══╝  ╚════██║██╔══╝     ██║
echo  ██║  ██║███████╗███████║███████╗   ██║
echo  ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝   ╚═╝
echo.
echo  Mister Casher - إعادة ضبط شاملة
echo  ==========================================
echo.
echo  ⚠  تحذير: سيتم حذف كل شيء تماماً
echo  ==========================================
echo.
echo  اضغط أي مفتاح للبدء...
pause >nul

:: ---- إغلاق البرنامج بالقوة ----
echo.
echo  ◆ إغلاق البرنامج...
taskkill /f /im "Mister Casher.exe" >nul 2>&1
taskkill /f /im "electron.exe"      >nul 2>&1
taskkill /f /im "baraaq.exe"        >nul 2>&1
ping -n 3 127.0.0.1 >nul

:: ---- الحذف الشامل عبر PowerShell (أقوى من rmdir) ----
echo  ◆ حذف جميع بيانات البرنامج...

powershell -NoProfile -Command ^
  "Remove-Item -Path ([System.IO.Path]::Combine($env:APPDATA,'baraaq')) -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '  تم الحذف'"

:: ---- التحقق من النتيجة ----
if exist "%appdata%\baraaq" (
    echo  ✗ لم يكتمل الحذف - جرب تشغيل الملف كمسؤول
    echo.
    echo  انقر بزر الأيمن على الملف ثم اختر "تشغيل كمسؤول"
) else (
    echo.
    echo  ==========================================
    echo  ✓ تمت إعادة الضبط بنجاح تام!
    echo  ==========================================
    echo.
    echo  ◆ افتح البرنامج الآن وسيبدأ من الصفر
)

echo.
echo  النافذة ستغلق بعد 15 ثانية...
timeout /t 15 >nul
