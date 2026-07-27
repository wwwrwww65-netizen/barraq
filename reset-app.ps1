$appData = $env:APPDATA
$folder = Join-Path $appData "baraaq"

# Kill processes
Get-Process -Name "electron","Mister Casher","baraaq" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

# Delete everything
if (Test-Path $folder) {
    Remove-Item $folder -Recurse -Force
    Write-Host "DONE - Folder deleted successfully" -ForegroundColor Green
    Write-Host "Please open the program now - it will start fresh" -ForegroundColor Cyan
} else {
    Write-Host "Folder not found at: $folder" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to close..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
