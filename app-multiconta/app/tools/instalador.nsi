; Instalador do PokeIdle Multi (Windows). Gerado com makensis a partir da pasta do electron-packager.
; Instala só para o usuário (sem pedir administrador). Rodar um instalador mais novo por cima
; atualiza o programa; logins e configurações (em %APPDATA%\PokeIdle Multi) ficam intactos.
;   makensis -DVERSAO=0.2.0 -DORIGEM="dist\PokeIdle Multi-win32-x64" -DSAIDA=Setup.exe tools\instalador.nsi
Unicode true
!include "MUI2.nsh"

!define NOME "PokeIdle Multi"
!define EXE "PokeIdle Multi.exe"
!define CHAVE "Software\Microsoft\Windows\CurrentVersion\Uninstall\PokeIdleMulti"

Name "${NOME} ${VERSAO}"
OutFile "${SAIDA}"
InstallDir "$LOCALAPPDATA\Programs\${NOME}"
InstallDirRegKey HKCU "${CHAVE}" "InstallLocation"
RequestExecutionLevel user
SetCompressor zlib
BrandingText "${NOME} ${VERSAO}"

!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o ${NOME} agora"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Programa"
  ; fecha o app se estiver aberto (atualização por cima)
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 800
  ; versão antiga sai inteira (menos os dados do usuário, que ficam em %APPDATA%)
  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  SetOutPath "$INSTDIR"
  File /r "${ORIGEM}/*.*"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  CreateDirectory "$SMPROGRAMS\${NOME}"
  CreateShortcut "$SMPROGRAMS\${NOME}\${NOME}.lnk" "$INSTDIR\${EXE}"
  CreateShortcut "$SMPROGRAMS\${NOME}\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"
  CreateShortcut "$DESKTOP\${NOME}.lnk" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${CHAVE}" "DisplayName" "${NOME}"
  WriteRegStr HKCU "${CHAVE}" "DisplayVersion" "${VERSAO}"
  WriteRegStr HKCU "${CHAVE}" "Publisher" "Murilo"
  WriteRegStr HKCU "${CHAVE}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${CHAVE}" "DisplayIcon" "$INSTDIR\${EXE}"
  WriteRegStr HKCU "${CHAVE}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKCU "${CHAVE}" "NoModify" 1
  WriteRegDWORD HKCU "${CHAVE}" "NoRepair" 1
SectionEnd

; Atualização automática: o app roda este instalador com /S (sem telas). Aí não existe a página
; final com "Abrir o PokeIdle Multi agora", então ele abre o app sozinho ao terminar.
Function .onInstSuccess
  IfSilent 0 +2
    Exec '"$INSTDIR\${EXE}"'
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 500
  RMDir /r "$INSTDIR"
  Delete "$DESKTOP\${NOME}.lnk"
  RMDir /r "$SMPROGRAMS\${NOME}"
  DeleteRegKey HKCU "${CHAVE}"
  ; logins e configurações ficam em %APPDATA%\${NOME} (apague à mão se quiser zerar tudo)
SectionEnd
