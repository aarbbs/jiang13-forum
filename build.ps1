# Jiang13 Forum - Windows build script (replaces GNU Make)
# Usage: .\build.ps1
#        .\build.ps1 -Target build-windows
# Branch rebuild/gitea-ssr: Go templates SSR + web_src (no React SPA)

param(
    [ValidateSet('build', 'build-windows', 'build-linux', 'build-darwin', 'build-all', 'web-src', 'tidy', 'run', 'dev', 'clean', 'docker', 'compose-up', 'compose-down', 'help')]
    [string]$Target = 'build'
)

$ErrorActionPreference = 'Stop'
$AppName = 'jiang13'
$MainPkg = './cmd/jiang13'
$BuildDir = 'dist'
$DevDataDir = 'dist/data'
$Version = '1.0.0'
try {
    $gitSha = (git rev-parse --short HEAD 2>$null)
    if ($LASTEXITCODE -eq 0 -and $gitSha) {
        $Version = "1.0.0+$gitSha"
    }
} catch {}
$RegistryImage = 'hangzhang714128/jiang13-forum'
$Ldlags = "-s -w -X main.version=$Version"

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }
}

function Build-WebSrc {
    Write-Host '[web_src] npm run build...' -ForegroundColor Cyan
    Push-Location web_src
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'web_src build failed' }
    } finally {
        Pop-Location
    }
}

function Build-Go([string]$OutFile, [string]$GoOS = '', [string]$GoArch = '') {
    Ensure-Dir $BuildDir
    if ($GoOS) { $env:GOOS = $GoOS } else { Remove-Item Env:GOOS -ErrorAction SilentlyContinue }
    if ($GoArch) { $env:GOARCH = $GoArch } else { Remove-Item Env:GOARCH -ErrorAction SilentlyContinue }

    # 纯 Go SQLite（glebarez），交叉编译无需 C 工具链
    $prevCgo = $env:CGO_ENABLED
    $env:CGO_ENABLED = '0'

    $isWindows = ($GoOS -eq 'windows') -or (($GoOS -eq '') -and ($env:OS -match 'Windows'))
    if ($isWindows -and ($OutFile -notmatch '\.exe$')) {
        $OutFile = "$OutFile.exe"
    }

    $outPath = Join-Path $BuildDir $OutFile
    Write-Host "[go] build -> $outPath (CGO_ENABLED=0)" -ForegroundColor Cyan
    try {
        go build -trimpath -ldflags $Ldlags -o $outPath $MainPkg
        if ($LASTEXITCODE -ne 0) { throw 'go build failed' }
        Write-Host "[ok] $outPath" -ForegroundColor Green
    } finally {
        if ($null -eq $prevCgo) {
            Remove-Item Env:CGO_ENABLED -ErrorAction SilentlyContinue
        } else {
            $env:CGO_ENABLED = $prevCgo
        }
        Remove-Item Env:GOOS -ErrorAction SilentlyContinue
        Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
    }
}

switch ($Target) {
    'help' {
        Write-Host '.\build.ps1                  build current platform (web_src + go)'
        Write-Host '.\build.ps1 -Target web-src   SSR progressive assets only'
        Write-Host '.\build.ps1 -Target build-windows'
        Write-Host '.\build.ps1 -Target build-linux'
        Write-Host '.\build.ps1 -Target build-all'
        Write-Host '.\build.ps1 -Target run       SSR on :3000'
        Write-Host '.\build.ps1 -Target dev       same as run (SSR; SPA is on main)'
        Write-Host '.\build.ps1 -Target tidy'
        Write-Host '.\build.ps1 -Target clean'
        Write-Host '.\build.ps1 -Target docker'
        Write-Host '.\build.ps1 -Target compose-up'
        Write-Host '.\build.ps1 -Target compose-down'
        Write-Host ''
        Write-Host 'Note: Windows "make" is often Embarcadero MAKE, not GNU Make.'
        Write-Host 'SPA reference: git checkout main  (or origin/main).'
    }
    'web-src' { Build-WebSrc }
    'tidy' { go mod tidy }
    'clean' {
        if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
        Write-Host '[ok] cleaned dist' -ForegroundColor Green
    }
    'run' {
        Ensure-Dir $DevDataDir
        Build-WebSrc
        go run $MainPkg --work-path . --data $DevDataDir
    }
    'dev' {
        Ensure-Dir $DevDataDir
        Build-WebSrc
        Write-Host '[dev] SSR: http://localhost:3000  (SPA 对照请 checkout main)' -ForegroundColor Green
        go run $MainPkg --work-path . --data $DevDataDir
    }
    'build' {
        Build-WebSrc
        Build-Go -OutFile $AppName
    }
    'build-windows' {
        Build-WebSrc
        Build-Go -OutFile $AppName -GoOS 'windows' -GoArch 'amd64'
    }
    'build-linux' {
        Build-WebSrc
        Build-Go -OutFile "$AppName-linux-amd64" -GoOS 'linux' -GoArch 'amd64'
    }
    'build-darwin' {
        Build-WebSrc
        Build-Go -OutFile "$AppName-darwin-arm64" -GoOS 'darwin' -GoArch 'arm64'
    }
    'build-all' {
        Build-WebSrc
        Build-Go -OutFile $AppName -GoOS 'windows' -GoArch 'amd64'
        Build-Go -OutFile "$AppName-linux-amd64" -GoOS 'linux' -GoArch 'amd64'
        Build-Go -OutFile "$AppName-darwin-arm64" -GoOS 'darwin' -GoArch 'arm64'
        Write-Host '[ok] all platforms done' -ForegroundColor Green
    }
    'docker' {
        Write-Host "[docker] build $RegistryImage`:$Version and latest" -ForegroundColor Cyan
        docker build --build-arg "VERSION=$Version" -t "${RegistryImage}:$Version" -t "${RegistryImage}:latest" .
        if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }
        Write-Host '[ok] docker image built' -ForegroundColor Green
    }
    'compose-up' {
        docker compose up -d --build
        if ($LASTEXITCODE -ne 0) { throw 'compose up failed' }
    }
    'compose-down' {
        docker compose down
        if ($LASTEXITCODE -ne 0) { throw 'compose down failed' }
    }
}
