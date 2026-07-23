#requires -Version 7
<#
.SYNOPSIS
  Упаковка AssetsBoss в портативные single-file .exe под win-arm64 и win-x64.

.DESCRIPTION
  Для каждого RID делает self-contained single-file publish (весь рантайм, нативные
  DLL Photino и фронтенд бандлятся внутрь одного .exe) и кладёт zip в dist/.
  Запуск: pwsh tools/package.ps1   (или с выбором: -Rids win-x64)
#>
param(
    [string[]] $Rids = @('win-arm64', 'win-x64'),
    [string]   $Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$proj = Join-Path $root 'src/AssetsBoss.Desktop/AssetsBoss.Desktop.csproj'
$frontend = Join-Path $root 'frontend'
$distDir = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# Версия задана централизованно в Directory.Build.props (см. <Version>).
$propsFile = Join-Path $root 'Directory.Build.props'
[xml]$xml = Get-Content $propsFile
$version = @($xml.Project.PropertyGroup.Version | Where-Object { $_ })[0]
if (-not $version) { throw "Version не найдена в $propsFile" }

# Детерминированная арка node. Менеджеры версий (fnm в профиле пользователя) могут
# подставить node другой архитектуры, чем установленные нативные биндинги сборщика
# (rolldown/vite) в node_modules — и build падает на загрузке .node не той арки.
# Поэтому предпочитаем системный node, если он есть.
$sysNode = Join-Path $env:ProgramFiles 'nodejs'
if (Test-Path (Join-Path $sysNode 'node.exe')) {
    $env:PATH = "$sysNode;$env:PATH"
}
Write-Host "==> npm build (frontend) via $((Get-Command node).Source)" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    npm --prefix $frontend ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci упал" }
}
npm --prefix $frontend run build
if ($LASTEXITCODE -ne 0) { throw "npm run build упал" }

foreach ($rid in $Rids) {
    $outDir = Join-Path $root "publish/$rid"
    Write-Host "==> publish $rid (v$version)" -ForegroundColor Cyan
    if (Test-Path $outDir) { Remove-Item -Recurse -Force $outDir }

    # Фронтенд уже собран выше; publish встроит готовый dist в exe (EmbeddedResource).
    dotnet publish $proj -c $Configuration -r $rid --self-contained -o $outDir
    if ($LASTEXITCODE -ne 0) { throw "publish упал для $rid" }

    $exe = Join-Path $outDir 'AssetsBoss.exe'
    if (-not (Test-Path $exe)) { throw "не найден exe: $exe" }
    $exeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)

    # True single-file: рантайм, нативные DLL Photino, фронтенд и иконка — всё внутри exe.
    $zip = Join-Path $distDir "AssetsBoss-$version-$rid.zip"
    if (Test-Path $zip) { Remove-Item -Force $zip }
    Compress-Archive -Path $exe -DestinationPath $zip
    $zipMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)

    Write-Host "    exe $exeMb MB  ->  $zip ($zipMb MB)" -ForegroundColor Green
}

Write-Host "Готово. Артефакты в $distDir" -ForegroundColor Cyan
