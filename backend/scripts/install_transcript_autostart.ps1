$ErrorActionPreference = 'Stop'
$backend = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $backend '.venv\Scripts\pythonw.exe'
$runner = Join-Path $PSScriptRoot 'run_transcript_server.py'
if (-not (Test-Path -LiteralPath $python)) {
    throw 'Python backend is not installed. Follow the setup steps in README.md first.'
}
$command = '"' + $python + '" "' + $runner + '"'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
New-ItemProperty -Path $runKey -Name 'ConversationCoachTranscript' -PropertyType String -Value $command -Force | Out-Null
Write-Output 'Conversation Coach transcript server will start automatically when you sign in to Windows.'
