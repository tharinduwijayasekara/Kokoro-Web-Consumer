$folder = Get-Location
$filter = '*.jpg'

# Function to rebuild the JSON
function Update-Json {
    Get-ChildItem -Path $folder -Filter $filter | 
    Select-Object -ExpandProperty Name | 
    ConvertTo-Json | 
    Out-File -FilePath "$folder\images.json" -Encoding utf8
    Write-Host "images.json updated at $(Get-Date)"
}

# Initial run
Update-Json

# Setup watcher
$watcher = New-Object IO.FileSystemWatcher $folder, $filter
$watcher.IncludeSubdirectories = $false
$watcher.EnableRaisingEvents = $true

# Register events
$action = { Update-Json }
Register-ObjectEvent $watcher "Created" -Action $action
Register-ObjectEvent $watcher "Deleted" -Action $action
Register-ObjectEvent $watcher "Renamed" -Action $action

Write-Host "Watching for changes in $folder..."
while($true) { Start-Sleep 5 }