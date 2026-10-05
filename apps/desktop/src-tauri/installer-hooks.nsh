; SPDX-License-Identifier: MPL-2.0
; Project data is not disposable application cache. Even a silent uninstall or
; an upgrade must retain it. A future explicit in-app data management flow can
; handle user-requested removal separately.
!macro NSIS_HOOK_PREUNINSTALL
  StrCpy $DeleteAppDataCheckboxState 0
!macroend

; Standard and blueprint installers must recognize the same owned directory.
!macro NSIS_HOOK_POSTINSTALL
  FileOpen $0 "$INSTDIR\.oid-install" w
  FileWrite $0 "Open Industrial Design installation v1$\n"
  FileClose $0
!macroend
