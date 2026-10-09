param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$backend = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$python = Join-Path $backend '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Install the Python backend in backend/.venv first.' }
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The Windows .NET Framework C# compiler was not found.' }
$source = Join-Path $backend 'native\ConversationCoachHost.cs'
$bin = Join-Path $backend 'native\bin'
New-Item -ItemType Directory -Path $bin -Force | Out-Null
$exe = Join-Path $bin 'ConversationCoachHost.exe'
& $compiler /nologo /target:exe /platform:x64 "/out:$exe" /r:System.Runtime.Serialization.dll $source
if ($LASTEXITCODE -ne 0) { throw 'The native companion did not compile.' }
$manifestPath = Join-Path $bin 'com.conversationcoach.localapi.json'
$manifest = @{
    name = 'com.conversationcoach.localapi'
    description = 'Conversation Coach local transcript server'
    path = $exe
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
} | ConvertTo-Json -Depth 3
[System.IO.File]::WriteAllText($manifestPath, $manifest, [System.Text.UTF8Encoding]::new($false))
$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.conversationcoach.localapi'
New-Item -Path $key -Force | Out-Null
Set-Item -Path $key -Value $manifestPath
Write-Output "Companion installed for extension $ExtensionId. It starts the API only while the recorder needs it."
