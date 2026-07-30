; Instala Ollama durante la instalación de ZENKAI.
; Sin Ollama no hay modelos locales, así que el instalador lo deja listo.
; OllamaSetup.exe viaja como extraResource ($INSTDIR\resources\ollama\OllamaSetup.exe)
; y se borra al terminar para no dejar ~900 MB ocupados.

!macro customInstall
  ; Si Ollama ya está instalado (per-user), no reinstalamos.
  IfFileExists "$LOCALAPPDATA\Programs\Ollama\ollama.exe" ollama_ya_esta 0
  IfFileExists "$INSTDIR\resources\ollama\OllamaSetup.exe" 0 ollama_sin_bundle
    DetailPrint "Instalando Ollama (motor de modelos locales)..."
    ExecWait '"$INSTDIR\resources\ollama\OllamaSetup.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART' $0
    DetailPrint "Ollama instalado (código $0)."
  ollama_sin_bundle:
  ollama_ya_esta:
  ; Liberar el instalador empacado, ya no hace falta.
  Delete "$INSTDIR\resources\ollama\OllamaSetup.exe"
  RMDir "$INSTDIR\resources\ollama"
!macroend
