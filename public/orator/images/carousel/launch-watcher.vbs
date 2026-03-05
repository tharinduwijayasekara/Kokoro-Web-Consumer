Set objShell = CreateObject("WScript.Shell")
' 0 hides the window, True waits for it to finish (not needed here)
objShell.Run "powershell.exe -ExecutionPolicy Bypass -File watch-images.ps1", 0