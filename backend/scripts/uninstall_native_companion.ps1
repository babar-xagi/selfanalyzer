$key = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.conversationcoach.localapi'
Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction SilentlyContinue
Write-Output 'Conversation Coach native companion registration removed.'
