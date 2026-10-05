; SPDX-License-Identifier: MPL-2.0
; Supported MUI extension: explain the upstream checkbox without replacing
; Tauri's installer template. This notice does not change deletion behavior.
!define MUI_UNCONFIRMPAGE_TEXT_TOP "仅卸载程序，工程与设置始终保留。$\r$\n下方删除数据选项不生效。$\r$\n$\r$\nOnly the app is removed. Projects and settings are kept.$\r$\nThe delete-data checkbox below has no effect."

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
