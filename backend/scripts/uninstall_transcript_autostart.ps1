$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
Remove-ItemProperty -Path $runKey -Name 'ConversationCoachTranscript' -ErrorAction SilentlyContinue
Write-Output 'Conversation Coach transcript auto-start removed.'
