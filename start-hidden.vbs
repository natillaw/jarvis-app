Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\\Users\\natha\\Music\\jarvis-app-fixed"
WshShell.Run """C:\\Program Files\\nodejs\\node.exe"" ""C:\\Users\\natha\\Music\\jarvis-app-fixed\\index.js""", 0, False
