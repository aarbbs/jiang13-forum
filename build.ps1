# Jiang13 Forum - Windows build script (replaces GNU Make)
# Usage: .\build.ps1
#        .\build.ps1 -Target build-windows

param(
    [ValidateSet('build', 'build-windows', 'build-linux', 'build-darwin', 'build-all', 'frontend', 'tidy', 'run', 'dev', 'clean', 'docker', 'compose-up', 'compose-down', 'help')]
    [string]$Target = 'build'
)

$ErrorActionPreference = 'Stop'
$AppName = 'jiang13'
$MainPkg = './cmd/jiang13'
$BuildDir = 'dist'
$DevDataDir = 'dist/data'
$Version = '1.0.0'
$RegistryImage = 'hangzhang714128/jiang13-forum'
$Ldlags = "-s -w -X main.version=$Version"

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path | Out-Null
    }
}

function Build-Frontend {
    Write-Host '[frontend] npm run build...' -ForegroundColor Cyan
    Push-Location frontend
    try {
        if (-not (Test-Path node_modules)) {
            npm install
        }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
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
        Write-Host '.\build.ps1                  build current platform'
        Write-Host '.\build.ps1 -Target frontend  frontend only'
        Write-Host '.\build.ps1 -Target build-windows'
        Write-Host '.\build.ps1 -Target build-linux'
        Write-Host '.\build.ps1 -Target build-all'
        Write-Host '.\build.ps1 -Target run       backend only (port 3000)'
        Write-Host '.\build.ps1 -Target dev       backend + Vite HMR (recommended for frontend dev)'
        Write-Host '.\build.ps1 -Target tidy'
        Write-Host '.\build.ps1 -Target clean'
        Write-Host '.\build.ps1 -Target docker       build Docker image'
        Write-Host '.\build.ps1 -Target compose-up   docker compose up -d --build'
        Write-Host '.\build.ps1 -Target compose-down docker compose down'
        Write-Host ''
        Write-Host 'Note: Windows "make" is often Embarcadero MAKE, not GNU Make.'
    }
    'frontend' { Build-Frontend }
    'tidy' { go mod tidy }
    'clean' {
        if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
        Write-Host '[ok] cleaned dist' -ForegroundColor Green
    }
    'run' {
        Ensure-Dir $DevDataDir
        go run $MainPkg --data $DevDataDir
    }
    'dev' {
        $root = (Get-Location).Path
        Ensure-Dir $DevDataDir
        Write-Host ''
        Write-Host '[dev] 前端开发  : http://localhost:5173  (Vite HMR)' -ForegroundColor Green
        Write-Host '[dev] 后端 API  : http://localhost:3000  (Go)' -ForegroundColor Green
        Write-Host "[dev] 数据目录  : $DevDataDir (与 dist 二进制一致)" -ForegroundColor Green
        Write-Host '[dev] 提示     : 请访问 5173 端口，Vite 会自动代理 API 到 3000' -ForegroundColor Yellow
        Write-Host '[dev] 正在新窗口启动 Go 后端 (仅 API)...' -ForegroundColor Cyan
        Start-Process powershell -ArgumentList @(
            '-NoExit', '-Command',
            "Set-Location '$root'; Write-Host '[backend] Go API on :3000' -ForegroundColor Cyan; go run $MainPkg --dev --data '$DevDataDir'"
        ) | Out-Null
        Start-Sleep -Seconds 2
        Push-Location frontend
        try {
            if (-not (Test-Path node_modules)) { npm install }
            npm run dev
        } finally {
            Pop-Location
        }
    }
    'build' {
        Build-Frontend
        Build-Go -OutFile $AppName
    }
    'build-windows' {
        Build-Frontend
        Build-Go -OutFile $AppName -GoOS 'windows' -GoArch 'amd64'
    }
    'build-linux' {
        Write-Host '[build-linux] will npm run build then go:embed SPA' -ForegroundColor Yellow
        Build-Frontend
        Build-Go -OutFile "$AppName-linux-amd64" -GoOS 'linux' -GoArch 'amd64'
    }
    'build-darwin' {
        Build-Frontend
        Build-Go -OutFile "$AppName-darwin-arm64" -GoOS 'darwin' -GoArch 'arm64'
    }
    'build-all' {
        Build-Frontend
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
        if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }
        Write-Host '[ok] compose started' -ForegroundColor Green
    }
    'compose-down' {
        docker compose down
        if ($LASTEXITCODE -ne 0) { throw 'docker compose down failed' }
        Write-Host '[ok] compose stopped' -ForegroundColor Green
    }
}
