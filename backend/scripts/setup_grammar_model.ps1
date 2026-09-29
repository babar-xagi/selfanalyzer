$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $backend 'data\grammar\runtime'
$modelDirectory = Join-Path $backend 'data\grammar\model'
$server = Join-Path $runtimeDirectory 'llama-server.exe'
$model = Join-Path $modelDirectory 'qwen2.5-3b-instruct-q4_k_m.gguf'
$runtimeUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b11249/llama-b11249-bin-win-cpu-x64.zip'
$modelUrl = 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/7dabda4d13d513e3e842b20f0d435c732f172cbe/qwen2.5-3b-instruct-q4_k_m.gguf'
$runtimeHash = 'BA0BEB2076250970C113B90C0E60611909BC1E7E973EE92A416756A64DD0763C'
$modelHash = '626B4A6678B86442240E33DF819E00132D3BA7DDDFE1CDC4FBB18E0A9615C62D'

New-Item -ItemType Directory -Path $runtimeDirectory, $modelDirectory -Force | Out-Null
if (-not (Test-Path -LiteralPath $server)) {
    $archive = Join-Path $backend '.tmp\llama-b11249-bin-win-cpu-x64.zip'
    New-Item -ItemType Directory -Path (Split-Path -Parent $archive) -Force | Out-Null
    if (-not (Test-Path -LiteralPath $archive)) {
        Invoke-WebRequest -Uri $runtimeUrl -OutFile $archive
    }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $runtimeHash) {
        throw 'Downloaded llama.cpp runtime failed SHA-256 verification.'
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $runtimeDirectory -Force
}

if (-not (Test-Path -LiteralPath $model)) {
    $partial = "$model.part"
    & curl.exe --location --fail --retry 3 --retry-delay 3 --continue-at - --output $partial $modelUrl
    if ($LASTEXITCODE -ne 0) { throw 'Grammar model download failed. Run this script again to resume.' }
    if ((Get-Item -LiteralPath $partial).Length -ne 2104932768) {
        throw 'Grammar model download is incomplete. Run this script again to resume.'
    }
    if ((Get-FileHash -LiteralPath $partial -Algorithm SHA256).Hash -ne $modelHash) {
        throw 'Downloaded grammar model failed SHA-256 verification.'
    }
    Move-Item -LiteralPath $partial -Destination $model
}
elseif ((Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash -ne $modelHash) {
    throw 'Existing grammar model failed SHA-256 verification.'
}

Write-Host "Grammar runtime: $server"
Write-Host "Grammar model: $model"
