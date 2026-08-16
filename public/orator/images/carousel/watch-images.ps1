param()

$ErrorActionPreference = "Continue"
$folder = Get-Location
$filter = '*.jpg'
$jsonPath = "$folder\images.json"

function Get-FileList {
    @(Get-ChildItem -Path $folder -Filter $filter -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty Name |
      Sort-Object)
}

function Update-Json {
    $files = Get-FileList
    $files | ConvertTo-Json | Out-File -FilePath $jsonPath -Encoding utf8 -Force
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Updated - $($files.Count) files"
}

# Initial run
Update-Json

Write-Host "Watching for JPG changes..."

$lastCount = (Get-FileList).Count

while($true) {
    Start-Sleep -Seconds 2
    $currentCount = (Get-FileList).Count

    if ($currentCount -ne $lastCount) {
        Update-Json
        $lastCount = $currentCount
    }
}
