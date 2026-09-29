$ErrorActionPreference = 'Stop'

$backend = Split-Path -Parent $PSScriptRoot
$server = Join-Path $backend 'data\grammar\runtime\llama-server.exe'
$model = Join-Path $backend 'data\grammar\model\qwen2.5-3b-instruct-q4_k_m.gguf'

if (-not (Test-Path -LiteralPath $server) -or -not (Test-Path -LiteralPath $model)) {
    throw 'Run backend/scripts/setup_grammar_model.ps1 first.'
}
if ((Get-Item -LiteralPath $model).Length -ne 2104932768) {
    throw 'The grammar model is incomplete. Run backend/scripts/setup_grammar_model.ps1 again.'
}

& $server --model $model --alias grammar-coach --host 127.0.0.1 --port 8081 --ctx-size 4096 --threads 4 --parallel 1 --no-ui
